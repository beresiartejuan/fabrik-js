import type { Worker } from '../entities/index.js';
import type { WorkerFilter, WorkerRepository } from '../ports/index.js';
import type { WorkerId } from '../value-objects/index.js';

import { InMemoryStore } from './in-memory-store.js';

function matches(worker: Worker, filter?: WorkerFilter): boolean {
  if (filter?.role !== undefined && worker.role !== filter.role) {
    return false;
  }
  if (filter?.active !== undefined && worker.active !== filter.active) {
    return false;
  }
  return true;
}

/** Fake en memoria de `WorkerRepository` para tests (save = upsert). */
export class InMemoryWorkerRepository implements WorkerRepository {
  private readonly store = new InMemoryStore<WorkerId, Worker>();

  async findById(id: WorkerId): Promise<Worker | null> {
    return this.store.get(id);
  }

  async list(filter?: WorkerFilter): Promise<readonly Worker[]> {
    return this.store.all().filter((worker) => matches(worker, filter));
  }

  async save(worker: Worker): Promise<void> {
    this.store.upsert(worker);
  }

  /** Vacía el almacén (solo tests). */
  clear(): void {
    this.store.clear();
  }
}
