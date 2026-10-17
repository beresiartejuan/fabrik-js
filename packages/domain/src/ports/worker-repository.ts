import type { Worker, WorkerRole } from '../entities/worker.js';
import type { WorkerId } from '../value-objects/ids.js';

// Filtro explícito y pequeño para `list`.
export interface WorkerFilter {
  readonly role?: WorkerRole;
  readonly active?: boolean;
}

/**
 * Persistencia del catálogo de trabajadores (docs/04, `CreateWorker`/`DeactivateWorker`).
 * `save` es upsert por `id`; `findById` devuelve `null` si no existe.
 */
export interface WorkerRepository {
  findById(id: WorkerId): Promise<Worker | null>;
  list(filter?: WorkerFilter): Promise<readonly Worker[]>;
  save(worker: Worker): Promise<void>;
}
