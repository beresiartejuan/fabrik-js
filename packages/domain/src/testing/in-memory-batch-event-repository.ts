import type { BatchEvent, BatchQuantity } from '../entities';
import type { BatchEventFilter, BatchEventRepository } from '../ports';
import type { BatchEventId, BatchId } from '../value-objects';

import { InMemoryStore } from './in-memory-store';

function hasMaterial(items: readonly BatchQuantity[], materialId: string): boolean {
  return items.some((item) => item.materialId === materialId);
}

function consumesBatch(event: BatchEvent, batchId: string): boolean {
  return event.inputs.some((item) => item.batchId === batchId);
}

function matches(event: BatchEvent, filter?: BatchEventFilter): boolean {
  if (filter?.machineId !== undefined && event.machineId !== filter.machineId) {
    return false;
  }
  if (filter?.workerId !== undefined && event.workerId !== filter.workerId) {
    return false;
  }
  if (
    filter?.materialId !== undefined &&
    !hasMaterial(event.inputs, filter.materialId) &&
    !hasMaterial(event.outputs, filter.materialId)
  ) {
    return false;
  }
  const range = filter?.dateRange;
  if (range?.from !== undefined && event.timestamp < range.from) {
    return false;
  }
  if (range?.to !== undefined && event.timestamp > range.to) {
    return false;
  }
  return true;
}

/** Fake en memoria append-only de `BatchEventRepository` para tests. */
export class InMemoryBatchEventRepository implements BatchEventRepository {
  private readonly store = new InMemoryStore<BatchEventId, BatchEvent>();

  async add(event: BatchEvent): Promise<void> {
    this.store.upsert(event);
  }

  async findById(id: BatchEventId): Promise<BatchEvent | null> {
    return this.store.get(id);
  }

  async listBy(filters?: BatchEventFilter): Promise<readonly BatchEvent[]> {
    return this.store.all().filter((event) => matches(event, filters));
  }

  async listByInputBatchId(batchId: BatchId): Promise<readonly BatchEvent[]> {
    return this.store.all().filter((event) => consumesBatch(event, batchId));
  }

  /** Vacía el almacén (solo tests). */
  clear(): void {
    this.store.clear();
  }
}
