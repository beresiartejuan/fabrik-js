import type { Material } from '../entities/index.js';
import type { MaterialFilter, MaterialRepository } from '../ports/index.js';
import type { MaterialId } from '../value-objects/index.js';

import { InMemoryStore } from './in-memory-store.js';

function matches(material: Material, filter?: MaterialFilter): boolean {
  if (filter?.kind !== undefined && material.kind !== filter.kind) {
    return false;
  }
  if (filter?.physicalState !== undefined && material.physicalState !== filter.physicalState) {
    return false;
  }
  return true;
}

/** Fake en memoria de `MaterialRepository` para tests (save = upsert). */
export class InMemoryMaterialRepository implements MaterialRepository {
  private readonly store = new InMemoryStore<MaterialId, Material>();

  async findById(id: MaterialId): Promise<Material | null> {
    return this.store.get(id);
  }

  async list(filter?: MaterialFilter): Promise<readonly Material[]> {
    return this.store.all().filter((material) => matches(material, filter));
  }

  async save(material: Material): Promise<void> {
    this.store.upsert(material);
  }

  async existsByName(name: string): Promise<boolean> {
    return this.store.all().some((material) => material.name === name);
  }

  /** Vacía el almacén (solo tests). */
  clear(): void {
    this.store.clear();
  }
}
