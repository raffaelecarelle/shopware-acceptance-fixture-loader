import { YamlFixtureProcessor } from '../src/YamlFixtureProcessor';
import * as fs from 'fs';
import * as path from 'path';

describe('Duplicate Endpoint Calls Fix', () => {
  let processor: YamlFixtureProcessor;
  let testDir: string;
  let mockApiContext: any;
  let apiCallTracker: { [endpoint: string]: number };

  beforeEach(() => {
    testDir = path.join(__dirname, 'temp-duplicate-calls');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    processor = new YamlFixtureProcessor(testDir);
        
    // Track API calls by endpoint
    apiCallTracker = {};
        
    mockApiContext = {
      get: jest.fn().mockImplementation((url) => {
        const endpoint = url.split('?')[0];
        apiCallTracker[endpoint] = (apiCallTracker[endpoint] || 0) + 1;
        return Promise.resolve({
          ok: () => true,
          json: () => Promise.resolve({ data: [{ id: 'existing-id' }] })
        });
      }),
      post: jest.fn().mockImplementation((url) => {
        apiCallTracker[url] = (apiCallTracker[url] || 0) + 1;
        return Promise.resolve({
          ok: () => true,
          json: () => Promise.resolve({ data: { id: 'created-id' } })
        });
      })
    };
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should not make duplicate endpoint calls when using @includes with @depends', async () => {
    // Create test fixture files that reproduce the original issue
    const customerContent = `
fixtures:
  customer:
    entity: "customer"
    data:
      id: "{faker.uuid}"
      firstName: "Test"
      lastName: "Customer"
`;

    const businessPartnerContent = `
'@depends':
  - customer.yml
fixtures:
  business_partner:
    entity: "b2b_business_partner"
    data:
      id: "{faker.uuid}"
      customerId: "@customer"
`;

    const employeeNoRolesContent = `
'@depends':
  - customer.yml
  - business_partner.yml
fixtures:
  employee:
    entity: "b2b_employee"
    data:
      id: "{faker.uuid}"
      businessPartnerCustomerId: "@customer"
`;

    const employeeWithAdminContent = `
'@depends':
  - customer.yml
  - business_partner.yml
'@includes':
  - employee_with_no_roles.yml
fixtures:
  employee:
    entity: "b2b_employee"
    data:
      roleId: "admin-role-id"
`;

    // Write test files
    fs.writeFileSync(path.join(testDir, 'customer.yml'), customerContent.trim());
    fs.writeFileSync(path.join(testDir, 'business_partner.yml'), businessPartnerContent.trim());
    fs.writeFileSync(path.join(testDir, 'employee_with_no_roles.yml'), employeeNoRolesContent.trim());
    fs.writeFileSync(path.join(testDir, 'employee_with_admin_role.yml'), employeeWithAdminContent.trim());

    // Process the fixture that caused duplicate calls
    await processor.processFixtures('employee_with_admin_role.yml', mockApiContext, {});

    // Verify no duplicate endpoint calls
    console.log('API call tracker:', apiCallTracker);
        
    // Check that each endpoint was called exactly once (not multiple times due to duplicates)
    expect(apiCallTracker['./customer']).toBe(1);
    expect(apiCallTracker['./b2b-business-partner']).toBe(1);
    expect(apiCallTracker['./b2b-employee']).toBe(1);
        
    // Verify total number of POST calls matches the number of unique entities
    const totalPostCalls = Object.values(apiCallTracker).reduce((sum: number, count: number) => sum + count, 0);
    expect(totalPostCalls).toBe(3); // Should be exactly 3: customer, business_partner, employee
  });
});