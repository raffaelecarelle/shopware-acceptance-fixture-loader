import { YamlFixtureProcessor } from '../YamlFixtureProcessor';
import * as fs from 'fs';
import * as path from 'path';
import { TEST_FIXTURES_DIR } from './setup';

const mockLoader = {
    loadFixtures: jest.fn(),
    processFixtureData: jest.fn(),
    getFixturesDir: jest.fn().mockReturnValue('/mock/fixtures/dir')
};

jest.mock('../YamlFixtureLoader', () => {
    return {
        YamlFixtureLoader: jest.fn(() => mockLoader)
    };
});

const mockResolver = {
    createProcessingPlan: jest.fn(),
    getInitialData: jest.fn(),
    getDeferredUpdates: jest.fn()
};

jest.mock('../CircularReferenceResolver', () => {
    return {
        CircularReferenceResolver: jest.fn(() => mockResolver)
    };
});

describe('YamlFixtureProcessor (public API only)', () => {
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

        mockAdminApiContext = {
            get: jest.fn(),
            post: jest.fn(),
            patch: jest.fn(),
            delete: jest.fn(),
            put: jest.fn()
        };

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

        // Configure resolver mock
        mockResolver.createProcessingPlan.mockReturnValue([{
            name: 'customer1',
            fixture: {
                entity: 'customer',
                data: {
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john@example.com'
                }
            },
            entity: { id: 'created-entity-id', name: 'Created Entity' },
            phase: 'initial',
            deferredFields: new Set()
        }]);
        mockResolver.getInitialData.mockReturnValue({
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com'
        });
        mockResolver.getDeferredUpdates.mockReturnValue({});

        jest.clearAllMocks();
    });

    afterEach(() => {
        if (fs.existsSync(testFixturesDir)) {
            fs.rmSync(testFixturesDir, { recursive: true, force: true });
        }
    });

    describe('constructor', () => {
        it('should create instance with fixtures directory', () => {
            expect(processor).toBeInstanceOf(YamlFixtureProcessor);
        });
    });

    describe('processFixtures', () => {
        beforeEach(() => {
            mockAdminApiContext.get.mockResolvedValue({ data: [] });
            mockAdminApiContext.post.mockResolvedValue({
                data: { id: 'created-entity-id', name: 'Created Entity' },
                ok: () => true
            });
            mockAdminApiContext.patch.mockResolvedValue({
                data: { id: 'updated-entity-id', name: 'Updated Entity' }
            });
        });

        it('should process simple fixtures', async () => {
            const mockFixtures = {
                customer1: {
                    entity: 'customer',
                    count: 1,
                    data: {
                        firstName: 'John',
                        lastName: 'Doe',
                        email: 'john@example.com'
                    }
                }
            };

            mockLoader.loadFixtures.mockReturnValue({ fixtures: mockFixtures });
            mockLoader.processFixtureData.mockReturnValue({
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com'
            });

            const result = await processor.processFixtures('test.yml', mockAdminApiContext, mockSystemData);

            expect(result).toBeDefined();
            expect(result.customer1).toBeDefined();
            expect(mockAdminApiContext.post).toHaveBeenCalled();
        });

        it('should process fixtures from array of files', async () => {
            const mockFixtures1 = {
                customer1: {
                    entity: 'customer',
                    count: 1,
                    data: {
                        firstName: 'John',
                        lastName: 'Doe',
                        email: 'john@example.com'
                    }
                }
            };

            const mockFixtures2 = {
                product1: {
                    entity: 'product',
                    count: 1,
                    data: {
                        name: 'Test Product',
                        price: 100
                    }
                }
            };

            // Mock loadFixtures to return different fixtures based on filename
            mockLoader.loadFixtures.mockImplementation((filename: string) => {
                if (filename === 'customers.yml') {
                    return { fixtures: mockFixtures1 };
                } else if (filename === 'products.yml') {
                    return { fixtures: mockFixtures2 };
                }
                return { fixtures: {} };
            });

            // Mock processFixtureData to return processed data
            mockLoader.processFixtureData.mockImplementation((data: any) => data);

            // Update resolver mock to handle both entities
            mockResolver.createProcessingPlan.mockReturnValue([
                {
                    name: 'customer1',
                    fixture: mockFixtures1.customer1,
                    entity: { id: 'customer-id', name: 'Customer' },
                    phase: 'initial',
                    deferredFields: new Set()
                },
                {
                    name: 'product1',
                    fixture: mockFixtures2.product1,
                    entity: { id: 'product-id', name: 'Product' },
                    phase: 'initial',
                    deferredFields: new Set()
                }
            ]);

            const result = await processor.processFixtures(['customers.yml', 'products.yml'], mockAdminApiContext, mockSystemData);

            expect(result).toBeDefined();
            expect(result.customer1).toBeDefined();
            expect(result.product1).toBeDefined();
            // Array processing calls processFixtures recursively for each file,
            // but with proper deduplication, each unique entity should only be created once
            expect(mockAdminApiContext.post).toHaveBeenCalledTimes(2);
        });
    });

    describe('cleanup', () => {
        beforeEach(() => {
            mockAdminApiContext.delete.mockResolvedValue({ ok: () => true });
            mockAdminApiContext.post.mockResolvedValue({
                data: { id: 'created-entity-id', name: 'Created Entity' },
                ok: () => true,
                json: async () => ({data: { id: 'created-entity-id', name: 'Created Entity' }})
            });
        });

        it('should cleanup entities for given fixtures', async () => {
            const mockFixtures = {
                customer1: {
                    entity: 'customer',
                    count: 1,
                    data: {
                        firstName: 'Jane',
                        lastName: 'Doe',
                        email: 'jane@example.com'
                    }
                }
            };

            mockLoader.loadFixtures.mockReturnValue({ fixtures: mockFixtures });
            mockLoader.processFixtureData.mockReturnValue({
                firstName: 'Jane',
                lastName: 'Doe',
                email: 'jane@example.com'
            });

            // First process fixtures to populate createdEntities
            await processor.processFixtures('test.yml', mockAdminApiContext, mockSystemData);
            
            await processor.cleanup(mockAdminApiContext);

            expect(mockAdminApiContext.delete).toHaveBeenCalled();
        });
    });
});
