import * as fs from 'fs';
import * as path from 'path';
import { YamlFixtureLoader, FixtureDefinition, YamlFixtureConfig } from '../YamlFixtureLoader';
import { TEST_FIXTURES_DIR } from './setup';

describe('YamlFixtureLoader', () => {
  let loader: YamlFixtureLoader;
  let testFixturesDir: string;

  beforeEach(() => {
    testFixturesDir = path.join(TEST_FIXTURES_DIR, 'yaml-loader');
    if (!fs.existsSync(testFixturesDir)) {
      fs.mkdirSync(testFixturesDir, { recursive: true });
    }
    loader = new YamlFixtureLoader(testFixturesDir);
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testFixturesDir)) {
      fs.rmSync(testFixturesDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create instance with fixtures directory', () => {
      expect(loader).toBeInstanceOf(YamlFixtureLoader);
      expect((loader as any).fixturesDir).toBe(testFixturesDir);
    });
  });

  describe('loadFixtures', () => {
    it('should load simple YAML fixture file', () => {
      const fixtureData = {
        user1: {
          count: 1,
          data: {
            name: 'John Doe',
            email: 'john@example.com'
          }
        }
      };
      
      const fixturePath = path.join(testFixturesDir, 'simple.yml');
      fs.writeFileSync(fixturePath, `
user1:
  count: 1
  data:
    name: John Doe
    email: john@example.com
      `);

      const result = loader.loadFixtures('simple.yml');
      expect(result).toEqual(fixtureData);
    });

    it('should throw error for non-existent file', () => {
      expect(() => loader.loadFixtures('nonexistent.yml')).toThrow();
    });

    it('should load YAML with multiple fixtures', () => {
      const fixturePath = path.join(testFixturesDir, 'multiple.yml');
      fs.writeFileSync(fixturePath, `
user1:
  count: 2
  data:
    name: User 1
    
user2:
  count: 1
  data:
    name: User 2
      `);

      const result = loader.loadFixtures('multiple.yml');
      expect(Object.keys(result)).toHaveLength(2);
      expect(result.user1.count).toBe(2);
      expect(result.user2.count).toBe(1);
    });
  });

  describe('processFixtureData', () => {
    it('should process simple data without placeholders', () => {
      const data = { name: 'John', age: 30 };
      const context = {};
      
      const result = loader.processFixtureData(data, context);
      expect(result).toEqual(data);
    });

    it('should process array data', () => {
      const data = ['item1', 'item2', 'item3'];
      const context = {};
      
      const result = loader.processFixtureData(data, context);
      expect(result).toEqual(data);
    });

    it('should process nested objects', () => {
      const data = {
        user: {
          profile: {
            name: 'John',
            details: {
              age: 30
            }
          }
        }
      };
      const context = {};
      
      const result = loader.processFixtureData(data, context);
      expect(result).toEqual(data);
    });

    it('should handle null and undefined values', () => {
      const data = { nullValue: null, undefinedValue: undefined };
      const context = {};
      
      const result = loader.processFixtureData(data, context);
      expect(result.nullValue).toBeNull();
      expect(result.undefinedValue).toBeUndefined();
    });
  });

  describe('processStringValue', () => {
    it('should process string without placeholders', () => {
      const value = 'simple string';
      const context = {};
      
      const result = loader.processStringValue(value, context);
      expect(result).toBe('simple string');
    });

    it('should process string with single placeholder', () => {
      const value = 'Hello {{name}}';
      const context = { name: 'John' };
      
      const result = loader.processStringValue(value, context);
      expect(result).toBe('Hello John');
    });

    it('should process string with multiple placeholders', () => {
      const value = '{{greeting}} {{name}}, you are {{age}} years old';
      const context = { greeting: 'Hello', name: 'John', age: '30' };
      
      const result = loader.processStringValue(value, context);
      expect(result).toBe('Hello John, you are 30 years old');
    });

    it('should handle missing placeholders gracefully', () => {
      const value = 'Hello {{missingValue}}';
      const context = {};
      
      const result = loader.processStringValue(value, context);
      expect(result).toBe('Hello {{missingValue}}');
    });
  });

  describe('resolvePlaceholder', () => {
    it('should resolve context value', () => {
      const context = { userName: 'testuser' };
      
      const result = loader.resolvePlaceholder('userName', context);
      expect(result).toBe('testuser');
    });

    it('should resolve array reference', () => {
      const context = { users: [{ name: 'John' }, { name: 'Jane' }] };
      
      const result = loader.resolvePlaceholder('users[0].name', context);
      expect(result).toBe('John');
    });

    it('should generate fake data for recognized types', () => {
      const result = loader.resolvePlaceholder('fake:firstName', {});
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return placeholder as-is for unrecognized types', () => {
      const result = loader.resolvePlaceholder('unknownType', {});
      expect(result).toBe('unknownType');
    });
  });

  describe('resolveArrayReference', () => {
    it('should resolve simple array index', () => {
      const context = { items: ['a', 'b', 'c'] };
      
      const result = loader.resolveArrayReference('items[1]', context);
      expect(result).toBe('b');
    });

    it('should resolve nested object property in array', () => {
      const context = { users: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }] };
      
      const result = loader.resolveArrayReference('users[0].name', context);
      expect(result).toBe('John');
    });

    it('should return undefined for invalid array reference', () => {
      const context = { items: ['a', 'b'] };
      
      const result = loader.resolveArrayReference('items[5]', context);
      expect(result).toBeUndefined();
    });

    it('should handle non-existent array', () => {
      const context = {};
      
      const result = loader.resolveArrayReference('missing[0]', context);
      expect(result).toBeUndefined();
    });
  });

  describe('generateFakeData', () => {
    it('should generate firstName', () => {
      const result = loader.generateFakeData('firstName');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate lastName', () => {
      const result = loader.generateFakeData('lastName');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate email', () => {
      const result = loader.generateFakeData('email');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^[\w\.-]+@[\w\.-]+\.\w+$/);
    });

    it('should generate phone number', () => {
      const result = loader.generateFakeData('phone');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate address', () => {
      const result = loader.generateFakeData('address');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate city', () => {
      const result = loader.generateFakeData('city');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate zipCode', () => {
      const result = loader.generateFakeData('zipCode');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate country', () => {
      const result = loader.generateFakeData('country');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate company name', () => {
      const result = loader.generateFakeData('company');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate job title', () => {
      const result = loader.generateFakeData('jobTitle');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate uuid', () => {
      const result = loader.generateFakeData('uuid');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should generate number', () => {
      const result = loader.generateFakeData('number');
      expect(typeof result).toBe('number');
    });

    it('should generate boolean', () => {
      const result = loader.generateFakeData('boolean');
      expect(typeof result).toBe('boolean');
    });

    it('should generate date', () => {
      const result = loader.generateFakeData('date');
      expect(typeof result).toBe('string');
      expect(new Date(result)).toBeInstanceOf(Date);
    });

    it('should generate future date', () => {
      const result = loader.generateFakeData('futureDate');
      expect(typeof result).toBe('string');
      expect(new Date(result).getTime()).toBeGreaterThan(Date.now());
    });

    it('should generate past date', () => {
      const result = loader.generateFakeData('pastDate');
      expect(typeof result).toBe('string');
      expect(new Date(result).getTime()).toBeLessThan(Date.now());
    });

    it('should return null for unknown type', () => {
      const result = loader.generateFakeData('unknownType');
      expect(result).toBeNull();
    });
  });

  describe('generateItalianTaxNumber', () => {
    it('should generate valid Italian tax number format', () => {
      const result = loader.generateItalianTaxNumber();
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/);
      expect(result.length).toBe(16);
    });

    it('should generate different tax numbers on multiple calls', () => {
      const result1 = loader.generateItalianTaxNumber();
      const result2 = loader.generateItalianTaxNumber();
      expect(result1).not.toBe(result2);
    });
  });

  describe('generateItalianVATNumber', () => {
    it('should generate valid Italian VAT number format', () => {
      const result = loader.generateItalianVATNumber();
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{11}$/);
      expect(result.length).toBe(11);
    });

    it('should generate different VAT numbers on multiple calls', () => {
      const result1 = loader.generateItalianVATNumber();
      const result2 = loader.generateItalianVATNumber();
      expect(result1).not.toBe(result2);
    });
  });

  describe('getNestedValue', () => {
    it('should get simple property', () => {
      const obj = { name: 'John' };
      const result = loader.getNestedValue(obj, 'name');
      expect(result).toBe('John');
    });

    it('should get nested property', () => {
      const obj = { user: { profile: { name: 'John' } } };
      const result = loader.getNestedValue(obj, 'user.profile.name');
      expect(result).toBe('John');
    });

    it('should return undefined for non-existent property', () => {
      const obj = { name: 'John' };
      const result = loader.getNestedValue(obj, 'age');
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-existent nested property', () => {
      const obj = { user: { name: 'John' } };
      const result = loader.getNestedValue(obj, 'user.profile.age');
      expect(result).toBeUndefined();
    });

    it('should handle array indices in path', () => {
      const obj = { users: [{ name: 'John' }, { name: 'Jane' }] };
      const result = loader.getNestedValue(obj, 'users.0.name');
      expect(result).toBe('John');
    });
  });

  describe('Integration tests', () => {
    it('should process fixture with placeholders and fake data', () => {
      const fixturePath = path.join(testFixturesDir, 'integrated.yml');
      fs.writeFileSync(fixturePath, `
user1:
  count: 1
  data:
    name: "{{fake:firstName}} {{fake:lastName}}"
    email: "{{fake:email}}"
    company: "{{fake:company}}"
    phone: "{{fake:phone}}"
      `);

      const fixtures = loader.loadFixtures('integrated.yml');
      const context = {};
      
      const processedData = loader.processFixtureData(fixtures.user1.data, context);
      
      expect(typeof processedData.name).toBe('string');
      expect(processedData.name).toMatch(/^[A-Za-z]+ [A-Za-z]+$/);
      expect(typeof processedData.email).toBe('string');
      expect(processedData.email).toMatch(/^[\w\.-]+@[\w\.-]+\.\w+$/);
      expect(typeof processedData.company).toBe('string');
      expect(typeof processedData.phone).toBe('string');
    });

    it('should process fixture with context references', () => {
      const data = {
        greeting: 'Hello {{userName}}',
        message: 'Welcome {{userName}}, your role is {{userRole}}'
      };
      const context = { userName: 'testuser', userRole: 'admin' };
      
      const result = loader.processFixtureData(data, context);
      
      expect(result.greeting).toBe('Hello testuser');
      expect(result.message).toBe('Welcome testuser, your role is admin');
    });
  });
});