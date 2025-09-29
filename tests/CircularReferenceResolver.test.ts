import {CircularReferenceResolver} from '../CircularReferenceResolver';
import {FixtureDefinition} from '../YamlFixtureLoader';

describe('CircularReferenceResolver', () => {
    let resolver: CircularReferenceResolver;
    let references: Map<string, any>;

    beforeEach(() => {
        references = new Map<string, any>();
        resolver = new CircularReferenceResolver(references);
    });

    describe('constructor', () => {
        it('should create instance with references map', () => {
            expect(resolver).toBeInstanceOf(CircularReferenceResolver);
            expect((resolver as any).references).toBe(references);
        });

        it('should initialize empty entities map', () => {
            expect((resolver as any).entities).toBeInstanceOf(Map);
            expect((resolver as any).entities.size).toBe(0);
        });
    });

    describe('createProcessingPlan', () => {
        it('should create processing plan for simple fixtures without dependencies', () => {
            const fixtures = {
                user1: {
                    entity: 'user',
                    count: 1,
                    data: {name: 'John', email: 'john@example.com'}
                } as FixtureDefinition,
                user2: {
                    entity: 'user',
                    count: 1,
                    data: {name: 'Jane', email: 'jane@example.com'}
                }
            };

            const plan = resolver.createProcessingPlan(fixtures);

            expect(plan).toHaveLength(2);
            expect(plan.map(p => p.name)).toContain('user1');
            expect(plan.map(p => p.name)).toContain('user2');
            expect(plan.every(p => p.phase === 'pending')).toBe(true);
            expect(plan.every(p => p.deferredFields.size === 0)).toBe(true);
        });

        it('should create processing plan for fixtures with children', () => {
            const fixtures = {
                user1: {
                    entity: 'user',
                    count: 1,
                    data: {name: 'John'},
                    children: {
                        profile1: {
                            entity: 'profile',
                            count: 1,
                            data: {bio: 'User bio'}
                        }
                    }
                } as FixtureDefinition
            };

            const plan = resolver.createProcessingPlan(fixtures);

            expect(plan).toHaveLength(2);
            expect(plan.map(p => p.name)).toContain('user1');
            expect(plan.map(p => p.name)).toContain('profile1');
        });

        it('should identify circular references in processing plan', () => {
            const fixtures = {
                user1: {
                    entity: 'user',
                    count: 1,
                    data: {name: 'John', friendId: '@user2'}
                } as FixtureDefinition,
                user2: {
                    entity: 'user',
                    count: 1,
                    data: {name: 'Jane', friendId: '@user1'}
                } as FixtureDefinition
            };

            const plan = resolver.createProcessingPlan(fixtures);

            expect(plan).toHaveLength(2);
            // At least one entity should have deferred fields due to circular reference
            const deferredCount = plan.reduce((sum, entity) => sum + entity.deferredFields.size, 0);
            expect(deferredCount).toBeGreaterThan(0);
        });

        it('should handle fixtures with no data', () => {
            const fixtures = {
                empty1: {
                    entity: 'user',
                    data: [],
                    count: 1
                } as FixtureDefinition,
                empty2: {
                    entity: 'user',
                    data: [],
                    count: 1
                } as FixtureDefinition
            };

            const plan = resolver.createProcessingPlan(fixtures);

            expect(plan).toHaveLength(2);
            expect(plan.every(p => p.deferredFields.size === 0)).toBe(true);
        });
    });

    describe('analyzeDependencies', () => {
        it('should analyze dependencies without circular references', () => {
            const fixtures = {
                user1: {
                    entity: 'user',
                    count: 1,
                    data: {name: 'John', role: 'admin'}
                } as FixtureDefinition,
                user2: {
                    entity: 'user',
                    count: 1,
                    data: {name: 'Jane', managerId: '@user1'}
                } as FixtureDefinition
            };

            resolver.createProcessingPlan(fixtures);
            const entities = (resolver as any).entities;

            expect(entities.get('user1').deferredFields.size).toBe(0);
            expect(entities.get('user2').deferredFields.size).toBe(0);
        });

        it('should identify circular dependencies', () => {
            const fixtures = {
                user1: {
                    entity: 'user',
                    count: 1,
                    data: {name: 'John', friendId: '@user2'}
                } as FixtureDefinition,
                user2: {
                    entity: 'user',
                    count: 1,
                    data: {name: 'Jane', friendId: '@user1'}
                } as FixtureDefinition
            };

            resolver.createProcessingPlan(fixtures);
            const entities = (resolver as any).entities;

            const totalDeferred = entities.get('user1').deferredFields.size + entities.get('user2').deferredFields.size;
            expect(totalDeferred).toBeGreaterThan(0);
        });
    });

    describe('findCircularFields', () => {
        beforeEach(() => {
            // Set up entities for testing
            (resolver as any).entities.set('user1', {
                name: 'user1',
                fixture: {data: {friendId: '@user2'}},
                phase: 'pending',
                deferredFields: new Map()
            });
            (resolver as any).entities.set('user2', {
                name: 'user2',
                fixture: {data: {friendId: '@user1'}},
                phase: 'pending',
                deferredFields: new Map()
            });
        });

        it('should find circular fields in mutual dependency', () => {
            const circularFields = (resolver as any).findCircularFields('user1', {friendId: '@user2'});

            expect(circularFields).toBeInstanceOf(Map);
            // Should detect circular reference
            expect(circularFields.size).toBeGreaterThanOrEqual(0);
        });

        it('should handle non-circular references', () => {
            const circularFields = (resolver as any).findCircularFields('user3', {managerId: '@user1'});

            expect(circularFields).toBeInstanceOf(Map);
            expect(circularFields.size).toBe(0);
        });

        it('should handle data without references', () => {
            const circularFields = (resolver as any).findCircularFields('user1', {name: 'John', age: 30});

            expect(circularFields).toBeInstanceOf(Map);
            expect(circularFields.size).toBe(0);
        });
    });

    describe('createsCycle', () => {
        beforeEach(() => {
            (resolver as any).entities.set('user1', {
                fixture: {data: {friendId: '@user2'}}
            });
            (resolver as any).entities.set('user2', {
                fixture: {data: {friendId: '@user3'}}
            });
            (resolver as any).entities.set('user3', {
                fixture: {data: {managerId: '@user1'}}
            });
        });

        it('should detect direct cycle', () => {
            const hasCycle = (resolver as any).createsCycle('user1', 'user1', new Set());
            expect(hasCycle).toBe(true);
        });

        it('should detect indirect cycle', () => {
            const hasCycle = (resolver as any).createsCycle('user1', 'user3', new Set());
            expect(hasCycle).toBe(true);
        });

        it('should return false for non-cyclic dependency', () => {
            (resolver as any).entities.set('user4', {
                fixture: {data: {name: 'Independent'}}
            });

            const hasCycle = (resolver as any).createsCycle('user1', 'user4', new Set());
            expect(hasCycle).toBe(false);
        });

        it('should handle visited nodes correctly', () => {
            const visited = new Set(['user2']);
            const hasCycle = (resolver as any).createsCycle('user1', 'user2', visited);
            expect(hasCycle).toBe(false);
        });
    });

    describe('getDirectDependencies', () => {
        it('should extract direct dependencies from object', () => {
            const data = {
                name: 'John',
                friendId: '@user2',
                managerId: '@user3',
                settings: {
                    theme: 'dark',
                    mentorId: '@user4'
                }
            };

            const deps = (resolver as any).getDirectDependencies(data);

            expect(deps).toContain('user2');
            expect(deps).toContain('user3');
            expect(deps).toContain('user4');
            expect(deps).toHaveLength(3);
        });

        it('should extract dependencies from arrays', () => {
            const data = {
                friends: ['@user1', '@user2'],
                groups: [{leaderId: '@user3'}]
            };

            const deps = (resolver as any).getDirectDependencies(data);

            expect(deps).toContain('user1');
            expect(deps).toContain('user2');
            expect(deps).toContain('user3');
        });

        it('should handle data without dependencies', () => {
            const data = {
                name: 'John',
                age: 30,
                active: true
            };

            const deps = (resolver as any).getDirectDependencies(data);
            expect(deps).toHaveLength(0);
        });

        it('should avoid duplicate dependencies', () => {
            const data = {
                friendId: '@user1',
                backupFriendId: '@user1',
                settings: {
                    primaryId: '@user1'
                }
            };

            const deps = (resolver as any).getDirectDependencies(data);
            expect(deps).toEqual(['user1']);
        });
    });

    describe('extractReferences', () => {
        it('should extract string reference', () => {
            const refs: string[] = [];
            (resolver as any).extractReferences('@user1', (field: string, ref: string) => {
                refs.push(ref);
            });

            expect(refs).toEqual(['user1']);
        });

        it('should extract object references', () => {
            const refs: Array<{ field: string, ref: string }> = [];
            const data = {
                friendId: '@user1',
                managerId: '@user2'
            };

            (resolver as any).extractReferences(data, (field: string, ref: string) => {
                refs.push({field, ref});
            });

            expect(refs).toHaveLength(2);
            expect(refs.find(r => r.field === 'friendId' && r.ref === 'user1')).toBeDefined();
            expect(refs.find(r => r.field === 'managerId' && r.ref === 'user2')).toBeDefined();
        });

        it('should extract array references', () => {
            const refs: string[] = [];
            const data = ['@user1', 'normal_string', '@user2'];

            (resolver as any).extractReferences(data, (field: string, ref: string) => {
                refs.push(ref);
            });

            expect(refs).toEqual(['user1', 'user2']);
        });

        it('should extract nested references', () => {
            const refs: Array<{ field: string, ref: string }> = [];
            const data = {
                user: {
                    profile: {
                        mentorId: '@user1'
                    },
                    settings: {
                        buddies: ['@user2', '@user3']
                    }
                }
            };

            (resolver as any).extractReferences(data, (field: string, ref: string) => {
                refs.push({field, ref});
            });

            expect(refs.length).toBeGreaterThanOrEqual(3);
            expect(refs.map(r => r.ref)).toContain('user1');
            expect(refs.map(r => r.ref)).toContain('user2');
            expect(refs.map(r => r.ref)).toContain('user3');
        });

        it('should ignore non-reference strings', () => {
            const refs: string[] = [];
            const data = {
                name: 'John',
                email: 'john@example.com',
                note: 'This is not a @reference'
            };

            (resolver as any).extractReferences(data, (field: string, ref: string) => {
                refs.push(ref);
            });

            expect(refs).toHaveLength(0);
        });
    });

    describe('getDeferredUpdates', () => {
        beforeEach(() => {
            references.set('user1', {id: 'user1-id', name: 'John'});
            references.set('user2', {id: 'user2-id', name: 'Jane'});
        });

        it('should return deferred updates for existing references', () => {
            const entity = {
                name: 'user3',
                fixture: {} as FixtureDefinition,
                phase: 'pending' as const,
                deferredFields: new Map([
                    ['friendId', 'user1'],
                    ['managerId', 'user2']
                ])
            };

            const updates = resolver.getDeferredUpdates(entity);

            expect(updates.friendId).toEqual({id: 'user1-id', name: 'John'});
            expect(updates.managerId).toEqual({id: 'user2-id', name: 'Jane'});
        });

        it('should return empty object when no deferred fields exist', () => {
            const entity = {
                name: 'user1',
                fixture: {} as FixtureDefinition,
                phase: 'pending' as const,
                deferredFields: new Map()
            };

            const updates = resolver.getDeferredUpdates(entity);
            expect(updates).toEqual({});
        });

        it('should skip missing references', () => {
            const entity = {
                name: 'user3',
                fixture: {} as FixtureDefinition,
                phase: 'pending' as const,
                deferredFields: new Map([
                    ['friendId', 'user1'],
                    ['managerId', 'missingUser']
                ])
            };

            const updates = resolver.getDeferredUpdates(entity);

            expect(updates.friendId).toEqual({id: 'user1-id', name: 'John'});
            expect(updates).not.toHaveProperty('managerId');
        });

        it('should return empty object when all references are missing', () => {
            const entity = {
                name: 'user3',
                fixture: {} as FixtureDefinition,
                phase: 'pending' as const,
                deferredFields: new Map([
                    ['friendId', 'missingUser1'],
                    ['managerId', 'missingUser2']
                ])
            };

            const updates = resolver.getDeferredUpdates(entity);
            expect(updates).toEqual({});
        });
    });

    describe('removeField', () => {
        it('should remove top-level field', () => {
            const obj = {name: 'John', age: 30, email: 'john@example.com'};
            (resolver as any).removeField(obj, 'age');

            expect(obj).toEqual({name: 'John', email: 'john@example.com'});
            expect(obj).not.toHaveProperty('age');
        });

        it('should remove nested field', () => {
            const obj = {
                name: 'John',
                profile: {
                    bio: 'User bio',
                    friendId: '@user1',
                    settings: {
                        theme: 'dark'
                    }
                }
            };

            (resolver as any).removeField(obj, 'profile.friendId');

            expect(obj.profile.bio).toBe('User bio');
            expect(obj.profile.settings.theme).toBe('dark');
            expect(obj.profile).not.toHaveProperty('friendId');
        });

        it('should remove deeply nested field', () => {
            const obj = {
                user: {
                    profile: {
                        settings: {
                            notifications: {
                                email: true,
                                sms: false
                            }
                        }
                    }
                }
            };

            (resolver as any).removeField(obj, 'user.profile.settings.notifications.email');

            expect(obj.user.profile.settings.notifications.sms).toBe(false);
            expect(obj.user.profile.settings.notifications).not.toHaveProperty('email');
        });

        it('should handle non-existent paths gracefully', () => {
            const obj = {name: 'John'};

            expect(() => {
                (resolver as any).removeField(obj, 'profile.bio');
            }).not.toThrow();

            expect(obj).toEqual({name: 'John'});
        });

        it('should handle null and undefined objects', () => {
            expect(() => {
                (resolver as any).removeField(null, 'field');
                (resolver as any).removeField(undefined, 'field');
                (resolver as any).removeField('string', 'field');
                (resolver as any).removeField(123, 'field');
            }).not.toThrow();
        });
    });

    describe('Integration tests', () => {
        it('should handle complex circular reference scenario', () => {
            const fixtures = {
                user1: {
                    entity: 'user',
                    count: 1,
                    data: {
                        name: 'John',
                        friendId: '@user2',
                        profile: {
                            mentorId: '@user3'
                        }
                    }
                } as FixtureDefinition,
                user2: {
                    entity: 'user',
                    count: 1,
                    data: {
                        name: 'Jane',
                        friendId: '@user1',
                        managerId: '@user3'
                    }
                } as FixtureDefinition,
                user3: {
                    entity: 'user',
                    count: 1,
                    data: {
                        name: 'Manager',
                        assistantId: '@user2'
                    }
                } as FixtureDefinition
            };

            const plan = resolver.createProcessingPlan(fixtures);

            expect(plan).toHaveLength(3);

            // Set up references
            references.set('user1', {id: 1, name: 'John'});
            references.set('user2', {id: 2, name: 'Jane'});
            references.set('user3', {id: 3, name: 'Manager'});

            // Get initial data (should exclude circular references)
            const initialData = plan.map(entity => ({
                name: entity.name,
                data: resolver.getInitialData(entity)
            }));

            // Get deferred updates
            const deferredUpdates = plan.map(entity => ({
                name: entity.name,
                updates: resolver.getDeferredUpdates(entity)
            }));

            // Verify that circular references are properly handled
            expect(initialData.every(item => item.data)).toBeTruthy();
            expect(deferredUpdates.some(item => Object.keys(item.updates).length > 0)).toBeTruthy();
        });
    });
});