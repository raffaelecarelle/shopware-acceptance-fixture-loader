import { YamlFixtureLoader, FixtureDefinition } from './YamlFixtureLoader';
import { CircularReferenceResolver } from './CircularReferenceResolver';

export class YamlFixtureProcessor {
  private loader: YamlFixtureLoader;
  private createdEntities: Map<string, any> = new Map();
  private references: Map<string, any> = new Map();

  constructor(fixturesDir?: string) {
    this.loader = new YamlFixtureLoader(fixturesDir);
  }

  /**
     * Load and process fixtures from YAML file(s) with circular reference support
     */
  async processFixtures(
    filename: string | string[],
    adminApiContext: any,
    systemData: { [key: string]: any } = {},
    processedDependencies: Set<string> = new Set()
  ): Promise<{ [key: string]: any }> {
    // Handle array of filenames
    if (Array.isArray(filename)) {
      let mergedResults: { [key: string]: any } = {};
      
      for (const file of filename) {
        const fileResults = await this.processFixtures(file, adminApiContext, systemData, processedDependencies);
        mergedResults = { ...mergedResults, ...fileResults };
      }
      
      return mergedResults;
    }

    // Process single file (existing logic)
    // Check for @depends directive and process dependencies first
    const dependencyResults = await this.processDependencies(filename, adminApiContext, systemData, processedDependencies);

    const fixtureConfig = await this.loader.loadFixtures(filename);

    // Add system data to references (salutations, countries, etc.)
    Object.entries(systemData).forEach(([key, value]) => {
      this.references.set(key, value);
    });

    // Expand multi-insertion fixtures (e.g., business_partner_{1...10})
    const expandedFixtures = this.expandMultiInsertionFixtures(fixtureConfig.fixtures);

    // Start with dependency results
    const results: { [key: string]: any } = { ...dependencyResults };

    // Use circular reference resolver for processing
    const resolver = new CircularReferenceResolver(this.references);
    const processingPlan = resolver.createProcessingPlan(expandedFixtures);

    for (const processingEntity of processingPlan) {
      if (processingEntity.fixture.existing) {
        // Handle existing entities
        const entity = await this.findExistingEntity(
          processingEntity.fixture,
          adminApiContext,
          { references: Object.fromEntries(this.references), data: {} }
        );

        // If there's update data, apply it
        if (processingEntity.fixture.data) {
          const context = { references: Object.fromEntries(this.references), data: {} };
          const updateData = this.loader.processFixtureData(processingEntity.fixture.data, context);
          await this.updateEntity(
            processingEntity.fixture.entity,
            entity.id,
            updateData,
            adminApiContext
          );
        }

        processingEntity.entity = entity;
        processingEntity.phase = 'created';
        results[processingEntity.name] = entity;
        this.references.set(processingEntity.name, entity.id);
        this.createdEntities.set(processingEntity.name, entity.id);
      } else {
        // Create new entities with initial data (excluding circular references)
        const context = { references: Object.fromEntries(this.references), data: {} };
        const initialData = resolver.getInitialData(processingEntity);
        const processedData = this.loader.processFixtureData(initialData, context);

        const entity = await this.createGenericEntity(
          processingEntity.fixture.entity,
          processedData,
          adminApiContext
        );
        processingEntity.entity = entity;
        processingEntity.phase = 'created';
        results[processingEntity.name] = entity;
        this.references.set(processingEntity.name, entity.id);
        this.createdEntities.set(processingEntity.name, entity.id);
      }
    }

    // Phase 2: Update entities with circular reference fields
    for (const processingEntity of processingPlan) {
      if (processingEntity.phase === 'created') {
        const deferredUpdates = resolver.getDeferredUpdates(processingEntity);
        if (deferredUpdates && Object.keys(deferredUpdates).length > 0) {
          await this.updateEntity(
            processingEntity.fixture.entity,
            processingEntity.entity.id,
            deferredUpdates,
            adminApiContext
          );
          processingEntity.phase = 'updated';
        }
      }
    }

    return results;
  }

