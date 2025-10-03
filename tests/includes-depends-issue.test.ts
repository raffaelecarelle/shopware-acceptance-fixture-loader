import * as fs from 'fs';
import * as path from 'path';
import { YamlFixtureLoader } from '../src/YamlFixtureLoader';

describe('Test @includes should encompass @depends issue', () => {
  let loader: YamlFixtureLoader;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(__dirname, 'temp-includes-depends');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    loader = new YamlFixtureLoader(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should merge @depends from included files with current file @depends', async () => {
    // Create base.yml with its own @depends
    const baseContent = `
'@depends': 'foundation.yml'
fixtures:
  base_entity:
    entity: "entity"
    data:
      name: "Base Entity"
      foundationId: "@foundation_entity"
`;

    // Create foundation.yml (dependency of base.yml)
    const foundationContent = `
fixtures:
  foundation_entity:
    entity: "foundation"
    data:
      name: "Foundation Entity"
`;

    // Create main.yml that includes base.yml and has its own @depends
    const mainContent = `
'@depends': 'other.yml'
'@includes': 'base.yml'
fixtures:
  main_entity:
    entity: "entity"
    data:
      name: "Main Entity"
      baseId: "@base_entity"
      otherId: "@other_entity"
`;

    // Create other.yml (direct dependency of main.yml)
    const otherContent = `
fixtures:
  other_entity:
    entity: "other"
    data:
      name: "Other Entity"
`;

    // Write test files
    fs.writeFileSync(path.join(testDir, 'foundation.yml'), foundationContent.trim());
    fs.writeFileSync(path.join(testDir, 'base.yml'), baseContent.trim());
    fs.writeFileSync(path.join(testDir, 'other.yml'), otherContent.trim());
    fs.writeFileSync(path.join(testDir, 'main.yml'), mainContent.trim());

    // Load the main file
    const result = await loader.loadFixtures('main.yml') as any;
        
    console.log('Loaded result:', JSON.stringify(result, null, 2));
        
    // The result should contain ALL @depends from both main.yml and included base.yml
    // Currently this likely fails because @includes doesn't encompass @depends from included files
        
    // Expected behavior: @depends should include both 'other.yml' (direct) and 'foundation.yml' (from included base.yml)
    expect(result['@depends']).toBeDefined();
        
    // Check if @depends contains dependencies from both main file and included file
    const depends = Array.isArray(result['@depends']) ? result['@depends'] : [result['@depends']];
        
    console.log('Current @depends:', depends);
    console.log('Expected: should contain both "other.yml" and "foundation.yml"');
        
    // This test will likely fail with current implementation
    // because @includes doesn't collect @depends from included files
    expect(depends).toContain('other.yml'); // from main file
    expect(depends).toContain('foundation.yml'); // from included file - this will likely fail
  });

  it('should handle deduplication when same dependency appears in multiple files', async () => {
    // Create common.yml that multiple files depend on
    const commonContent = `
fixtures:
  common_entity:
    entity: "common"
    data:
      name: "Common Entity"
`;

    // Create first.yml that depends on common.yml
    const firstContent = `
'@depends': 'common.yml'
fixtures:
  first_entity:
    entity: "first"
    data:
      name: "First Entity"
      commonId: "@common_entity"
`;

    // Create second.yml that also depends on common.yml
    const secondContent = `
'@depends': 'common.yml'
fixtures:
  second_entity:
    entity: "second"
    data:
      name: "Second Entity"
      commonId: "@common_entity"
`;

    // Create main.yml that includes both first.yml and second.yml
    const mainContent = `
'@includes': 
  - 'first.yml'
  - 'second.yml'
fixtures:
  main_entity:
    entity: "main"
    data:
      name: "Main Entity"
      firstId: "@first_entity"
      secondId: "@second_entity"
`;

    // Write test files
    fs.writeFileSync(path.join(testDir, 'common.yml'), commonContent.trim());
    fs.writeFileSync(path.join(testDir, 'first.yml'), firstContent.trim());
    fs.writeFileSync(path.join(testDir, 'second.yml'), secondContent.trim());
    fs.writeFileSync(path.join(testDir, 'main.yml'), mainContent.trim());

    // Load the main file
    const result = await loader.loadFixtures('main.yml') as any;
        
    console.log('Loaded result with deduplication:', JSON.stringify(result, null, 2));
        
    // The result should contain @depends but common.yml should appear only once
    // even though it's a dependency of both first.yml and second.yml
    if (result['@depends']) {
      const depends = Array.isArray(result['@depends']) ? result['@depends'] : [result['@depends']];
      const commonCount = depends.filter((dep: string) => dep === 'common.yml').length;
            
      console.log('Dependencies:', depends);
      console.log('common.yml appears', commonCount, 'times');
      console.log('Expected: should appear only 1 time (deduplicated)');
            
      expect(commonCount).toBe(1); // Should be deduplicated
    }
        
    // All fixtures should be present
    expect(result.fixtures.common_entity).toBeDefined();
    expect(result.fixtures.first_entity).toBeDefined();
    expect(result.fixtures.second_entity).toBeDefined();
    expect(result.fixtures.main_entity).toBeDefined();
  });
});