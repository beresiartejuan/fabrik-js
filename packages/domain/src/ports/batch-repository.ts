import type { Batch, BatchStatus } from '../entities/batch';
import type { BatchId, MaterialId, RecipeId } from '../value-objects/ids';

// Filtro explícito y pequeño para `list`.
export interface BatchFilter {
  readonly materialId?: MaterialId;
  readonly status?: BatchStatus;
  readonly recipeId?: RecipeId;
}

/**
 * Persistencia de lotes (docs/04, producción y trazabilidad).
 * `save` es upsert por `id`; `findById` devuelve `null` si no existe.
 */
export interface BatchRepository {
  findById(id: BatchId): Promise<Batch | null>;
  /** Lotes de un material; atajo de `list({ materialId })` para trazabilidad. */
  findByMaterial?(materialId: MaterialId): Promise<readonly Batch[]>;
  list(filter?: BatchFilter): Promise<readonly Batch[]>;
  save(batch: Batch): Promise<void>;
}
