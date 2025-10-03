import * as fs from 'fs';
import * as path from 'path';
import { YamlFixtureLoader } from '../src/YamlFixtureLoader';

describe('Reproduce @includes merging issue', () => {
    let loader: YamlFixtureLoader;
    let testDir: string;

    beforeEach(() => {
        testDir = path.join(__dirname, 'temp-reproduce');
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

    it('should reproduce the @includes merging issue', async () => {
        // Create employee_with_no_roles.yml
        const noRolesContent = `
'@depends':
  - customer
  - salutation

fixtures:
  employee:
    entity: "b2b_employee"
    data:
      id: "{faker.uuid}"
      firstName: "{faker.firstName}"
      lastName: "{faker.lastName}"
      email: "{faker.email}"
      password: "$2y$10$XFRhv2TdOz9GItRt6ZgHl.e/HpO5Mfea6zDNXI9Q8BasBRtWbqSTS"
      active: true
      status: 'active'
      businessPartnerCustomerId: "@customer"
      salutationId: "@salutation"
      languageId: "@language_it"
`;

        // Create employee_with_admin_role.yml
        const adminRoleContent = `
'@depends':
  - admin_role.yml
  - salutation.yml
  - customer.yml

'@includes':
  - employee_with_no_roles.yml

fixtures:
  employee:
    entity: "b2b_employee"
    data:
      roleId: "@admin_role"
`;

        // Write test files
        fs.writeFileSync(path.join(testDir, 'employee_with_no_roles.yml'), noRolesContent.trim());
        fs.writeFileSync(path.join(testDir, 'employee_with_admin_role.yml'), adminRoleContent.trim());

        // Load the file with @includes
        const result = await loader.loadFixtures('employee_with_admin_role.yml');
        
        console.log('Loaded result:', JSON.stringify(result, null, 2));
        
        // Get the employee fixture
        const employeeFixture = result.fixtures.employee;
        console.log('Employee fixture data:', JSON.stringify(employeeFixture.data, null, 2));

        // Expected properties from both files
        const expectedProperties = [
            'id', 'firstName', 'lastName', 'email', 'password', 
            'active', 'status', 'businessPartnerCustomerId', 
            'salutationId', 'languageId', 'roleId'
        ];

        const actualProperties = Object.keys(employeeFixture.data);
        console.log('Expected properties:', expectedProperties);
        console.log('Actual properties:', actualProperties);

        // Check if all properties are present
        const missingProperties = expectedProperties.filter(prop => !actualProperties.includes(prop));
        console.log('Missing properties:', missingProperties);

        // Check if the fix works correctly
        if (missingProperties.length === 0) {
            console.log('✅ FIX CONFIRMED: All properties are correctly merged');
            console.log('Properties from both files are present as expected');
        } else {
            console.log('❌ ISSUE STILL EXISTS: Missing properties from included file');
            console.log('Missing:', missingProperties);
        }

        // Verify the fix works correctly
        expect(employeeFixture).toBeDefined();
        expect(employeeFixture.data).toBeDefined();
        
        // Verify all expected properties are present
        expect(missingProperties).toHaveLength(0);
        
        // Verify specific properties from both files
        expect(employeeFixture.data.roleId).toBe('@admin_role'); // From current file
        expect(employeeFixture.data.firstName).toBe('{faker.firstName}'); // From included file
        expect(employeeFixture.data.email).toBe('{faker.email}'); // From included file
        expect(employeeFixture.data.active).toBe(true); // From included file
        
        // Verify that current file properties override included file properties when they have the same name
        expect(employeeFixture.entity).toBe('b2b_employee'); // Should be the same in both files
    });
});