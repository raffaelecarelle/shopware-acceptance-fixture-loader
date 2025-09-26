import {YamlFixtureLoader, FixtureDefinition} from './YamlFixtureLoader';
import {CircularReferenceResolver} from './CircularReferenceResolver';

export class YamlFixtureProcessor {
    private loader: YamlFixtureLoader;
    private createdEntities: Map<string, any> = new Map();
    private references: Map<string, any> = new Map();

    constructor(fixturesDir?: string) {
        this.loader = new YamlFixtureLoader(fixturesDir);
    }

    /**
     * Load and process fixtures from YAML file with circular reference support
     */
    async processFixtures(
        filename: string,
        adminApiContext: any,
        systemData: { [key: string]: any } = {}
    ): Promise<{ [key: string]: any }> {
        const fixtureConfig = await this.loader.loadFixtures(filename);

        // Add system data to references (salutations, countries, etc.)
        Object.entries(systemData).forEach(([key, value]) => {
            this.references.set(key, value);
        });

        // Expand multi-insertion fixtures (e.g., business_partner_{1...10})
        const expandedFixtures = this.expandMultiInsertionFixtures(fixtureConfig.fixtures);

        const results: { [key: string]: any } = {};

        // Use circular reference resolver for processing
        const resolver = new CircularReferenceResolver(this.references);
        const processingPlan = resolver.createProcessingPlan(expandedFixtures);

        for (const processingEntity of processingPlan) {
            if (processingEntity.fixture.existing) {
                // Handle existing entities
                const entity = await this.findExistingEntity(
                    processingEntity.fixture,
                    adminApiContext,
                    {references: Object.fromEntries(this.references), data: {}}
                );

                // If there's update data, apply it
                if (processingEntity.fixture.data) {
                    const context = {references: Object.fromEntries(this.references), data: {}};
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
            } else {
                // Create new entities with initial data (excluding circular references)
                const context = {references: Object.fromEntries(this.references), data: {}};
                const initialData = resolver.getInitialData(processingEntity, context);
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
        const response = await adminApiContext.post(endpoint, {
            data: data,
        });

        if (!response.ok()) {
            throw new Error(`Failed to create ${entityType}: ${await response.text()}`);
        }

        try {
            const result = await response.json();
            return result.data
        } catch (error) {
            return data;
        }
    }

    /**
     * Clean up created entities
     */
    async cleanup(adminApiContext: any): Promise<void> {
        // Cleanup in reverse order
        const entities = Array.from(this.createdEntities.entries()).reverse();

        for (const [name, entity] of entities) {
            try {
                // Determine cleanup endpoint based on entity type
                const endpoint = this.getCleanupEndpoint(name);
                if (endpoint && entity.id) {
                    await adminApiContext.delete(`${endpoint}/${entity.id}`);
                }
            } catch (error) {
                console.warn(`Failed to cleanup fixture ${name}:`, error);
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

        try {
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
        } catch (error) {
            console.error(`Error updating ${entityType}:`, error);
            throw error;
        }
    }
}
