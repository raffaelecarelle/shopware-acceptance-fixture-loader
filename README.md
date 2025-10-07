# Shopware Acceptance Fixture Loader

A TypeScript library for Shopware to create test data in Playwright using YAML fixtures. This library provides a powerful way to manage test fixtures with support for circular references, faker data generation, and Shopware API integration.

## Features

- 🎯 **YAML-based fixtures** - Define test data in readable YAML format
- 🔄 **Circular reference handling** - Automatically resolves circular dependencies between entities
- 🎲 **Faker integration** - Generate realistic fake data using Faker.js
- 🏪 **Shopware integration** - Direct integration with Shopware Admin API
- 🎭 **Playwright compatible** - Designed for use in Playwright test suites
- 🌍 **Italian localization** - Built-in support for Italian tax numbers and VAT codes
- 📦 **TypeScript support** - Full TypeScript definitions included

## Installation

```bash
npm install @raffaelecarelle/shopware-acceptance-fixture-loader
```

## Quick Start

### Basic Usage

```typescript
import { YamlFixtureLoader, YamlFixtureProcessor } from '@raffaelecarelle/shopware-acceptance-fixture-loader';

// Initialize the loader
const loader = new YamlFixtureLoader('./fixtures');
const processor = new YamlFixtureProcessor('./fixtures');

// Load and process fixtures - single file
const results = await processor.processFixtures(
    'customers.yml',
    adminApiContext,
    { salutation_id: 'some-uuid' }
);

// Load and process multiple fixtures - array of files
const multiResults = await processor.processFixtures(
    ['customers.yml', 'products.yml', 'orders.yml'],
    adminApiContext,
    { salutation_id: 'some-uuid' }
);
```

### YAML Fixture Format

Create YAML files in your fixtures directory:

```yaml
# fixtures/customers.yml
fixtures:
  customer_1:
    entity: customer
    data:
      salutationId: "{env.DEFAULT_SALUTATION_ID}"
      firstName: "{faker.person.firstName}"
      lastName: "{faker.person.lastName}"
      email: "{faker.internet.email}"
      password: "test123"
      vatIds:
        - "{faker.finance.vatNumber}"
      addresses:
        - street: "{faker.address.streetAddress}"
          zipcode: "{faker.address.zipCode}"
          city: "{faker.address.city}"
          countryId: "{env.DEFAULT_COUNTRY_ID}"
  
  customer_2:
    entity: customer
    existing: true
    criteria:
      email: "test@example.com"
    data:
      firstName: "Updated Name"
```

## API Reference

### YamlFixtureLoader

Main class for loading and processing YAML fixtures.

#### Constructor
```typescript
new YamlFixtureLoader(fixturesDir: string)
```

#### Methods

- `loadFixtures(filename: string): Promise<YamlFixtureConfig>` - Load fixtures from YAML file
- `processFixtureData(data: any, context: any): any` - Process fixture data with placeholders

### YamlFixtureProcessor

Handles Shopware API integration and entity creation.

#### Constructor
```typescript
new YamlFixtureProcessor(fixturesDir: string)
```

#### Methods

- `processFixtures(filename: string | string[], adminApiContext: any, systemData?: object): Promise<object>` - Process single fixture file or array of fixture files with Shopware API
- `cleanup(adminApiContext: any): Promise<void>` - Clean up created entities

### CircularReferenceResolver

Handles circular dependencies between fixtures.

#### Constructor
```typescript
new CircularReferenceResolver(references: Map<string, any>)
```

## Placeholder Types

The library supports various placeholder types in YAML fixtures:

### Faker Placeholders
```yaml
name: "{faker.person.firstName}"
email: "{faker.internet.email}"
uuid: "{faker.string.uuid}"
phone: "{faker.phone.number}"
company: "{faker.company.name}"
```

### Environment Variables
```yaml
api_url: "{env.SHOPWARE_API_URL}"
admin_user: "{env.ADMIN_USERNAME}"
```

### Context References
```yaml
customer_id: "{context.customer.id}"
parent_category: "@category_1"
```

