import * as fs from 'fs';
import * as path from 'path';
import { YamlFixtureLoader } from '../YamlFixtureLoader';
import { CircularReferenceResolver } from '../CircularReferenceResolver';
import { YamlFixtureProcessor } from '../YamlFixtureProcessor';
import { TEST_FIXTURES_DIR } from './setup';

describe('Integration Tests', () => {
  let testFixturesDir: string;
  let loader: YamlFixtureLoader;
  let processor: YamlFixtureProcessor;

  beforeEach(() => {
    testFixturesDir = path.join(TEST_FIXTURES_DIR, 'integration');
    if (!fs.existsSync(testFixturesDir)) {
      fs.mkdirSync(testFixturesDir, { recursive: true });
    }
    loader = new YamlFixtureLoader(testFixturesDir);
    processor = new YamlFixtureProcessor(testFixturesDir);
  });

  afterEach(() => {
    if (fs.existsSync(testFixturesDir)) {
      fs.rmSync(testFixturesDir, { recursive: true, force: true });
    }
  });

  describe('YamlFixtureLoader + CircularReferenceResolver Integration', () => {
    it('should handle circular references between entities', () => {
      // Create test YAML with circular references
      const yamlContent = `
user1:
  count: 1
  data:
    name: "John Doe"
    email: "john@example.com"
    bestFriendId: "@user2"

user2:
  count: 1
  data:
    name: "Jane Smith"
    email: "jane@example.com"
    bestFriendId: "@user1"
      `;

      const testFile = path.join(testFixturesDir, 'circular.yml');
      fs.writeFileSync(testFile, yamlContent);

      // Load fixtures
      const fixtures = loader.loadFixtures('circular.yml');
      expect(Object.keys(fixtures)).toHaveLength(2);

      // Set up circular reference resolver
      const references = new Map<string, any>();
      const resolver = new CircularReferenceResolver(references);
      
      // Create processing plan
      const plan = resolver.createProcessingPlan(fixtures);
      expect(plan).toHaveLength(2);

      // Verify circular references are detected
      const deferredCount = plan.reduce((sum, entity) => sum + entity.deferredFields.size, 0);
      expect(deferredCount).toBeGreaterThan(0);

      // Simulate entity creation and reference resolution
      references.set('user1', { id: 'user1-id', name: 'John Doe' });
      references.set('user2', { id: 'user2-id', name: 'Jane Smith' });

      // Test deferred updates
      const entityWithDeferred = plan.find(e => e.deferredFields.size > 0);
      if (entityWithDeferred) {
        const deferredUpdates = resolver.getDeferredUpdates(entityWithDeferred);
        expect(Object.keys(deferredUpdates).length).toBeGreaterThan(0);
      }
    });

    it('should process complex fixture with placeholders and fake data', () => {
      const yamlContent = `
customer1:
  count: 1
  data:
    firstName: "{{fake:firstName}}"
    lastName: "{{fake:lastName}}"
    email: "{{fake:email}}"
    phone: "{{fake:phone}}"
    company: "{{fake:company}}"
    address:
      street: "{{fake:address}}"
      city: "{{fake:city}}"
      zipCode: "{{fake:zipCode}}"
      country: "{{fake:country}}"
    profile:
      bio: "Professional {{fake:jobTitle}} with experience"
      taxNumber: "{{fake:italianTaxNumber}}"
      vatNumber: "{{fake:italianVATNumber}}"

product1:
  count: 2
  data:
    name: "Product {{index}}"
    price: "{{fake:number}}"
    active: "{{fake:boolean}}"
    createdAt: "{{fake:date}}"
    availableFrom: "{{fake:futureDate}}"
    description: "High quality product from {{fake:company}}"
      `;

      const testFile = path.join(testFixturesDir, 'complex.yml');
      fs.writeFileSync(testFile, yamlContent);

      const fixtures = loader.loadFixtures('complex.yml');
      
      // Process fixture data with context
      const context = { systemData: {} };
      const processedCustomer = loader.processFixtureData(fixtures.customer1.data, context);
      const processedProduct = loader.processFixtureData(fixtures.product1.data, context);

      // Verify fake data generation
      expect(typeof processedCustomer.firstName).toBe('string');
      expect(processedCustomer.firstName.length).toBeGreaterThan(0);
      expect(typeof processedCustomer.email).toBe('string');
      expect(processedCustomer.email).toMatch(/^[\w\.-]+@[\w\.-]+\.\w+$/);
      
      // Verify Italian tax/VAT number format
      expect(processedCustomer.profile.taxNumber).toMatch(/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/);
      expect(processedCustomer.profile.vatNumber).toMatch(/^\d{11}$/);

      // Verify nested processing
      expect(typeof processedCustomer.address.city).toBe('string');
      expect(processedCustomer.address.city.length).toBeGreaterThan(0);

      // Verify different data types
      expect(typeof processedProduct.price).toBe('number');
      expect(typeof processedProduct.active).toBe('boolean');
    });

    it('should handle array references and nested object resolution', () => {
      const yamlContent = `
categories:
  - name: "Electronics"
  - name: "Books"
  - name: "Clothing"

tags:
  - name: "Popular"
  - name: "New"

product1:
  count: 1
  data:
    name: "Laptop"
    categoryName: "{{categories[0].name}}"
    primaryTag: "{{tags[0].name}}"
    secondaryTag: "{{tags[1].name}}"
    metadata:
      category: "{{categories[0]}}"
      allTags: "{{tags}}"
      categoryCount: "{{categories.length}}"
      description: "Product in {{categories[0].name}} category with {{tags[0].name}} tag"
      `;

      const testFile = path.join(testFixturesDir, 'arrays.yml');
      fs.writeFileSync(testFile, yamlContent);

      const fixtures = loader.loadFixtures('arrays.yml');
      
      const context = {
        categories: [
          { name: 'Electronics' },
          { name: 'Books' },
          { name: 'Clothing' }
        ],
        tags: [
          { name: 'Popular' },
          { name: 'New' }
        ]
      };

      const processedProduct = loader.processFixtureData(fixtures.product1.data, context);

      expect(processedProduct.categoryName).toBe('Electronics');
      expect(processedProduct.primaryTag).toBe('Popular');
      expect(processedProduct.secondaryTag).toBe('New');
      expect(processedProduct.metadata.category).toEqual({ name: 'Electronics' });
      expect(processedProduct.metadata.allTags).toEqual([
        { name: 'Popular' },
        { name: 'New' }
      ]);
      expect(processedProduct.metadata.description).toBe('Product in Electronics category with Popular tag');
    });
  });

  describe('Full Workflow Integration', () => {
    it('should handle complete fixture processing with all components', async () => {
      const yamlContent = `
customer1:
  entityType: customer
  count: 1
  findBy:
    email: "john@example.com"
  data:
    firstName: "John"
    lastName: "Doe"
    email: "john@example.com"
    company: "{{fake:company}}"
    phone: "{{fake:phone}}"

address1:
  entityType: customer_address
  count: 1
  data:
    customerId: "@customer1"
    street: "{{fake:address}}"
    city: "{{fake:city}}"
    zipCode: "{{fake:zipCode}}"
    country: "{{fake:country}}"

order1:
  entityType: order
  count: 1
  data:
    customerId: "@customer1"
    orderNumber: "ORDER-{{fake:uuid}}"
    status: "open"
    billingAddressId: "@address1"
    shippingAddressId: "@address1"
    
orderLineItem1:
  entityType: order_line_item
  count: 2
  data:
    orderId: "@order1"
    productId: "product-{{index}}"
    quantity: "{{fake:number}}"
    price: "{{fake:number}}"
      `;

      const testFile = path.join(testFixturesDir, 'workflow.yml');
      fs.writeFileSync(testFile, yamlContent);

      // Mock admin API context
      const mockAdminApiContext = {
        get: jest.fn().mockResolvedValue({ data: [] }), // No existing entities
        post: jest.fn().mockImplementation((endpoint, data) => {
          return Promise.resolve({
            data: {
              id: `${endpoint}-${Math.random().toString(36).substr(2, 9)}`,
              ...data
            }
          });
        }),
        patch: jest.fn().mockImplementation((endpoint, data) => {
          return Promise.resolve({
            data: {
              id: endpoint.split('/')[1],
              ...data
            }
          });
        })
      };

      // Mock system data
      const mockSystemData = {
        currencies: [{ id: 'currency-1', isoCode: 'EUR' }],
        languages: [{ id: 'language-1', locale: { code: 'en-GB' } }]
      };

      // Process fixtures
      const result = await processor.processFixtures('workflow.yml', mockAdminApiContext, mockSystemData);

      // Verify all entities were created
      expect(result).toBeDefined();
      expect(result.customer1).toBeDefined();
      expect(result.address1).toBeDefined();
      expect(result.order1).toBeDefined();
      expect(result.orderLineItem1_1).toBeDefined();
      expect(result.orderLineItem1_2).toBeDefined();

      // Verify API calls were made
      expect(mockAdminApiContext.get).toHaveBeenCalled(); // findBy calls
      expect(mockAdminApiContext.post).toHaveBeenCalled(); // entity creation
      expect(mockAdminApiContext.patch).toHaveBeenCalled(); // deferred updates

      // Verify entity relationships
      expect(result.customer1.id).toBeDefined();
      expect(result.address1.customerId).toBe(result.customer1.id);
      expect(result.order1.customerId).toBe(result.customer1.id);
      expect(result.orderLineItem1_1.orderId).toBe(result.order1.id);
      expect(result.orderLineItem1_2.orderId).toBe(result.order1.id);
    }, 10000); // Increase timeout for complex test

    it('should handle cleanup of created entities', async () => {
      // This test would verify cleanup functionality
      // For now, we'll just test that cleanup doesn't throw
      const mockAdminApiContext = {
        delete: jest.fn().mockResolvedValue({})
      };

      await expect(processor.cleanup(mockAdminApiContext))
        .resolves.not.toThrow();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle malformed YAML gracefully', () => {
      const invalidYamlContent = `
invalid yaml content:
  - missing quotes
  - [unclosed bracket
  - invalid: structure: here
      `;

      const testFile = path.join(testFixturesDir, 'invalid.yml');
      fs.writeFileSync(testFile, invalidYamlContent);

      expect(() => loader.loadFixtures('invalid.yml')).toThrow();
    });

    it('should handle missing references gracefully', () => {
      const yamlContent = `
order1:
  count: 1
  data:
    customerId: "@nonexistentCustomer"
    orderNumber: "ORDER-001"
      `;

      const testFile = path.join(testFixturesDir, 'missing-refs.yml');
      fs.writeFileSync(testFile, yamlContent);

      const fixtures = loader.loadFixtures('missing-refs.yml');
      const processedData = loader.processFixtureData(fixtures.order1.data, {});

      // Should keep placeholder as-is when reference is missing
      expect(processedData.customerId).toBe('@nonexistentCustomer');
    });

    it('should handle deeply nested circular references', () => {
      const yamlContent = `
user1:
  count: 1
  data:
    name: "User 1"
    profile:
      friends:
        best: "@user2"
        secondary: "@user3"

user2:
  count: 1
  data:
    name: "User 2"
    profile:
      friends:
        best: "@user3"
        secondary: "@user1"

user3:
  count: 1
  data:
    name: "User 3"
    profile:
      friends:
        best: "@user1"
        secondary: "@user2"
      `;

      const testFile = path.join(testFixturesDir, 'deep-circular.yml');
      fs.writeFileSync(testFile, yamlContent);

      const fixtures = loader.loadFixtures('deep-circular.yml');
      const references = new Map<string, any>();
      const resolver = new CircularReferenceResolver(references);
      
      const plan = resolver.createProcessingPlan(fixtures);
      
      expect(plan).toHaveLength(3);
      
      // Should detect circular references in nested structures
      const totalDeferredFields = plan.reduce((sum, entity) => sum + entity.deferredFields.size, 0);
      expect(totalDeferredFields).toBeGreaterThan(0);
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large fixture files efficiently', () => {
      const startTime = Date.now();
      
      // Generate large fixture data
      const fixtures: any = {};
      for (let i = 1; i <= 100; i++) {
        fixtures[`user${i}`] = {
          count: 1,
          data: {
            name: `User ${i}`,
            email: `user${i}@example.com`,
            friends: i > 1 ? [`@user${i-1}`] : [],
            metadata: {
              index: i,
              description: `This is user number ${i}`,
              tags: [`tag${i}`, `category${i % 10}`]
            }
          }
        };
      }

      const yamlContent = Object.entries(fixtures)
        .map(([key, value]) => `${key}:\n  count: ${(value as any).count}\n  data:\n    name: "${(value as any).data.name}"\n    email: "${(value as any).data.email}"`)
        .join('\n\n');

      const testFile = path.join(testFixturesDir, 'large.yml');
      fs.writeFileSync(testFile, yamlContent);

      const loadedFixtures = loader.loadFixtures('large.yml');
      const processingTime = Date.now() - startTime;

      expect(Object.keys(loadedFixtures)).toHaveLength(100);
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle empty and null values correctly', () => {
      const yamlContent = `
entity1:
  count: 1
  data:
    name: ""
    description: null
    tags: []
    metadata: {}
    active: false
    count: 0
      `;

      const testFile = path.join(testFixturesDir, 'edge-cases.yml');
      fs.writeFileSync(testFile, yamlContent);

      const fixtures = loader.loadFixtures('edge-cases.yml');
      const processedData = loader.processFixtureData(fixtures.entity1.data, {});

      expect(processedData.name).toBe('');
      expect(processedData.description).toBeNull();
      expect(processedData.tags).toEqual([]);
      expect(processedData.metadata).toEqual({});
      expect(processedData.active).toBe(false);
      expect(processedData.count).toBe(0);
    });
  });
});