  /**
     * Process @depends directives and ensure dependencies are processed first
     */
  private async processDependencies(
    filename: string | string[],
    adminApiContext: any,
    systemData: { [key: string]: any } = {},
    processedDependencies: Set<string> = new Set()
  ): Promise<{ [key: string]: any }> {
    // Handle array of filenames
    if (Array.isArray(filename)) {
      let mergedResults: { [key: string]: any } = {};
      
      for (const file of filename) {
        const fileResults = await this.processDependencies(file, adminApiContext, systemData, processedDependencies);
        mergedResults = { ...mergedResults, ...fileResults };
      }

      return mergedResults;
    }

    // Process single file (existing logic)
    // Add current file to processed dependencies to prevent circular dependencies
    if (processedDependencies.has(filename)) {
      throw new Error(`Circular dependency detected: ${filename} is already being processed`);
    }

    processedDependencies.add(filename);

    try {
      // Load the raw YAML content to check for @depends directive
      const filePath = require('path').join(this.loader.getFixturesDir(), filename);
      if (!require('fs').existsSync(filePath)) {
        // If file doesn't exist, return empty result (might be in test/mock environment)
        return {};
      }

      const fileContent = require('fs').readFileSync(filePath, 'utf8');
      const parsedYaml = require('js-yaml').load(fileContent) as any;

      if (parsedYaml && parsedYaml['@depends']) {
        const dependsFile = parsedYaml['@depends'];
        
        // Support both string and array formats
        let dependsFiles: string[];
        if (typeof dependsFile === 'string') {
          dependsFiles = [dependsFile];
        } else if (Array.isArray(dependsFile)) {
          if (dependsFile.some(f => typeof f !== 'string')) {
            throw new Error(`@depends directive array must contain only strings in ${filename}`);
          }
          dependsFiles = dependsFile;
        } else {
          throw new Error(`@depends directive must be a string or array of strings, got ${typeof dependsFile} in ${filename}`);
        }

        // Process all dependency files and merge their results
        let mergedResults: { [key: string]: any } = {};
        
        for (const depFile of dependsFiles) {
          // Check for circular dependencies
          if (processedDependencies.has(depFile)) {
            throw new Error(`Circular dependency detected: ${depFile} is already being processed in the chain starting from ${filename}`);
          }

          // Recursively process the dependent fixture and merge its results
          const depResults = await this.processFixtures(depFile, adminApiContext, systemData, new Set(processedDependencies));
          mergedResults = { ...mergedResults, ...depResults };
        }
        
        return mergedResults;
      }

      return {};
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to process dependencies for ${filename}: ${String(error)}`);
    }
  }

  /**
     * Expand multi-insertion fixtures (e.g., business_partner_{1...10})
     */
  private expandMultiInsertionFixtures(fixtures: { [key: string]: FixtureDefinition }): { [key: string]: FixtureDefinition } {
    const expandedFixtures: { [key: string]: FixtureDefinition } = {};

    for (const [key, fixture] of Object.entries(fixtures)) {
      const rangeMatch = key.match(/^(.+)_\{(\d+)\.\.\.(\d+)\}$/);

      if (rangeMatch) {
        // Extract base name and range
        const baseName = rangeMatch[1];
        const startNum = parseInt(rangeMatch[2]);
        const endNum = parseInt(rangeMatch[3]);

        // Create individual fixtures for each number in range
        for (let i = startNum; i <= endNum; i++) {
          const expandedKey = `${baseName}_${i}`;
          expandedFixtures[expandedKey] = {
            ...fixture,
            data: fixture.data ? JSON.parse(JSON.stringify(fixture.data)) : undefined
          };
        }
      } else {
        // Keep original fixture as-is
        expandedFixtures[key] = fixture;
      }
    }

    return expandedFixtures;
  }

  /**
     * Convert snake_case to kebab-case for API endpoints
     */
  private snakeToKebab(str: string): string {
    return str.replace(/_/g, '-');
  }

  /**
     * Get the API endpoint for an entity type
     */
  private getEntityEndpoint(entityType: string): string {
    const kebabCase = this.snakeToKebab(entityType);

    return `./${kebabCase}`;
  }


  /**
     * Find existing entity by query criteria
     */
  private async findExistingEntity(
    fixture: FixtureDefinition,
    adminApiContext: any,
    context: any
  ): Promise<any> {
    const endpoint = this.getEntityEndpoint(fixture.entity);

    // Process query criteria with references and placeholders
    const processedQuery = fixture.query
      ? this.loader.processFixtureData(fixture.query, context)
      : this.loader.processFixtureData(fixture.data, context);

    // Build query parameters for the GET request
    const queryParams = new URLSearchParams();

    // Convert query object to search parameters
    Object.entries(processedQuery).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        queryParams.append(`filter[${key}]`, String(value));
      }
    });

    const searchUrl = `${endpoint}?${queryParams.toString()}`;
    const response = await adminApiContext.get(searchUrl);

    if (!response.ok()) {
      throw new Error(`Failed to find existing ${fixture.entity}: ${await response.text()}`);
    }

    const result = await response.json();


    if (!result.data || result.data.length === 0) {
      throw new Error(`No existing ${fixture.entity} found matching criteria: ${JSON.stringify(processedQuery)}`);
    }

    // Return the first matching entity
    return result.data[0];
  }

  /**
     * Generic entity creation method
     */
  private async createGenericEntity(entityType: string, data: any, adminApiContext: any): Promise<any> {
    const endpoint = this.getEntityEndpoint(entityType);
    console.log(endpoint);
    const response = await adminApiContext.post(endpoint, {
      data: data
    });
    if (!response.ok()) {
      throw new Error(`Failed to create ${entityType}: ${await response.text()}`);
    }

    try {
      const result = await response.json();
      return result.data;
    } catch {
      return data;
    }
  }

  /**
     * Clean up created entities
     */
  async cleanup(adminApiContext: any): Promise<void> {
    // Cleanup in reverse order
    const entities = Array.from(this.createdEntities.entries()).reverse();

    for (const [name, entityId] of entities) {
      try {
        // Determine cleanup endpoint based on entity type
        const endpoint = this.getCleanupEndpoint(name);
        if (endpoint && entityId) {
          await adminApiContext.delete(`${endpoint}/${entityId}`);
        }
      } catch {
        // Silently ignore cleanup failures
      }
    }

    this.createdEntities.clear();
    this.references.clear();
  }

  private getCleanupEndpoint(entityName: any): string | null {
    return this.getEntityEndpoint(entityName);
  }

  /**
     * Updates an existing entity with new data (used for circular references)
     */
  private async updateEntity(
    entityType: string,
    entityId: string,
    updateData: { [key: string]: any },
    adminApiContext: any
  ): Promise<any> {
    const endpoint = this.getEntityEndpoint(entityType);

    const response = await adminApiContext.patch(`${endpoint}/${entityId}`, {
      data: updateData
    });

    if (response.ok()) {
      const responseData = await response.json();
      return responseData.data || responseData;
    } else {
      const errorText = await response.text();
      throw new Error(`Failed to update ${entityType} with ID ${entityId}: ${response.status()} ${errorText}`);
    }
  }
}
