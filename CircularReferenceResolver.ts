import { FixtureDefinition } from './YamlFixtureLoader';

/**
 * Represents a fixture entity with its processing state
 */
interface ProcessingEntity {
    name: string;
    fixture: FixtureDefinition;
    phase: 'pending' | 'created' | 'updated';
    entity?: any;
    deferredFields: Map<string, string>; // field -> reference
}

/**
 * Handles circular references in fixture processing using a multi-phase approach
 */
export class CircularReferenceResolver {
  private entities: Map<string, ProcessingEntity> = new Map();
  private references: Map<string, any>;

  constructor(references: Map<string, any>) {
    this.references = references;
  }

  /**
     * Analyzes fixtures and creates a processing plan that handles circular references
     */
  createProcessingPlan(fixtures: { [key: string]: FixtureDefinition }): ProcessingEntity[] {
    // Initialize all entities
    for (const [name, fixture] of Object.entries(fixtures)) {
      this.entities.set(name, {
        name,
        fixture,
        phase: 'pending',
        deferredFields: new Map()
      });

      // Also add child entities
      if (fixture.children) {
        for (const [childName, childFixture] of Object.entries(fixture.children)) {
          this.entities.set(childName, {
            name: childName,
            fixture: childFixture,
            phase: 'pending',
            deferredFields: new Map()
          });
        }
      }
    }

    // Analyze dependencies and identify circular references
    this.analyzeDependencies();

    return Array.from(this.entities.values());
  }

  /**
     * Analyzes dependencies and marks fields that need deferred processing
     */
  private analyzeDependencies(): void {
    for (const entity of this.entities.values()) {
      if (!entity.fixture.data) continue;

      const circularFields = this.findCircularFields(entity.name, entity.fixture.data);
      entity.deferredFields = circularFields;
    }
  }

  /**
     * Finds fields that create circular references
     */
  private findCircularFields(entityName: string, data: any, visited: Set<string> = new Set()): Map<string, string> {
    const circularFields = new Map<string, string>();

    if (visited.has(entityName)) {
      return circularFields;
    }

    visited.add(entityName);

    this.extractReferences(data, (field: string, reference: string) => {
      if (this.entities.has(reference)) {
        // Check if this reference creates a cycle
        if (this.createsCycle(entityName, reference, new Set())) {
          circularFields.set(field, reference);
        }
      }
    });

    visited.delete(entityName);
    return circularFields;
  }

  /**
     * Checks if adding a dependency from source to target creates a cycle
     */
  private createsCycle(source: string, target: string, visited: Set<string>): boolean {
    if (source === target) return true;
    if (visited.has(target)) return false;

    visited.add(target);

    const targetEntity = this.entities.get(target);
    if (!targetEntity?.fixture.data) return false;

    const targetDeps = this.getDirectDependencies(targetEntity.fixture.data);

    for (const dep of targetDeps) {
      if (this.entities.has(dep) && this.createsCycle(source, dep, new Set(visited))) {
        return true;
      }
    }

    return false;
  }

  /**
     * Gets direct dependencies of an entity's data
     */
  private getDirectDependencies(data: any): string[] {
    const deps: string[] = [];
    this.extractReferences(data, (_field: string, reference: string) => {
      if (!deps.includes(reference)) {
        deps.push(reference);
      }
    });
    return deps;
  }

  /**
     * Extracts references from data object
     */
  // eslint-disable-next-line no-unused-vars
  private extractReferences(obj: any, callback: (field: string, reference: string) => void): void {
    if (typeof obj === 'string' && obj.startsWith('@')) {
      callback('', obj.substring(1));
    } else if (Array.isArray(obj)) {
      obj.forEach(item => this.extractReferences(item, callback));
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && value.startsWith('@')) {
          callback(key, value.substring(1));
        } else {
          this.extractReferences(value, callback);
        }
      }
    }
  }

  /**
     * Creates data for initial entity creation, excluding circular reference fields
     */
  getInitialData(entity: ProcessingEntity): any {
    if (!entity.fixture.data) return {};

    const data = JSON.parse(JSON.stringify(entity.fixture.data));

    // Remove circular reference fields
    for (const [field] of entity.deferredFields) {
      this.removeField(data, field);
    }

    return data;
  }

  /**
     * Gets deferred updates for an entity after all entities are created
     */
  getDeferredUpdates(entity: ProcessingEntity): { [key: string]: any } {
    const updates: { [key: string]: any } = {};

    for (const [field, reference] of entity.deferredFields) {
      if (this.references.has(reference)) {
        updates[field] = this.references.get(reference);
      }
    }

    return Object.keys(updates).length > 0 ? updates : {};
  }

  /**
     * Removes a field from nested object structure
     */
  private removeField(obj: any, fieldPath: string): void {
    if (typeof obj !== 'object' || obj === null) return;

    const parts = fieldPath.split('.');
    if (parts.length === 1) {
      delete obj[parts[0]];
      return;
    }

    const [first, ...rest] = parts;
    if (obj[first]) {
      this.removeField(obj[first], rest.join('.'));
    }
  }
}
