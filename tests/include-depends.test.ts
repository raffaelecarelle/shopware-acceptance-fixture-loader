import * as fs from 'fs';
import * as path from 'path';
import { YamlFixtureLoader } from '../src/YamlFixtureLoader';
import { YamlFixtureProcessor } from '../src/YamlFixtureProcessor';
import { TEST_FIXTURES_DIR } from './setup';

describe('Include and Depends Functionality', () => {
  let loader: YamlFixtureLoader;
  let processor: YamlFixtureProcessor;
  let testFixturesDir: string;

  beforeEach(() => {
    testFixturesDir = path.join(TEST_FIXTURES_DIR, 'include-depends');
    if (!fs.existsSync(testFixturesDir)) {
      fs.mkdirSync(testFixturesDir, { recursive: true });
    }
    loader = new YamlFixtureLoader(testFixturesDir);
    processor = new YamlFixtureProcessor(testFixturesDir);
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testFixturesDir)) {
      fs.rmSync(testFixturesDir, { recursive: true, force: true });
    }
  });

  describe('@includes functionality', () => {
    it('should include and merge fixture data from another file', async () => {
      // Create base fixture file
      const baseFixturePath = path.join(testFixturesDir, 'base_users.yml');
      fs.writeFileSync(baseFixturePath, `
fixtures:
  base_user:
    entity: User
    data:
      firstName: "Base"
      lastName: "User"
      email: "base@example.com"
  admin_user:
    entity: User
    data:
      firstName: "Admin"
      lastName: "User"
      email: "admin@example.com"
      role: "admin"
`);

      // Create file that includes the base
      const mainFixturePath = path.join(testFixturesDir, 'main_users.yml');
      fs.writeFileSync(mainFixturePath, `
'@includes': 'base_users.yml'
fixtures:
  custom_user:
    entity: User
    data:
      firstName: "Custom"
      lastName: "User"
      email: "custom@example.com"
  base_user:
    entity: User
    data:
      firstName: "Overridden Base"
      lastName: "User"
      email: "base@example.com"
      status: "active"
`);

      const result = await loader.loadFixtures('main_users.yml');

      // Should have all fixtures from both files
      expect(Object.keys(result.fixtures)).toHaveLength(3);
      expect(result.fixtures.base_user).toBeDefined();
      expect(result.fixtures.admin_user).toBeDefined();
      expect(result.fixtures.custom_user).toBeDefined();

      // Current file should override included data
      expect(result.fixtures.base_user.data.firstName).toBe('Overridden Base');
      expect(result.fixtures.base_user.data.status).toBe('active');

      // Admin user from included file should remain unchanged
      expect(result.fixtures.admin_user.data.firstName).toBe('Admin');
      expect(result.fixtures.admin_user.data.role).toBe('admin');

      // Custom user should be present
      expect(result.fixtures.custom_user.data.firstName).toBe('Custom');
    });

    it('should handle nested includes', async () => {
      // Create deepest level fixture
      const deepFixturePath = path.join(testFixturesDir, 'deep.yml');
      fs.writeFileSync(deepFixturePath, `
fixtures:
  deep_entity:
    entity: DeepEntity
    data:
      name: "Deep Entity"
`);

      // Create middle level fixture that includes deep
      const middleFixturePath = path.join(testFixturesDir, 'middle.yml');
      fs.writeFileSync(middleFixturePath, `
'@includes': 'deep.yml'
fixtures:
  middle_entity:
    entity: MiddleEntity
    data:
      name: "Middle Entity"
`);

      // Create top level fixture that includes middle
      const topFixturePath = path.join(testFixturesDir, 'top.yml');
      fs.writeFileSync(topFixturePath, `
'@includes': 'middle.yml'
fixtures:
  top_entity:
    entity: TopEntity
    data:
      name: "Top Entity"
`);

      const result = await loader.loadFixtures('top.yml');

      // Should have all three entities
      expect(Object.keys(result.fixtures)).toHaveLength(3);
      expect(result.fixtures.deep_entity).toBeDefined();
      expect(result.fixtures.middle_entity).toBeDefined();
      expect(result.fixtures.top_entity).toBeDefined();
    });

    it('should throw error for circular includes', async () => {
      // Create file A that includes file B
      const fileAPath = path.join(testFixturesDir, 'fileA.yml');
      fs.writeFileSync(fileAPath, `
'@includes': 'fileB.yml'
fixtures:
  entityA:
    entity: EntityA
    data:
      name: "Entity A"
`);

      // Create file B that includes file A (circular)
      const fileBPath = path.join(testFixturesDir, 'fileB.yml');
      fs.writeFileSync(fileBPath, `
'@includes': 'fileA.yml'
fixtures:
  entityB:
    entity: EntityB
    data:
      name: "Entity B"
`);

      await expect(loader.loadFixtures('fileA.yml')).rejects.toThrow(/Circular include detected/);
    });

    it('should throw error for non-existent include file', async () => {
      const mainFixturePath = path.join(testFixturesDir, 'main.yml');
      fs.writeFileSync(mainFixturePath, `
'@includes': 'nonexistent.yml'
fixtures:
  test_entity:
    entity: TestEntity
    data:
      name: "Test"
`);

      await expect(loader.loadFixtures('main.yml')).rejects.toThrow(/Included fixture file not found/);
    });

    it('should support @includes with array of files', async () => {
      // Create first base fixture file
      const baseUsersPath = path.join(testFixturesDir, 'base_users.yml');
      fs.writeFileSync(baseUsersPath, `
fixtures:
  base_user:
    entity: User
    data:
      firstName: "Base"
      lastName: "User"
      email: "base@example.com"
`);

      // Create second base fixture file  
      const baseProductsPath = path.join(testFixturesDir, 'base_products.yml');
      fs.writeFileSync(baseProductsPath, `
fixtures:
  base_product:
    entity: Product
    data:
      name: "Base Product"
      price: "10.00"
`);

      // Create file that includes multiple files as array
      const mainFixturePath = path.join(testFixturesDir, 'main.yml');
      fs.writeFileSync(mainFixturePath, `
'@includes': 
  - 'base_users.yml'
  - 'base_products.yml'
fixtures:
  custom_entity:
    entity: Custom
    data:
      name: "Custom Entity"
`);

      const result = await loader.loadFixtures('main.yml');

      // Should have all fixtures from all included files plus the custom one
      expect(Object.keys(result.fixtures)).toHaveLength(3);
      expect(result.fixtures.base_user).toBeDefined();
      expect(result.fixtures.base_product).toBeDefined();
      expect(result.fixtures.custom_entity).toBeDefined();

      // Verify data from each included file
      expect(result.fixtures.base_user.data.firstName).toBe('Base');
      expect(result.fixtures.base_product.data.name).toBe('Base Product');
      expect(result.fixtures.custom_entity.data.name).toBe('Custom Entity');
    });

    it('should throw error for invalid @includes directive', async () => {
      const mainFixturePath = path.join(testFixturesDir, 'main.yml');
      fs.writeFileSync(mainFixturePath, `
'@includes': 123
fixtures:
  test_entity:
    entity: TestEntity
    data:
      name: "Test"
`);

      await expect(loader.loadFixtures('main.yml')).rejects.toThrow(/@includes directive must be a string or array of strings/);
    });

    it('should throw error for @includes array with non-string elements', async () => {
      const mainFixturePath = path.join(testFixturesDir, 'invalid_array.yml');
      fs.writeFileSync(mainFixturePath, `
'@includes': 
  - 'valid_file.yml'
  - 123
fixtures:
  test_entity:
    entity: TestEntity
    data:
      name: "Test"
`);

      await expect(loader.loadFixtures('invalid_array.yml')).rejects.toThrow(/@includes directive array must contain only strings/);
    });
  });

  describe('@depends functionality', () => {
    it('should process dependent fixture before current fixture', async () => {
      const mockResponse = {
        ok: jest.fn().mockReturnValue(true),
        json: jest.fn().mockResolvedValue({ data: { id: 'mock-id' } }),
        text: jest.fn().mockResolvedValue('Success')
      };
      const mockApiContext = {
        post: jest.fn().mockResolvedValue(mockResponse)
      };

      // Create dependency fixture
      const dependencyPath = path.join(testFixturesDir, 'dependency.yml');
      fs.writeFileSync(dependencyPath, `
fixtures:
  dependency_user:
    entity: user
    data:
      firstName: "Dependency"
      lastName: "User"
      email: "dependency@example.com"
`);

      // Create main fixture that depends on dependency
      const mainPath = path.join(testFixturesDir, 'main.yml');
      fs.writeFileSync(mainPath, `
'@depends': 'dependency.yml'
fixtures:
  main_user:
    entity: user
    data:
      firstName: "Main"
      lastName: "User"
      email: "main@example.com"
      parentId: "@dependency_user"
`);

      const result = await processor.processFixtures('main.yml', mockApiContext);

      // Both fixtures should be processed
      expect(result.dependency_user).toBeDefined();
      expect(result.main_user).toBeDefined();
            
      // API should have been called for both entities
      expect(mockApiContext.post).toHaveBeenCalledTimes(2);
    });

    it('should handle nested dependencies', async () => {
      const mockResponse = {
        ok: jest.fn().mockReturnValue(true),
        json: jest.fn().mockResolvedValue({ data: { id: 'mock-id' } }),
        text: jest.fn().mockResolvedValue('Success')
      };
      const mockApiContext = {
        post: jest.fn().mockResolvedValue(mockResponse)
      };

      // Create deepest dependency
      const deepPath = path.join(testFixturesDir, 'deep_dep.yml');
      fs.writeFileSync(deepPath, `
fixtures:
  deep_entity:
    entity: entity
    data:
      name: "Deep Entity"
`);

      // Create middle dependency that depends on deep
      const middlePath = path.join(testFixturesDir, 'middle_dep.yml');
      fs.writeFileSync(middlePath, `
'@depends': 'deep_dep.yml'
fixtures:
  middle_entity:
    entity: entity
    data:
      name: "Middle Entity"
      parentId: "@deep_entity"
`);

      // Create main that depends on middle
      const mainPath = path.join(testFixturesDir, 'main_dep.yml');
      fs.writeFileSync(mainPath, `
'@depends': 'middle_dep.yml'
fixtures:
  main_entity:
    entity: entity
    data:
      name: "Main Entity"
      parentId: "@middle_entity"
`);

      const result = await processor.processFixtures('main_dep.yml', mockApiContext);

      // All three entities should be processed
      expect(result.deep_entity).toBeDefined();
      expect(result.middle_entity).toBeDefined();
      expect(result.main_entity).toBeDefined();
            
      // API should have been called for all three entities
      expect(mockApiContext.post).toHaveBeenCalledTimes(3);
    });

    it('should throw error for circular dependencies', async () => {
      const mockResponse = {
        ok: jest.fn().mockReturnValue(true),
        json: jest.fn().mockResolvedValue({ data: { id: 'mock-id' } }),
        text: jest.fn().mockResolvedValue('Success')
      };
      const mockApiContext = {
        post: jest.fn().mockResolvedValue(mockResponse)
      };

      // Create file A that depends on file B
      const fileAPath = path.join(testFixturesDir, 'depA.yml');
      fs.writeFileSync(fileAPath, `
'@depends': 'depB.yml'
fixtures:
  entityA:
    entity: entity
    data:
      name: "Entity A"
`);

      // Create file B that depends on file A (circular)
      const fileBPath = path.join(testFixturesDir, 'depB.yml');
      fs.writeFileSync(fileBPath, `
'@depends': 'depA.yml'
fixtures:
  entityB:
    entity: entity
    data:
      name: "Entity B"
`);

      await expect(processor.processFixtures('depA.yml', mockApiContext)).rejects.toThrow(/Circular dependency detected/);
    });

    it('should throw error for non-existent dependency file', async () => {
      const mockResponse = {
        ok: jest.fn().mockReturnValue(true),
        json: jest.fn().mockResolvedValue({ data: { id: 'mock-id' } }),
        text: jest.fn().mockResolvedValue('Success')
      };
      const mockApiContext = {
        post: jest.fn().mockResolvedValue(mockResponse)
      };

      const mainPath = path.join(testFixturesDir, 'main.yml');
      fs.writeFileSync(mainPath, `
'@depends': 'nonexistent.yml'
fixtures:
  test_entity:
    entity: entity
    data:
      name: "Test"
`);

      await expect(processor.processFixtures('main.yml', mockApiContext)).rejects.toThrow(/Fixture file not found/);
    });

    it('should support @depends with array of files', async () => {
      const mockResponse = {
        ok: jest.fn().mockReturnValue(true),
        json: jest.fn().mockResolvedValue({ data: { id: 'mock-id' } }),
        text: jest.fn().mockResolvedValue('Success')
      };
      const mockApiContext = {
        post: jest.fn().mockResolvedValue(mockResponse)
      };

      // Create first dependency file
      const dep1Path = path.join(testFixturesDir, 'dep1.yml');
      fs.writeFileSync(dep1Path, `
fixtures:
  dep1_entity:
    entity: entity
    data:
      name: "Dependency 1"
`);

      // Create second dependency file
      const dep2Path = path.join(testFixturesDir, 'dep2.yml');
      fs.writeFileSync(dep2Path, `
fixtures:
  dep2_entity:
    entity: entity
    data:
      name: "Dependency 2"
`);

      // Create main file that depends on multiple files as array
      const mainPath = path.join(testFixturesDir, 'main_array_deps.yml');
      fs.writeFileSync(mainPath, `
'@depends': 
  - 'dep1.yml'
  - 'dep2.yml'
fixtures:
  main_entity:
    entity: entity
    data:
      name: "Main Entity"
      dep1Id: "@dep1_entity"
      dep2Id: "@dep2_entity"
`);

      const result = await processor.processFixtures('main_array_deps.yml', mockApiContext);

      // All entities should be processed
      expect(result.dep1_entity).toBeDefined();
      expect(result.dep2_entity).toBeDefined();
      expect(result.main_entity).toBeDefined();
            
      // API should have been called for all three entities
      expect(mockApiContext.post).toHaveBeenCalledTimes(3);
    });

    it('should throw error for invalid @depends directive', async () => {
      const mockResponse = {
        ok: jest.fn().mockReturnValue(true),
        json: jest.fn().mockResolvedValue({ data: { id: 'mock-id' } }),
        text: jest.fn().mockResolvedValue('Success')
      };
      const mockApiContext = {
        post: jest.fn().mockResolvedValue(mockResponse)
      };

      const mainPath = path.join(testFixturesDir, 'main.yml');
      fs.writeFileSync(mainPath, `
'@depends': 123
fixtures:
  test_entity:
    entity: entity
    data:
      name: "Test"
`);

      await expect(processor.processFixtures('main.yml', mockApiContext)).rejects.toThrow(/@depends directive must be a string or array of strings/);
    });

    it('should throw error for @depends array with non-string elements', async () => {
      const mockResponse = {
        ok: jest.fn().mockReturnValue(true),
        json: jest.fn().mockResolvedValue({ data: { id: 'mock-id' } }),
        text: jest.fn().mockResolvedValue('Success')
      };
      const mockApiContext = {
        post: jest.fn().mockResolvedValue(mockResponse)
      };

      const mainPath = path.join(testFixturesDir, 'invalid_depends.yml');
      fs.writeFileSync(mainPath, `
'@depends': 
  - 'valid_dep.yml'
  - 123
fixtures:
  test_entity:
    entity: entity
    data:
      name: "Test"
`);

      await expect(processor.processFixtures('invalid_depends.yml', mockApiContext)).rejects.toThrow(/@depends directive array must contain only strings/);
    });
  });

  describe('Combined @includes and @depends functionality', () => {
    it('should handle both @includes and @depends in the same file', async () => {
      const mockResponse = {
        ok: jest.fn().mockReturnValue(true),
        json: jest.fn().mockResolvedValue({ data: { id: 'mock-id' } }),
        text: jest.fn().mockResolvedValue('Success')
      };
      const mockApiContext = {
        post: jest.fn().mockResolvedValue(mockResponse)
      };

      // Create dependency file
      const dependencyPath = path.join(testFixturesDir, 'base_entities.yml');
      fs.writeFileSync(dependencyPath, `
fixtures:
  base_entity:
    entity: entity
    data:
      name: "Base Entity"
`);

      // Create include file
      const includePath = path.join(testFixturesDir, 'shared_entities.yml');
      fs.writeFileSync(includePath, `
fixtures:
  shared_entity:
    entity: entity
    data:
      name: "Shared Entity"
`);

      // Create main file with both directives
      const mainPath = path.join(testFixturesDir, 'combined.yml');
      fs.writeFileSync(mainPath, `
'@depends': 'base_entities.yml'
'@includes': 'shared_entities.yml'
fixtures:
  main_entity:
    entity: entity
    data:
      name: "Main Entity"
      baseId: "@base_entity"
      sharedId: "@shared_entity"
`);

      const result = await processor.processFixtures('combined.yml', mockApiContext);

      // All entities should be processed
      expect(result.base_entity).toBeDefined();
      expect(result.shared_entity).toBeDefined();
      expect(result.main_entity).toBeDefined();
    });
  });
});