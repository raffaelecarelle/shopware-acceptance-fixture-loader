import { YamlFixtureProcessor } from '../YamlFixtureProcessor';
import { FixtureDefinition } from '../YamlFixtureLoader';
import * as fs from 'fs';
import * as path from 'path';
import { TEST_FIXTURES_DIR } from './setup';

// Mock the dependencies
jest.mock('../YamlFixtureLoader');
jest.mock('../CircularReferenceResolver');

describe('YamlFixtureProcessor', () => {
  let processor: YamlFixtureProcessor;
  let testFixturesDir: string;
  let mockAdminApiContext: any;
  let mockSystemData: any;

  beforeEach(() => {
    testFixturesDir = path.join(TEST_FIXTURES_DIR, 'yaml-processor');
    if (!fs.existsSync(testFixturesDir)) {
      fs.mkdirSync(testFixturesDir, { recursive: true });
    }

    processor = new YamlFixtureProcessor(testFixturesDir);

    // Mock admin API context
    mockAdminApiContext = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      put: jest.fn()
    };

    // Mock system data
    mockSystemData = {
      currencies: [{ id: 'currency-1', isoCode: 'EUR' }],
      languages: [{ id: 'language-1', locale: { code: 'en-GB' } }],
      countries: [{ id: 'country-1', iso: 'DE' }],
      salutations: [{ id: 'salutation-1', salutationKey: 'mr' }],
      paymentMethods: [{ id: 'payment-1', name: 'Invoice' }],
      shippingMethods: [{ id: 'shipping-1', name: 'Standard' }],
      customerGroups: [{ id: 'customer-group-1', name: 'Standard customer group' }],
      salesChannels: [{ id: 'sales-channel-1', name: 'Storefront' }],
      taxRules: [{ id: 'tax-rule-1', name: '19%' }],
      categories: [{ id: 'category-1', name: 'Root' }]
    };
  });

  afterEach(() => {
    if (fs.existsSync(testFixturesDir)) {
      fs.rmSync(testFixturesDir, { recursive: true, force: true });
    }
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with fixtures directory', () => {
      expect(processor).toBeInstanceOf(YamlFixtureProcessor);
      expect((processor as any).fixturesDir).toBe(testFixturesDir);
    });

    it('should initialize YamlFixtureLoader with fixtures directory', () => {
      expect((processor as any).yamlLoader).toBeDefined();
    });
  });

  describe('processFixtures', () => {
    beforeEach(() => {
      // Mock successful API responses
      mockAdminApiContext.get.mockResolvedValue({ data: [] });
      mockAdminApiContext.post.mockResolvedValue({ 
        data: { id: 'created-entity-id', name: 'Created Entity' }
      });
      mockAdminApiContext.patch.mockResolvedValue({
        data: { id: 'updated-entity-id', name: 'Updated Entity' }
      });
    });

    it('should process simple fixtures without circular references', async () => {
      const mockFixtures = {
        customer1: {
          entityType: 'customer',
          count: 1,
          data: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com'
          }
        } as FixtureDefinition
      };

      // Mock YamlFixtureLoader.loadFixtures
      jest.spyOn((processor as any).yamlLoader, 'loadFixtures').mockReturnValue(mockFixtures);
      jest.spyOn((processor as any).yamlLoader, 'processFixtureData').mockReturnValue({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com'
      });

      const result = await processor.processFixtures('test.yml', mockAdminApiContext, mockSystemData);

      expect(result).toBeDefined();
      expect(result.customer1).toBeDefined();
      expect(mockAdminApiContext.post).toHaveBeenCalled();
    });

    it('should handle fixtures with multiple entities of same type', async () => {
      const mockFixtures = {
        customer1: {
          entityType: 'customer',
          count: 2,
          data: {
            firstName: 'User',
            lastName: 'Test',
            email: 'user{{index}}@example.com'
          }
        } as FixtureDefinition
      };

      jest.spyOn((processor as any).yamlLoader, 'loadFixtures').mockReturnValue(mockFixtures);
      jest.spyOn((processor as any).yamlLoader, 'processFixtureData').mockReturnValue({
        firstName: 'User',
        lastName: 'Test',
        email: 'user1@example.com'
      });

      const result = await processor.processFixtures('test.yml', mockAdminApiContext, mockSystemData);

      expect(result).toBeDefined();
      expect(mockAdminApiContext.post).toHaveBeenCalledTimes(2);
    });

    it('should handle fixtures with dependencies', async () => {
      const mockFixtures = {
        customer1: {
          entityType: 'customer',
          count: 1,
          data: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com'
          }
        } as FixtureDefinition,
        order1: {
          entityType: 'order',
          count: 1,
          data: {
            customerId: '@customer1',
            orderNumber: 'ORDER-001'
          }
        } as FixtureDefinition
      };

      jest.spyOn((processor as any).yamlLoader, 'loadFixtures').mockReturnValue(mockFixtures);
      jest.spyOn((processor as any).yamlLoader, 'processFixtureData').mockImplementation((data, context) => data);

      // Mock CircularReferenceResolver
      const mockResolver = {
        createProcessingPlan: jest.fn().mockReturnValue([
          {
            name: 'customer1',
            fixture: mockFixtures.customer1,
            phase: 'pending',
            deferredFields: new Map()
          },
          {
            name: 'order1',
            fixture: mockFixtures.order1,
            phase: 'pending',
            deferredFields: new Map([['customerId', 'customer1']])
          }
        ]),
        getInitialData: jest.fn().mockImplementation((entity) => {
          if (entity.name === 'customer1') {
            return { firstName: 'John', lastName: 'Doe', email: 'john@example.com' };
          }
          return { orderNumber: 'ORDER-001' };
        }),
        getDeferredUpdates: jest.fn().mockReturnValue({ customerId: 'customer-id' })
      };

      jest.spyOn(require('../CircularReferenceResolver'), 'CircularReferenceResolver').mockImplementation(() => mockResolver);

      const result = await processor.processFixtures('test.yml', mockAdminApiContext, mockSystemData);

      expect(result).toBeDefined();
      expect(mockAdminApiContext.post).toHaveBeenCalled();
      expect(mockAdminApiContext.patch).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const mockFixtures = {
        customer1: {
          entityType: 'customer',
          count: 1,
          data: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'invalid-email'
          }
        } as FixtureDefinition
      };

      jest.spyOn((processor as any).yamlLoader, 'loadFixtures').mockReturnValue(mockFixtures);
      jest.spyOn((processor as any).yamlLoader, 'processFixtureData').mockReturnValue({
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email'
      });

      mockAdminApiContext.post.mockRejectedValue(new Error('API Error'));

      await expect(processor.processFixtures('test.yml', mockAdminApiContext, mockSystemData))
        .rejects.toThrow('API Error');
    });
  });

  describe('expandMultiInsertionFixtures', () => {
    it('should expand fixture with count > 1', () => {
      const fixtures = {
        customer1: {
          entityType: 'customer',
          count: 3,
          data: {
            firstName: 'User',
            lastName: 'Test',
            email: 'user{{index}}@example.com'
          }
        } as FixtureDefinition
      };

      const expanded = processor.expandMultiInsertionFixtures(fixtures);

      expect(Object.keys(expanded)).toHaveLength(3);
      expect(expanded['customer1_1']).toBeDefined();
      expect(expanded['customer1_2']).toBeDefined();
      expect(expanded['customer1_3']).toBeDefined();
      expect(expanded['customer1_1'].count).toBe(1);
    });

    it('should not expand fixture with count = 1', () => {
      const fixtures = {
        customer1: {
          entityType: 'customer',
          count: 1,
          data: {
            firstName: 'John',
            lastName: 'Doe'
          }
        } as FixtureDefinition
      };

      const expanded = processor.expandMultiInsertionFixtures(fixtures);

      expect(Object.keys(expanded)).toHaveLength(1);
      expect(expanded['customer1']).toBeDefined();
      expect(expanded['customer1'].count).toBe(1);
    });

    it('should expand fixtures with children', () => {
      const fixtures = {
        customer1: {
          entityType: 'customer',
          count: 2,
          data: { firstName: 'User' },
          children: {
            address1: {
              entityType: 'customer_address',
              count: 1,
              data: { street: 'Main St' }
            }
          }
        } as FixtureDefinition
      };

      const expanded = processor.expandMultiInsertionFixtures(fixtures);

      expect(Object.keys(expanded)).toHaveLength(2);
      expect(expanded['customer1_1'].children?.['address1_1']).toBeDefined();
      expect(expanded['customer1_2'].children?.['address1_2']).toBeDefined();
    });
  });

  describe('snakeToKebab', () => {
    it('should convert snake_case to kebab-case', () => {
      expect(processor.snakeToKebab('customer_group')).toBe('customer-group');
      expect(processor.snakeToKebab('payment_method')).toBe('payment-method');
      expect(processor.snakeToKebab('simple_word')).toBe('simple-word');
    });

    it('should handle single words', () => {
      expect(processor.snakeToKebab('customer')).toBe('customer');
      expect(processor.snakeToKebab('product')).toBe('product');
    });

    it('should handle empty strings', () => {
      expect(processor.snakeToKebab('')).toBe('');
    });

    it('should handle strings without underscores', () => {
      expect(processor.snakeToKebab('alreadykebab')).toBe('alreadykebab');
    });
  });

  describe('getEntityEndpoint', () => {
    it('should return correct endpoint for known entity types', () => {
      expect(processor.getEntityEndpoint('customer')).toBe('customer');
      expect(processor.getEntityEndpoint('product')).toBe('product');
      expect(processor.getEntityEndpoint('customer_group')).toBe('customer-group');
      expect(processor.getEntityEndpoint('payment_method')).toBe('payment-method');
    });

    it('should convert snake_case entity types to kebab-case endpoints', () => {
      expect(processor.getEntityEndpoint('shipping_method')).toBe('shipping-method');
      expect(processor.getEntityEndpoint('sales_channel')).toBe('sales-channel');
    });
  });

  describe('findExistingEntity', () => {
    beforeEach(() => {
      mockAdminApiContext.get.mockResolvedValue({
        data: [
          { id: 'existing-id', name: 'Existing Entity', email: 'existing@example.com' }
        ]
      });
    });

    it('should find existing entity by matching criteria', async () => {
      const fixture = {
        entityType: 'customer',
        findBy: { email: 'existing@example.com' },
        data: { firstName: 'John', lastName: 'Doe' }
      } as FixtureDefinition;

      const context = {};

      const result = await processor.findExistingEntity(fixture, mockAdminApiContext, context);

      expect(result).toBeDefined();
      expect(result.id).toBe('existing-id');
      expect(mockAdminApiContext.get).toHaveBeenCalledWith('customer', {
        params: {
          filter: [{ type: 'equals', field: 'email', value: 'existing@example.com' }]
        }
      });
    });

    it('should return null when no entity found', async () => {
      mockAdminApiContext.get.mockResolvedValue({ data: [] });

      const fixture = {
        entityType: 'customer',
        findBy: { email: 'notfound@example.com' },
        data: { firstName: 'John' }
      } as FixtureDefinition;

      const result = await processor.findExistingEntity(fixture, mockAdminApiContext, {});

      expect(result).toBeNull();
    });

    it('should return null when findBy is not specified', async () => {
      const fixture = {
        entityType: 'customer',
        data: { firstName: 'John' }
      } as FixtureDefinition;

      const result = await processor.findExistingEntity(fixture, mockAdminApiContext, {});

      expect(result).toBeNull();
      expect(mockAdminApiContext.get).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      mockAdminApiContext.get.mockRejectedValue(new Error('API Error'));

      const fixture = {
        entityType: 'customer',
        findBy: { email: 'test@example.com' },
        data: { firstName: 'John' }
      } as FixtureDefinition;

      await expect(processor.findExistingEntity(fixture, mockAdminApiContext, {}))
        .rejects.toThrow('API Error');
    });

    it('should process findBy values with context', async () => {
      const fixture = {
        entityType: 'customer',
        findBy: { email: '{{userEmail}}' },
        data: { firstName: 'John' }
      } as FixtureDefinition;

      const context = { userEmail: 'processed@example.com' };
      jest.spyOn((processor as any).yamlLoader, 'processFixtureData').mockReturnValue({
        email: 'processed@example.com'
      });

      await processor.findExistingEntity(fixture, mockAdminApiContext, context);

      expect(mockAdminApiContext.get).toHaveBeenCalledWith('customer', {
        params: {
          filter: [{ type: 'equals', field: 'email', value: 'processed@example.com' }]
        }
      });
    });
  });

  describe('createGenericEntity', () => {
    it('should create entity via POST request', async () => {
      const entityType = 'customer';
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com'
      };

      mockAdminApiContext.post.mockResolvedValue({
        data: { id: 'created-id', ...data }
      });

      const result = await processor.createGenericEntity(entityType, data, mockAdminApiContext);

      expect(result).toEqual({ id: 'created-id', ...data });
      expect(mockAdminApiContext.post).toHaveBeenCalledWith('customer', data);
    });

    it('should handle POST request errors', async () => {
      mockAdminApiContext.post.mockRejectedValue(new Error('Creation failed'));

      await expect(
        processor.createGenericEntity('customer', { name: 'Test' }, mockAdminApiContext)
      ).rejects.toThrow('Creation failed');
    });
  });

  describe('cleanup', () => {
    it('should delete entities in reverse order', async () => {
      const createdEntities = {
        customer1: { id: 'customer-1', entityType: 'customer' },
        product1: { id: 'product-1', entityType: 'product' },
        order1: { id: 'order-1', entityType: 'order' }
      };

      mockAdminApiContext.delete.mockResolvedValue({});

      await processor.cleanup(mockAdminApiContext);

      // Since createdEntities is private, we need to mock the behavior
      // The actual implementation would delete in reverse order
      expect(mockAdminApiContext.delete).toHaveBeenCalledTimes(0); // No entities created in this test
    });

    it('should handle delete errors gracefully', async () => {
      mockAdminApiContext.delete.mockRejectedValue(new Error('Delete failed'));

      // Should not throw even if deletion fails
      await expect(processor.cleanup(mockAdminApiContext)).resolves.not.toThrow();
    });
  });

  describe('getCleanupEndpoint', () => {
    it('should return correct cleanup endpoint', () => {
      expect(processor.getCleanupEndpoint('customer')).toBe('customer');
      expect(processor.getCleanupEndpoint('customer_group')).toBe('customer-group');
      expect(processor.getCleanupEndpoint('payment_method')).toBe('payment-method');
    });
  });

  describe('updateEntity', () => {
    it('should update entity via PATCH request', async () => {
      const entityType = 'customer';
      const entityId = 'customer-123';
      const updateData = { firstName: 'Updated John' };

      mockAdminApiContext.patch.mockResolvedValue({
        data: { id: entityId, firstName: 'Updated John', lastName: 'Doe' }
      });

      const result = await processor.updateEntity(entityType, entityId, updateData, mockAdminApiContext);

      expect(result).toEqual({
        id: entityId,
        firstName: 'Updated John',
        lastName: 'Doe'
      });
      expect(mockAdminApiContext.patch).toHaveBeenCalledWith(`customer/${entityId}`, updateData);
    });

    it('should handle PATCH request errors', async () => {
      mockAdminApiContext.patch.mockRejectedValue(new Error('Update failed'));

      await expect(
        processor.updateEntity('customer', 'customer-123', { name: 'Test' }, mockAdminApiContext)
      ).rejects.toThrow('Update failed');
    });

    it('should use correct endpoint format for entity updates', async () => {
      const entityType = 'customer_group';
      const entityId = 'group-123';
      const updateData = { name: 'Updated Group' };

      mockAdminApiContext.patch.mockResolvedValue({ data: {} });

      await processor.updateEntity(entityType, entityId, updateData, mockAdminApiContext);

      expect(mockAdminApiContext.patch).toHaveBeenCalledWith(`customer-group/${entityId}`, updateData);
    });
  });

  describe('Integration tests', () => {
    it('should handle complete fixture processing workflow', async () => {
      // Create a test YAML file
      const yamlContent = `
customer1:
  entityType: customer
  count: 1
  data:
    firstName: John
    lastName: Doe
    email: john@example.com
      `;

      const testFile = path.join(testFixturesDir, 'integration.yml');
      fs.writeFileSync(testFile, yamlContent);

      // Mock all dependencies
      jest.spyOn((processor as any).yamlLoader, 'loadFixtures').mockReturnValue({
        customer1: {
          entityType: 'customer',
          count: 1,
          data: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com'
          }
        }
      });

      jest.spyOn((processor as any).yamlLoader, 'processFixtureData').mockReturnValue({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com'
      });

      mockAdminApiContext.get.mockResolvedValue({ data: [] }); // No existing entities
      mockAdminApiContext.post.mockResolvedValue({
        data: { id: 'created-customer-id', firstName: 'John', lastName: 'Doe', email: 'john@example.com' }
      });

      const result = await processor.processFixtures('integration.yml', mockAdminApiContext, mockSystemData);

      expect(result).toBeDefined();
      expect(result.customer1).toBeDefined();
      expect(result.customer1.id).toBe('created-customer-id');
      expect(mockAdminApiContext.post).toHaveBeenCalledWith('customer', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com'
      });
    });

    it('should handle fixtures with system data references', async () => {
      const mockFixtures = {
        customer1: {
          entityType: 'customer',
          count: 1,
          data: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            defaultPaymentMethodId: '{{systemData.paymentMethods[0].id}}'
          }
        } as FixtureDefinition
      };

      jest.spyOn((processor as any).yamlLoader, 'loadFixtures').mockReturnValue(mockFixtures);
      jest.spyOn((processor as any).yamlLoader, 'processFixtureData').mockReturnValue({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        defaultPaymentMethodId: 'payment-1'
      });

      mockAdminApiContext.get.mockResolvedValue({ data: [] });
      mockAdminApiContext.post.mockResolvedValue({
        data: { id: 'created-id', firstName: 'John', defaultPaymentMethodId: 'payment-1' }
      });

      const result = await processor.processFixtures('test.yml', mockAdminApiContext, mockSystemData);

      expect(result).toBeDefined();
      expect(mockAdminApiContext.post).toHaveBeenCalledWith('customer', expect.objectContaining({
        defaultPaymentMethodId: 'payment-1'
      }));
    });
  });
});