### Italian Localization
```yaml
tax_number: "{faker.taxNumber}" # Italian tax number
vat_number: "{faker.vatNumber}" # Italian VAT number
```

## Advanced Features

### @includes Directive (File-level)

Reuse and merge fixture data from other YAML files using the `@includes` directive at the top of your file:

**Single file include:**
```yaml
'@includes': 'base_users.yml'
fixtures:
  custom_user:
    entity: customer
    data:
      firstName: "Custom"
      lastName: "User"
      email: "custom@example.com"
  # Override data from included file
  admin_user:
    entity: customer
    data:
      firstName: "Override Admin"
      role: "super_admin"
```

**Multiple files include (array):**
```yaml
'@includes': 
  - 'base_users.yml'
  - 'base_products.yml'
  - 'shared_settings.yml'
fixtures:
  custom_user:
    entity: customer
    data:
      firstName: "Custom"
      lastName: "User"
      email: "custom@example.com"
```

**Key features:**
- Current file data overrides included file data when fixture names match
- Supports nested includes (included files can also include other files)
- Prevents circular includes with clear error messages
- Merges all fixture data seamlessly
- **Automatically encompasses @depends** from included files and merges them with current file dependencies
- **Deduplicates dependencies** to prevent fixtures from being executed multiple times

### @include Directive (Entity-level)

Include and merge data from a specific fixture that was already loaded via `@includes` at file level:

```yaml
# base_customers.yml
fixtures:
  default_customer:
    entity: customer
    data:
      salutationId: "default-salutation-id"
      firstName: "John"
      lastName: "Doe"
      email: "john@example.com"
      password: "secret123"
      addresses:
        - street: "Main Street 123"
          zipcode: "12345"
          city: "Sample City"

# orders.yml
'@includes': 'base_customers.yml'  # Load base fixtures at file level
fixtures:
  order_1:
    entity: order
    data:
      '@include': default_customer  # Reference the loaded fixture
      firstName: "Jane"  # Overrides the included firstName
      orderNumber: "ORD-001"
      orderDate: "2024-01-01"
```

The resulting merged data for `order_1` will be:
```yaml
firstName: "Jane"           # Overridden from current entity
lastName: "Doe"             # From included fixture
email: "john@example.com"   # From included fixture
salutationId: "default-salutation-id"  # From included fixture
password: "secret123"       # From included fixture
addresses:                  # From included fixture
  - street: "Main Street 123"
    zipcode: "12345"
    city: "Sample City"
orderNumber: "ORD-001"      # Current entity only
orderDate: "2024-01-01"     # Current entity only
```

**Key features:**
- Must use `@includes` at file level first to load the fixtures
- Reference fixtures by their key using `'@include': fixture_key`
- Current entity data overrides included data (deep merge for nested objects)
- Works seamlessly with placeholders and faker data in included fixtures
- Multiple entities can reuse the same base fixture

**Reusing the same base across multiple entities:**
```yaml
'@includes': 'base_customers.yml'
fixtures:
  order_1:
    entity: order
    data:
      '@include': default_customer
      firstName: "Jane"
      orderNumber: "ORD-001"

  order_2:
    entity: order
    data:
      '@include': default_customer
      firstName: "Bob"
      orderNumber: "ORD-002"
```

**Including from multiple base files:**
```yaml
'@includes':
  - 'base_customers.yml'
  - 'base_addresses.yml'
fixtures:
  customer_with_custom_address:
    entity: customer
    data:
      '@include': default_customer
      # Override with address data from another base
      street: "{faker.location.streetAddress}"
```

### @depends Directive

Ensure fixtures are processed in the correct order using the `@depends` directive:

**Single dependency:**
```yaml
'@depends': 'customers.yml'
fixtures:
  order_1:
    entity: order
    data:
      customerId: "@customer_1"
      orderDate: "{faker.date.recent}"
      items:
        - productId: "@product_1"
          quantity: 2
```

