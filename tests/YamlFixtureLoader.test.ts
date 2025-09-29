import * as fs from 'fs';
import * as path from 'path';
import { YamlFixtureLoader } from '../YamlFixtureLoader';
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
        it('should load simple YAML fixture file', async () => {
            const fixtureData = {
                fixtures: {
                    user1: {
                        entity: 'User',
                        data: {
                            name: 'John Doe',
                            email: 'john@example.com'
                        }
                    }
                }
            };

            const fixturePath = path.join(testFixturesDir, 'simple.yml');
            fs.writeFileSync(fixturePath, `
fixtures:
  user1:
    entity: User
    data:
      name: John Doe
      email: john@example.com
      `);

            const result = await loader.loadFixtures('simple.yml');
            expect(result).toEqual(fixtureData);
        });

        it('should throw error for non-existent file', async () => {
            await expect(loader.loadFixtures('nonexistent.yml')).rejects.toThrow();
        });

        it('should load YAML with multiple fixtures', async () => {
            const fixturePath = path.join(testFixturesDir, 'multiple.yml');
            fs.writeFileSync(fixturePath, `
fixtures:
  user1:
    entity: User
    data:
      name: User 1
  user2:
    entity: User  
    data:
      name: User 2
      `);

            const result = await loader.loadFixtures('multiple.yml');

            expect(Object.keys(result.fixtures)).toHaveLength(2);
            expect(result.fixtures.user1.data.name).toBe('User 1');
            expect(result.fixtures.user2.data.name).toBe('User 2');
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

        it('should process faker placeholders', () => {
            const data = {
                name: '{faker.firstName}',
                email: '{faker.email}',
                company: '{faker.company}'
            };
            const context = {};

            const result = loader.processFixtureData(data, context);

            expect(typeof result.name).toBe('string');
            expect(result.name).not.toBe('{faker.firstName}');
            expect(typeof result.email).toBe('string');
            expect(result.email).toMatch(/^[\w\.-]+@[\w\.-]+\.\w+$/);
            expect(typeof result.company).toBe('string');
        });

        it('should process context references', () => {
            const data = {
                greeting: 'Hello {context.userName}',
                message: 'Welcome {context.userName}, your role is {context.userRole}'
            };
            const context = {
                data: {
                    userName: 'testuser',
                    userRole: 'admin'
                }
            };

            const result = loader.processFixtureData(data, context);

            expect(result.greeting).toBe('Hello testuser');
            expect(result.message).toBe('Welcome testuser, your role is admin');
        });

        it('should process @ references', () => {
            const data = {
                userId: '@user1'
            };
            const context = {
                references: {
                    user1: 'user_123'
                }
            };

            const result = loader.processFixtureData(data, context);

            expect(result.userId).toBe('user_123');
        });
    });

    describe('Integration tests', () => {
        it('should process fixture with placeholders and fake data', async () => {
            const fixturePath = path.join(testFixturesDir, 'integrated.yml');
            fs.writeFileSync(fixturePath, `
fixtures:
  user1:
    entity: User
    data:
      name: "{faker.firstName} {faker.lastName}"
      email: "{faker.email}"
      company: "{faker.company}"
      phone: "{faker.phone}"
      `);

            const fixtures = await loader.loadFixtures('integrated.yml');
            const context = {};

            const processedData = loader.processFixtureData(fixtures.fixtures.user1.data, context);

            expect(typeof processedData.name).toBe('string');
            expect(processedData.name).toMatch(/^[A-Za-z]+ [A-Za-z]+$/);
            expect(typeof processedData.email).toBe('string');
            expect(processedData.email).toMatch(/^[\w\.-]+@[\w\.-]+\.\w+$/);
            expect(typeof processedData.company).toBe('string');
            expect(typeof processedData.phone).toBe('string');
        });

        it('should process fixture with context references', () => {
            const data = {
                greeting: 'Hello {context.userName}',
                message: 'Welcome {context.userName}, your role is {context.userRole}'
            };
            const context = {
                data: {
                    userName: 'testuser',
                    userRole: 'admin'
                }
            };

            const result = loader.processFixtureData(data, context);

            expect(result.greeting).toBe('Hello testuser');
            expect(result.message).toBe('Welcome testuser, your role is admin');
        });

        it('should process fixtures with array references', () => {
            // Test che la classe NON supporta ancora i riferimenti ad array nested
            // Questo test documenta il comportamento attuale
            const data = {
                firstAddressId: 'address_{addresses[0].id}',
                secondAddressCity: 'City: {addresses[1].city}'
            };

            const context = {
                currentData: {
                    addresses: [
                        { id: 'addr_123', city: 'Rome' },
                        { id: 'addr_456', city: 'Milan' }
                    ]
                }
            };

            const result = loader.processFixtureData(data, context);

            // Al momento i placeholder con array reference non vengono risolti
            expect(result.firstAddressId).toBe('address_addresses[0].id');
            expect(result.secondAddressCity).toBe('City: addresses[1].city');
        });
    });

    describe('Error handling', () => {
        it('should handle malformed YAML', async () => {
            const fixturePath = path.join(testFixturesDir, 'malformed.yml');
            fs.writeFileSync(fixturePath, `
fixtures:
  user1: {
    invalid: yaml: structure: with: colons
      `);

            await expect(loader.loadFixtures('malformed.yml')).rejects.toThrow(/Failed to parse YAML/);
        });

        it('should handle empty fixtures file', async () => {
            const fixturePath = path.join(testFixturesDir, 'empty.yml');
            fs.writeFileSync(fixturePath, '');

            const result = await loader.loadFixtures('empty.yml');
            expect(result).toBeUndefined(); // Empty YAML returns undefined, not null
        });

        it('should handle missing context values gracefully', () => {
            const data = {
                missing: '{context.nonExistent}',
                partial: 'Value: {context.missing}'
            };
            const context = { data: {} };

            const result = loader.processFixtureData(data, context);

            // La classe restituisce "undefined" per i valori mancanti del context
            expect(result.missing).toBe('undefined');
            expect(result.partial).toBe('Value: undefined');
        });
    });

    describe('Caching', () => {
        it('should cache loaded fixtures', async () => {
            const fixturePath = path.join(testFixturesDir, 'cached.yml');
            fs.writeFileSync(fixturePath, `
fixtures:
  user1:
    entity: User
    data:
      name: Cached User
      `);

            // First load
            const result1 = await loader.loadFixtures('cached.yml');

            // Second load should use cache
            const result2 = await loader.loadFixtures('cached.yml');

            expect(result1).toBe(result2); // Same object reference due to caching
            expect(result1.fixtures.user1.data.name).toBe('Cached User');
        });
    });

    describe('Faker data generation', () => {
        it('should generate consistent types for different faker calls', () => {
            const data = {
                email1: '{faker.email}',
                email2: '{faker.internet.email}',
                name1: '{faker.firstName}',
                name2: '{faker.person.firstName}',
                uuid: '{faker.uuid}',
                number: '{faker.number}',
                date: '{faker.date}',
                company: '{faker.company}',
                phone: '{faker.phone}',
                italianTax: '{faker.it_tax_number}',
                italianVAT: '{faker.it_vat_number}'
            };

            const result = loader.processFixtureData(data, {});

            expect(result.email1).toMatch(/^[\w\.-]+@[\w\.-]+\.\w+$/);
            expect(result.email2).toMatch(/^[\w\.-]+@[\w\.-]+\.\w+$/);
            expect(typeof result.name1).toBe('string');
            expect(typeof result.name2).toBe('string');
            expect(typeof result.uuid).toBe('string');
            expect(typeof result.number).toBe('number'); // faker.number ritorna number
            expect(typeof result.date).toBe('string');
            expect(typeof result.company).toBe('string');
            expect(typeof result.phone).toBe('string');
            expect(result.italianTax).toMatch(/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z0-9]{4}$/); // Pattern corretto per il codice fiscale italiano
            expect(result.italianVAT).toMatch(/^IT\d{11}$/);
        });
    });
});