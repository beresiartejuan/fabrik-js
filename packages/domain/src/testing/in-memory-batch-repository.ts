import type { Batch } from '../entities';
import type { BatchFilter, BatchRepository } from '../ports';
import type { BatchId, MaterialId } from '../value-objects';

import { InMemoryStore } from './in-memory-store';

function matches(batch: Batch, filter?: BatchFilter): boolean {
  if (filter?.materialId !== undefined && batch.materialId !== filter.materialId) {
    return false;
  }
  if (filter?.status !== undefined && batch.status !== filter.status) {
    return false;
  }
  if (filter?.recipeId !== undefined && batch.recipeId !== filter.recipeId) {
    return false;
  }
  return true;
}

/** Fake en memoria de `BatchRepository` para tests (save = upsert). */
export class InMemoryBatchRepository implements BatchRepository {
  private readonly store = new InMemoryStore<BatchId, Batch>();

  async findById(id: BatchId): Promise<Batch | null> {
    return this.store.get(id);
  }

  async findByMaterial(materialId: MaterialId): Promise<readonly Batch[]> {
    return this.store.all().filter((batch) => batch.materialId === materialId);
  }

  async list(filter?: BatchFilter): Promise<readonly Batch[]> {
    return this.store.all().filter((batch) => matches(batch, filter));
  }

  async save(batch: Batch): Promise<void> {
    this.store.upsert(batch);
  }

  /** Vacía el almacén (solo tests). */
  clear(): void {
    this.store.clear();
  }
}
