import * as fs from 'fs';
import * as path from 'path';
import { YamlFixtureLoader } from '../src/YamlFixtureLoader';
import { TEST_FIXTURES_DIR } from './setup';

describe('Entity-level @include directive', () => {
  let loader: YamlFixtureLoader;
  let testFixturesDir: string;

  beforeEach(() => {
    testFixturesDir = path.join(TEST_FIXTURES_DIR, 'entity-include');
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

  it('should include and merge entity data using @include', async () => {
    // Create base customer file
    const baseCustomerPath = path.join(testFixturesDir, 'base_customers.yml');
    fs.writeFileSync(baseCustomerPath, `
fixtures:
  default_customer:
    entity: customer
    data:
      salutationId: "base-salutation-id"
      firstName: "BaseFirstName"
      lastName: "BaseLastName"
      email: "base@example.com"
      password: "basepass123"
      addresses:
        - street: "Base Street"
          zipcode: "12345"
          city: "BaseCity"
`);

    // Create order file that includes base_customers at file level
    const orderPath = path.join(testFixturesDir, 'orders.yml');
    fs.writeFileSync(orderPath, `
'@includes': 'base_customers.yml'
fixtures:
  order_1:
    entity: order
    data:
      '@include': default_customer
      firstName: "OverriddenFirstName"
      orderNumber: "ORD-001"
      orderDate: "2024-01-01"
`);

    const fixtures = await loader.loadFixtures('orders.yml');
    const processedData = await loader.processFixtureData(
      fixtures.fixtures.order_1.data,
      { allFixtures: fixtures.fixtures }
    );

    // Check that data was merged correctly
    expect(processedData.firstName).toBe('OverriddenFirstName'); // Current file overrides
    expect(processedData.lastName).toBe('BaseLastName'); // From included file
    expect(processedData.email).toBe('base@example.com'); // From included file
    expect(processedData.salutationId).toBe('base-salutation-id'); // From included file
    expect(processedData.orderNumber).toBe('ORD-001'); // Current file only
    expect(processedData.orderDate).toBe('2024-01-01'); // Current file only
    expect(processedData.addresses).toEqual([
      { street: 'Base Street', zipcode: '12345', city: 'BaseCity' }
    ]); // From included file

    // Ensure @include directive is removed from final data
    expect(processedData['@include']).toBeUndefined();
  });

  it('should handle nested objects in included data', async () => {
    // Create base file with nested structure
    const basePath = path.join(testFixturesDir, 'base_nested.yml');
    fs.writeFileSync(basePath, `
fixtures:
  base_entity:
    entity: product
    data:
      name: "Base Product"
      price:
        net: 100
        gross: 119
        currency: "EUR"
      stock:
        quantity: 50
        available: true
`);

    // Create file that includes and overrides nested data
    const productPath = path.join(testFixturesDir, 'products.yml');
    fs.writeFileSync(productPath, `
'@includes': 'base_nested.yml'
fixtures:
  product_1:
    entity: product
    data:
      '@include': base_entity
      name: "Custom Product"
      price:
        net: 200
        gross: 238
`);

    const fixtures = await loader.loadFixtures('products.yml');
    const processedData = await loader.processFixtureData(
      fixtures.fixtures.product_1.data,
      { allFixtures: fixtures.fixtures }
    );

    // Check merged data
    expect(processedData.name).toBe('Custom Product');
    expect(processedData.price.net).toBe(200);
    expect(processedData.price.gross).toBe(238);
    expect(processedData.price.currency).toBe('EUR'); // Not overridden, kept from base
    expect(processedData.stock).toEqual({ quantity: 50, available: true }); // From base
  });

  it('should throw error if fixture key is not found', async () => {
    const basePath = path.join(testFixturesDir, 'base.yml');
    fs.writeFileSync(basePath, `
fixtures:
  existing_key:
    entity: customer
    data:
      name: "Test"
`);

    const testPath = path.join(testFixturesDir, 'test.yml');
    fs.writeFileSync(testPath, `
'@includes': 'base.yml'
fixtures:
  test_entity:
    entity: order
    data:
      '@include': non_existent_key
      orderNumber: "ORD-001"
`);

    const fixtures = await loader.loadFixtures('test.yml');

    await expect(
      loader.processFixtureData(
        fixtures.fixtures.test_entity.data,
        { allFixtures: fixtures.fixtures }
      )
    ).rejects.toThrow(/Fixture key 'non_existent_key' not found/);
  });

  it('should throw error if no allFixtures in context', async () => {
    const testPath = path.join(testFixturesDir, 'test.yml');
    fs.writeFileSync(testPath, `
fixtures:
  test_entity:
    entity: order
    data:
      '@include': some_key
      orderNumber: "ORD-001"
`);

    const fixtures = await loader.loadFixtures('test.yml');

    await expect(
      loader.processFixtureData(fixtures.fixtures.test_entity.data, {})
    ).rejects.toThrow(/no fixtures available in context/);
  });

  it('should work with placeholders in included data', async () => {
    const basePath = path.join(testFixturesDir, 'base_with_placeholders.yml');
    fs.writeFileSync(basePath, `
fixtures:
  default_customer:
    entity: customer
    data:
      firstName: "{faker.firstName}"
      lastName: "{faker.lastName}"
      email: "{faker.email}"
`);

    const customerPath = path.join(testFixturesDir, 'customers.yml');
    fs.writeFileSync(customerPath, `
'@includes': 'base_with_placeholders.yml'
fixtures:
  customer_1:
    entity: customer
    data:
      '@include': default_customer
      firstName: "SpecificName"
`);

    const fixtures = await loader.loadFixtures('customers.yml');
    const processedData = await loader.processFixtureData(
      fixtures.fixtures.customer_1.data,
      { allFixtures: fixtures.fixtures }
    );

    // firstName is overridden, so should not be generated
    expect(processedData.firstName).toBe('SpecificName');

    // lastName and email should be generated from faker
    expect(typeof processedData.lastName).toBe('string');
    expect(processedData.lastName).not.toBe('{faker.lastName}');
    expect(typeof processedData.email).toBe('string');
    expect(processedData.email).toMatch(/^[\w.-]+@[\w.-]+\.\w+$/);
  });

  it('should work when including from multiple @includes files', async () => {
    // Base customer file
    const baseCustomerPath = path.join(testFixturesDir, 'base_customers.yml');
    fs.writeFileSync(baseCustomerPath, `
fixtures:
  default_customer:
    entity: customer
    data:
      firstName: "BaseFirst"
      lastName: "BaseLast"
      status: "active"
`);

    // Base address file
    const baseAddressPath = path.join(testFixturesDir, 'base_addresses.yml');
    fs.writeFileSync(baseAddressPath, `
fixtures:
  default_address:
    entity: address
    data:
      street: "Default Street"
      zipcode: "00000"
      city: "DefaultCity"
`);

    // File that includes both and uses entities from both
    const testPath = path.join(testFixturesDir, 'test.yml');
    fs.writeFileSync(testPath, `
'@includes':
  - 'base_customers.yml'
  - 'base_addresses.yml'
fixtures:
  test_customer:
    entity: customer
    data:
      '@include': default_customer
      firstName: "OverrideFirst"
  test_order:
    entity: order
    data:
      '@include': default_address
      street: "Override Street"
`);

    const fixtures = await loader.loadFixtures('test.yml');

    // Test customer
    const customerData = await loader.processFixtureData(
      fixtures.fixtures.test_customer.data,
      { allFixtures: fixtures.fixtures }
    );
    expect(customerData.firstName).toBe('OverrideFirst');
    expect(customerData.lastName).toBe('BaseLast');
    expect(customerData.status).toBe('active');

    // Test order using address data
    const orderData = await loader.processFixtureData(
      fixtures.fixtures.test_order.data,
      { allFixtures: fixtures.fixtures }
    );
    expect(orderData.street).toBe('Override Street');
    expect(orderData.zipcode).toBe('00000');
    expect(orderData.city).toBe('DefaultCity');
  });

  it('should allow multiple fixtures to include the same base', async () => {
    const basePath = path.join(testFixturesDir, 'base.yml');
    fs.writeFileSync(basePath, `
fixtures:
  base_customer:
    entity: customer
    data:
      status: "active"
      role: "customer"
`);

    const testPath = path.join(testFixturesDir, 'test.yml');
    fs.writeFileSync(testPath, `
'@includes': 'base.yml'
fixtures:
  customer_1:
    entity: customer
    data:
      '@include': base_customer
      firstName: "John"
  customer_2:
    entity: customer
    data:
      '@include': base_customer
      firstName: "Jane"
`);

    const fixtures = await loader.loadFixtures('test.yml');

    const customer1 = await loader.processFixtureData(
      fixtures.fixtures.customer_1.data,
      { allFixtures: fixtures.fixtures }
    );
    const customer2 = await loader.processFixtureData(
      fixtures.fixtures.customer_2.data,
      { allFixtures: fixtures.fixtures }
    );

    expect(customer1.firstName).toBe('John');
    expect(customer1.status).toBe('active');
    expect(customer1.role).toBe('customer');

    expect(customer2.firstName).toBe('Jane');
    expect(customer2.status).toBe('active');
    expect(customer2.role).toBe('customer');
  });
});