**Multiple dependencies (array):**
```yaml
'@depends': 
  - 'customers.yml'
  - 'products.yml'
  - 'categories.yml'
fixtures:
  order_1:
    entity: order
    data:
      customerId: "@customer_1"
      orderDate: "{faker.date.recent}"
      items:
        - productId: "@product_1"
          quantity: 2
```

**Key features:**
- Dependent fixtures are automatically processed first
- Supports nested dependencies (dependencies can have their own dependencies)
- Prevents circular dependencies with clear error messages
- Ensures all referenced entities exist before processing current fixtures

### Combined Usage

You can use all three directives together:

**File-level directives (`@depends` and `@includes`):**
```yaml
'@depends': 'base_entities.yml'  # Process dependencies first
'@includes': 'shared_data.yml'    # Then merge shared fixture data
fixtures:
  my_entity:
    entity: custom_entity
    data:
      name: "My Entity"
      baseId: "@base_entity"      # From dependency
      sharedValue: "@shared_data" # From included file
```

**Combining file-level and entity-level includes:**
```yaml
'@includes': 'base_common.yml'    # Include common fixtures at file level
fixtures:
  customer_1:
    entity: customer
    data:
      '@include.default_customer': 'base_customers.yml'  # Include specific entity data
      '@include.default_address': 'base_addresses.yml'   # Include another entity data
      firstName: "CustomName"      # Override included data
      customField: "value"         # Add custom fields
```

This gives you maximum flexibility to:
- Reuse entire fixture files with `@includes` (file-level)
- Cherry-pick specific entity data with `@include.key` (entity-level)
- Manage execution order with `@depends`
- Override any included data as needed

### Multi-insertion Fixtures

Create multiple similar entities using range syntax:

```yaml
fixtures:
  product_{1...10}:
    entity: product
    data:
      name: "Product {faker.number.int}"
      price: "{faker.commerce.price}"
```

This creates `product_1`, `product_2`, ... `product_10`.

### Circular References

The library automatically handles circular references:

```yaml
fixtures:
  category_parent:
    entity: category
    data:
      name: "Parent Category"
      children:
        - "@category_child"
  
  category_child:
    entity: category
    data:
      name: "Child Category"
      parentId: "@category_parent"
```

### Existing Entity Updates

Update existing entities instead of creating new ones:

```yaml
fixtures:
  admin_user:
    entity: user
    existing: true
    criteria:
      username: "admin"
    data:
      email: "new-admin@example.com"
```

## Playwright Integration

Example usage in Playwright tests:

```typescript
import { test, expect } from '@playwright/test';
import { YamlFixtureProcessor } from '@raffaelecarelle/shopware-acceptance-fixture-loader';

test.describe('Customer Tests', () => {
  let fixtureProcessor: YamlFixtureProcessor;
  let adminApiContext: any;

  test.beforeAll(async () => {
    fixtureProcessor = new YamlFixtureProcessor('./fixtures');
    // Initialize your Shopware admin API context
    adminApiContext = await setupAdminApiContext();
  });

  test.afterAll(async () => {
    // Clean up created test data
    await fixtureProcessor.cleanup(adminApiContext);
  });

  test('should create customer with fixtures', async ({ page }) => {
    const results = await fixtureProcessor.processFixtures(
      'customer.yml',
      adminApiContext
    );

    const customer = results.customer_1;
    expect(customer.id).toBeDefined();
    
    // Use customer in your test
    await page.goto(`/admin/customer/${customer.id}`);
    // ... rest of your test
  });
});
```

## Configuration

### Environment Variables

Set up environment variables for your fixtures:

```bash
DEFAULT_SALUTATION_ID=your-salutation-id
DEFAULT_COUNTRY_ID=your-country-id
SHOPWARE_API_URL=http://localhost:8000
```

### TypeScript Configuration

The library includes full TypeScript support. Import types as needed:

```typescript
import type { 
  FixtureDefinition, 
  YamlFixtureConfig 
} from '@raffaelecarelle/shopware-acceptance-fixture-loader';
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC © Raffaele Carelle

## Changelog

### 1.0.0
- Initial release
- YAML fixture loading
- Faker integration
- Circular reference resolution
- Shopware API integration
- Italian localization support