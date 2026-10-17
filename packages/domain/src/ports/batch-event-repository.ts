import type { BatchEvent } from '../entities/batch-event.js';
import type {
  BatchEventId,
  BatchId,
  MachineId,
  MaterialId,
  WorkerId,
} from '../value-objects/ids.js';

// Rango temporal inclusivo [from, to] (ambos extremos opcionales).
export interface DateRange {
  readonly from?: Date;
  readonly to?: Date;
}

// Filtro explícito para `listBy` (docs/04, `ListBatchEvents`).
export interface BatchEventFilter {
  readonly machineId?: MachineId;
  readonly workerId?: WorkerId;
  /** `materialId` matches events where the material appears in inputs OR outputs. */
  readonly materialId?: MaterialId;
  readonly dateRange?: DateRange;
}

/**
 * Persistencia append-only de eventos de transformación (I4): solo se agregan,
 * nunca se actualizan ni borran. `findById` devuelve `null` si no existe.
 */
export interface BatchEventRepository {
  /** Agrega un evento inmutable. Idempotente por `id` (re-`add` reemplaza). */
  add(event: BatchEvent): Promise<void>;
  findById(id: BatchEventId): Promise<BatchEvent | null>;
  listBy(filters?: BatchEventFilter): Promise<readonly BatchEvent[]>;
  /** Eventos cuyos `inputs` referencian ese batch (trazabilidad hacia adelante / recall). */
  listByInputBatchId(batchId: BatchId): Promise<readonly BatchEvent[]>;
}
