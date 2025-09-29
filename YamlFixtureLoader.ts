import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { faker } from '@faker-js/faker';

export interface FixtureDefinition {
    entity: string;
    data: any;
    references?: string[];
    processors?: string[];
    children?: { [key: string]: FixtureDefinition };
    existing?: boolean; // Flag to indicate this fixture references existing data
    query?: any; // Query criteria to find existing entity
}

export interface YamlFixtureConfig {
    fixtures: { [key: string]: FixtureDefinition };
}

export class YamlFixtureLoader {
  private fixturesCache: Map<string, YamlFixtureConfig> = new Map();
  private fixturesDir: string;

  constructor(fixturesDir: string = 'fixtures/yaml') {
    this.fixturesDir = path.resolve(fixturesDir);
  }

  /**
     * Get the fixtures directory path
     */
  getFixturesDir(): string {
    return this.fixturesDir;
  }

  /**
     * Load fixtures from YAML file
     */
  async loadFixtures(filename: string): Promise<YamlFixtureConfig> {
    const cacheKey = filename;

    if (this.fixturesCache.has(cacheKey)) {
      return this.fixturesCache.get(cacheKey)!;
    }

    const filePath = path.join(this.fixturesDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Fixture file not found: ${filePath}`);
    }

    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parsedYaml = yaml.load(fileContent) as any;

      // Process @includes directives first
      const processedYaml = await this.processIncludeDirectives(parsedYaml, filename);

      // If the processed YAML doesn't have a fixtures property, wrap it
      let config: YamlFixtureConfig;
      if (processedYaml && typeof processedYaml === 'object' && !processedYaml.fixtures) {
        config = { fixtures: processedYaml };
      } else {
        config = processedYaml as YamlFixtureConfig;
      }

      // Cache the parsed fixtures
      this.fixturesCache.set(cacheKey, config);

      return config;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse YAML fixture file ${filename}: ${errorMessage}`);
    }
  }

  /**
     * Process @includes directives in YAML files
     */
  private async processIncludeDirectives(yamlData: any, currentFilename: string, processedFiles: Set<string> = new Set()): Promise<any> {
    if (!yamlData || typeof yamlData !== 'object') {
      return yamlData;
    }

    // Add current file to processed files to prevent circular includes
    processedFiles.add(currentFilename);

    // Check for @includes directive
    if (yamlData['@includes']) {
      const includeFile = yamlData['@includes'];

      // Support both string and array formats
      let includeFiles: string[];
      if (typeof includeFile === 'string') {
        includeFiles = [includeFile];
      } else if (Array.isArray(includeFile)) {
        if (includeFile.some(f => typeof f !== 'string')) {
          throw new Error(`@includes directive array must contain only strings in ${currentFilename}`);
        }
        includeFiles = includeFile;
      } else {
        throw new Error(`@includes directive must be a string or array of strings, got ${typeof includeFile} in ${currentFilename}`);
      }

      // Initialize merged data with current file data (excluding @includes directive)
      const mergedData: any = { ...yamlData };
      delete mergedData['@includes'];

      // Process each include file and merge them sequentially
      for (const includeFile of includeFiles) {
        // Check for circular includes
        if (processedFiles.has(includeFile)) {
          throw new Error(`Circular include detected: ${includeFile} is already being processed in the chain starting from ${currentFilename}`);
        }

        // Load the included file
        const includedFilePath = path.join(this.fixturesDir, includeFile);
        if (!fs.existsSync(includedFilePath)) {
          throw new Error(`Included fixture file not found: ${includedFilePath}`);
        }

        const includedContent = fs.readFileSync(includedFilePath, 'utf8');
        const includedYaml = yaml.load(includedContent) as any;

        // Recursively process includes in the included file
        const processedIncludedYaml = await this.processIncludeDirectives(includedYaml, includeFile, new Set(processedFiles));

        // If the included file has @depends, also process those dependencies
        if (processedIncludedYaml && processedIncludedYaml['@depends']) {
          const dependsFiles = Array.isArray(processedIncludedYaml['@depends'])
            ? processedIncludedYaml['@depends']
            : [processedIncludedYaml['@depends']];

          for (const depFile of dependsFiles) {
            // Check for circular dependencies
            if (processedFiles.has(depFile)) {
              throw new Error(`Circular dependency detected: ${depFile} is already being processed in the chain starting from ${currentFilename}`);
            }

            // Load and process the dependency file
            const depFilePath = path.join(this.fixturesDir, depFile);
            if (fs.existsSync(depFilePath)) {
              const depContent = fs.readFileSync(depFilePath, 'utf8');
              const depYaml = yaml.load(depContent) as any;
              const processedDepYaml = await this.processIncludeDirectives(depYaml, depFile, new Set(processedFiles));

              // Merge dependency fixtures into the included file
              if (processedDepYaml && processedDepYaml.fixtures) {
                if (!processedIncludedYaml.fixtures) {
                  processedIncludedYaml.fixtures = {};
                }
                // Add dependency fixtures (don't override existing fixtures)
                Object.keys(processedDepYaml.fixtures).forEach(fixtureName => {
                  if (!processedIncludedYaml.fixtures[fixtureName]) {
                    processedIncludedYaml.fixtures[fixtureName] = processedDepYaml.fixtures[fixtureName];
                  }
                });
              }
            }
          }
        }

        // Merge the included data with current merged data
        if (processedIncludedYaml) {
          if (processedIncludedYaml.fixtures) {
            // Deep merge fixtures section - current file data overrides included data
            const includedFixtures = processedIncludedYaml.fixtures;
            const currentFixtures = mergedData.fixtures || {};

            // Start with included fixtures as base
            const mergedFixtures: any = { ...includedFixtures };

            // Deep merge each fixture that exists in both files
            Object.keys(currentFixtures).forEach(fixtureName => {
              if (includedFixtures[fixtureName]) {
                // Both files have this fixture - deep merge the data
                mergedFixtures[fixtureName] = {
                  ...includedFixtures[fixtureName],
                  ...currentFixtures[fixtureName]
                };

                // Special handling for the 'data' property - deep merge it
                if (includedFixtures[fixtureName].data && currentFixtures[fixtureName].data) {
                  mergedFixtures[fixtureName].data = {
                    ...includedFixtures[fixtureName].data,
                    ...currentFixtures[fixtureName].data
                  };
                }
              } else {
                // Only current file has this fixture
                mergedFixtures[fixtureName] = currentFixtures[fixtureName];
              }
            });

            mergedData.fixtures = mergedFixtures;

            // Merge other properties at root level from included file
            Object.keys(processedIncludedYaml).forEach(key => {
              if (key !== 'fixtures') {
                if (key === '@depends') {
                  // Special handling for @depends - merge and deduplicate
                  mergedData[key] = this.mergeDependencies(mergedData[key], processedIncludedYaml[key]);
                } else {
                  mergedData[key] = processedIncludedYaml[key];
                }
              }
            });
          } else {
            // If included data doesn't have fixtures property, merge at root level
            Object.keys(processedIncludedYaml).forEach(key => {
              if (key === 'fixtures') {
                const includedFixtures = processedIncludedYaml[key];
                const currentFixtures = mergedData.fixtures || {};

                // Start with included fixtures as base
                const mergedFixtures: any = { ...includedFixtures };

                // Deep merge each fixture that exists in both files
                Object.keys(currentFixtures).forEach(fixtureName => {
                  if (includedFixtures[fixtureName]) {
                    // Both files have this fixture - deep merge the data
                    mergedFixtures[fixtureName] = {
                      ...includedFixtures[fixtureName],
                      ...currentFixtures[fixtureName]
                    };

                    // Special handling for the 'data' property - deep merge it
                    if (includedFixtures[fixtureName].data && currentFixtures[fixtureName].data) {
                      mergedFixtures[fixtureName].data = {
                        ...includedFixtures[fixtureName].data,
                        ...currentFixtures[fixtureName].data
                      };
                    }
                  } else {
                    // Only current file has this fixture
                    mergedFixtures[fixtureName] = currentFixtures[fixtureName];
                  }
                });

                mergedData.fixtures = mergedFixtures;
              } else if (key === '@depends') {
                // Special handling for @depends - merge and deduplicate
                mergedData[key] = this.mergeDependencies(mergedData[key], processedIncludedYaml[key]);
              } else {
                mergedData[key] = processedIncludedYaml[key];
              }
            });
          }
        }
      }

      return mergedData;
    }

    return yamlData;
  }

  /**
     * Merge @depends directives from multiple sources with deduplication
     */
  private mergeDependencies(currentDepends: any, includedDepends: any): string | string[] {
    // Convert both to arrays for easier processing
    const currentArray: string[] = currentDepends
      ? (Array.isArray(currentDepends) ? currentDepends : [currentDepends])
      : [];
    const includedArray: string[] = includedDepends
      ? (Array.isArray(includedDepends) ? includedDepends : [includedDepends])
      : [];

    // Merge and deduplicate
    const merged = [...currentArray];
    for (const dep of includedArray) {
      if (!merged.includes(dep)) {
        merged.push(dep);
      }
    }

    // Return as string if only one dependency, otherwise return array
    if (merged.length === 0) {
      return undefined as any;
    } else if (merged.length === 1) {
      return merged[0];
    } else {
      return merged;
    }
  }

  /**
     * Process fixture data with references and placeholders
     */
  processFixtureData(data: any, context: any = {}): any {
    if (typeof data === 'string') {
      // Process references like @entity_name or placeholders like {faker.name}
      return this.processStringValue(data, context);
    }

    if (Array.isArray(data)) {
      return data.map(item => this.processFixtureData(item, context));
    }

    if (typeof data === 'object' && data !== null) {
      // First pass: process all non-reference values
      const processed: any = {};
      const contextWithData = { ...context, currentData: data };

      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string' && value.includes('{') && value.includes('[')) {
          // Defer processing of nested array references until first pass is done
          processed[key] = value;
        } else {
          processed[key] = this.processFixtureData(value, contextWithData);
        }
      }

      // Second pass: resolve any deferred nested array references
      const finalContext = { ...contextWithData, currentData: processed };
      for (const [key, value] of Object.entries(processed)) {
        if (typeof value === 'string' && value.includes('{') && value.includes('[')) {
          processed[key] = this.processStringValue(value, finalContext);
        }
      }

      return processed;
    }

    return data;
  }

  private processStringValue(value: string, context: any): any {
    // Handle references like @employee1
    if (value.startsWith('@') && context.references) {
      const refName = value.substring(1);
      if (context.references[refName]) {
        return context.references[refName];
      }
    }

    // Handle placeholders like {faker.email} or {env.BASE_URL}
    if (value.includes('{') && value.includes('}')) {
      // Check if the entire string is a single placeholder
      const singlePlaceholderMatch = value.match(/^\{([^}]+)\}$/);
      if (singlePlaceholderMatch) {
        // Return the resolved value directly (could be object, array, etc.)
        return this.resolvePlaceholder(singlePlaceholderMatch[1], context);
      } else {
        // Multiple placeholders or mixed content - do string replacement
        return value.replace(/\{([^}]+)\}/g, (match, placeholder) => {
          const resolved = this.resolvePlaceholder(placeholder, context);
          return typeof resolved === 'object' ? JSON.stringify(resolved) : resolved;
        });
      }
    }

    return value;
  }

  private resolvePlaceholder(placeholder: string, context: any): any {
    const parts = placeholder.split(/[:.]/);

    if (parts[0] === 'faker' || parts[0] === 'fake') {
      // Simple faker integration - can be extended
      return this.generateFakeData(parts.slice(1).join('.'));
    }

    if (parts[0] === 'env') {
      return process.env[parts[1]] || '';
    }

    if (parts[0] === 'context' && context.data) {
      const value = this.getNestedValue(context.data, parts.slice(1));
      return value === undefined ? 'undefined' : value;
    }

    // Handle nested array references like addresses[0].id
    if (placeholder.includes('[') && placeholder.includes(']')) {
      return this.resolveArrayReference(placeholder, context);
    }

    // Handle direct array references like "tags" or "categories"
    if (context[placeholder] && Array.isArray(context[placeholder])) {
      return context[placeholder];
    }

    return placeholder;
  }

  /**
     * Resolves array references like "addresses[0].id" or "categories[0]" within the current data context
     */
  private resolveArrayReference(placeholder: string, context: any): any {
    // Parse pattern like "addresses[0].id" or "categories[0]"
    const matchWithProperty = placeholder.match(/^([^[]+)\[(\d+)\]\.(.+)$/);
    const matchSimple = placeholder.match(/^([^[]+)\[(\d+)\]$/);

    let arrayName: string;
    let index: number;
    let propertyPath: string | undefined;

    if (matchWithProperty) {
      [, arrayName, , propertyPath] = matchWithProperty;
      index = parseInt(matchWithProperty[2], 10);
    } else if (matchSimple) {
      [, arrayName] = matchSimple;
      index = parseInt(matchSimple[2], 10);
    } else {
      return placeholder;
    }

    // Try to resolve from root context first
    if (context[arrayName] && Array.isArray(context[arrayName])) {
      const arrayItem = context[arrayName][index];
      if (arrayItem !== undefined) {
        if (propertyPath) {
          return this.getNestedValue(arrayItem, propertyPath.split('.'));
        } else {
          return arrayItem;
        }
      }
    }

    // Try to resolve from current data being processed
    if (context.currentData && context.currentData[arrayName] && Array.isArray(context.currentData[arrayName])) {
      const arrayItem = context.currentData[arrayName][index];
      if (arrayItem !== undefined) {
        if (propertyPath) {
          return this.getNestedValue(arrayItem, propertyPath.split('.'));
        } else {
          return arrayItem;
        }
      }
    }

    return placeholder;
  }

  private generateFakeData(type: string): any {
    // Supporto per i tipi più comuni con alias
    switch (type) {
    // Person data
    case 'email':
    case 'internet.email':
      return faker.internet.email();
    case 'firstName':
    case 'person.firstName':
      return faker.person.firstName();
    case 'lastName':
    case 'person.lastName':
      return faker.person.lastName();
    case 'fullName':
    case 'person.fullName':
      return faker.person.fullName();
    case 'username':
    case 'internet.userName':
      return faker.internet.username();
    case 'password':
    case 'internet.password':
      return faker.internet.password();

      // Company data
    case 'company':
    case 'company.name':
      return faker.company.name();
    case 'jobTitle':
    case 'job_title':
    case 'person.jobTitle':
      return faker.person.jobTitle();

      // Address data
    case 'address':
    case 'street':
    case 'location.streetAddress':
      return faker.location.streetAddress();
    case 'city':
    case 'location.city':
      return faker.location.city();
    case 'zipCode':
    case 'zipcode':
    case 'location.zipCode':
      return faker.location.zipCode();
    case 'country':
    case 'location.country':
      return faker.location.country();
    case 'state':
    case 'location.state':
      return faker.location.state();

      // Phone and communication
    case 'phone':
    case 'phone.number':
      return faker.phone.number();
    case 'url':
    case 'internet.url':
      return faker.internet.url();
    case 'alphanumeric':
    case 'string.alphanumeric':
      return faker.string.alphanumeric();

      // IDs and unique values
    case 'uuid':
    case 'string.uuid':
      return faker.string.uuid().replace(/-/g, '');
    case 'slug':
    case 'string.slug':
      return faker.helpers.slugify(faker.lorem.words(3));

      // Numbers
    case 'number':
    case 'number.int':
      return faker.number.int({ min: 1, max: 1000 });
    case 'float':
    case 'number.float':
      return faker.number.float({ min: 0, max: 100, fractionDigits: 2 });
    case 'price':
      return faker.commerce.price();

      // Boolean
    case 'boolean':
    case 'datatype.boolean':
      return faker.datatype.boolean();

      // Date and time
    case 'date':
    case 'date.recent':
      return faker.date.recent().toISOString();
    case 'date_past':
    case 'date.past':
      return faker.date.past().toISOString();
    case 'futureDate':
    case 'date_future':
    case 'date.future':
      return faker.date.future().toISOString();
    case 'birthdate':
    case 'date.birthdate':
      return faker.date.birthdate().toISOString();

      // Text content
    case 'word':
    case 'lorem.word':
      return faker.lorem.word();
    case 'words':
    case 'lorem.words':
      return faker.lorem.words();
    case 'sentence':
    case 'lorem.sentence':
      return faker.lorem.sentence();
    case 'paragraph':
    case 'lorem.paragraph':
      return faker.lorem.paragraph();
    case 'text':
    case 'lorem.text':
      return faker.lorem.text();

      // Commerce
    case 'product':
    case 'commerce.productName':
      return faker.commerce.productName();
    case 'department':
    case 'commerce.department':
      return faker.commerce.department();
    case 'product_description':
    case 'commerce.productDescription':
      return faker.commerce.productDescription();

      // Finance
    case 'iban':
    case 'finance.iban':
      return faker.finance.iban();
    case 'credit_card':
    case 'finance.creditCardNumber':
      return faker.finance.creditCardNumber();

      // Italian specific data
    case 'italianTaxNumber':
    case 'it_tax_number':
      return this.generateItalianTaxNumber();
    case 'italianVATNumber':
    case 'it_vat_number':
      return this.generateItalianVATNumber();
    case 'it_postal_code':
      return faker.string.numeric(5);

    default:
      // Fallback per tipi non riconosciuti
      return `fake_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  /**
     * Genera un codice fiscale italiano fittizio
     */
  private generateItalianTaxNumber(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';

    let taxNumber = '';

    // 6 lettere per nome e cognome
    for (let i = 0; i < 6; i++) {
      taxNumber += letters[Math.floor(Math.random() * letters.length)];
    }

    // 2 cifre per l'anno
    taxNumber += numbers[Math.floor(Math.random() * numbers.length)];
    taxNumber += numbers[Math.floor(Math.random() * numbers.length)];

    // 1 lettera per il mese
    taxNumber += letters[Math.floor(Math.random() * letters.length)];

    // 2 cifre per il giorno
    taxNumber += numbers[Math.floor(Math.random() * numbers.length)];
    taxNumber += numbers[Math.floor(Math.random() * numbers.length)];

    // 4 caratteri alfanumerici finali (codice comune + controllo)
    const alphanumeric = letters + numbers;
    for (let i = 0; i < 4; i++) {
      taxNumber += alphanumeric[Math.floor(Math.random() * alphanumeric.length)];
    }

    return taxNumber;
  }

  /**
     * Genera una partita IVA italiana fittizia
     */
  private generateItalianVATNumber(): string {
    // Partita IVA italiana: IT + 11 cifre
    let vatNumber = 'IT';
    for (let i = 0; i < 11; i++) {
      vatNumber += Math.floor(Math.random() * 10).toString();
    }
    return vatNumber;
  }

  private getNestedValue(obj: any, path: string[]): any {
    return path.reduce((current, key) => current?.[key], obj);
  }
}
