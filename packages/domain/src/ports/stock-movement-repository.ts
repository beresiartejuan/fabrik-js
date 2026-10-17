import type { StockMovement } from '../entities/stock-movement.js';
import type { LocationId, MaterialId } from '../value-objects/ids.js';
import type { StockDelta } from '../value-objects/stock-delta.js';

/**
 * Persistencia append-only de movimientos de stock (I4): solo se agregan. El
 * stock actual es la suma de los deltas por lugar + material (docs/04,
 * `GetStockByLocation`).
 */
export interface StockMovementRepository {
  /** Agrega un movimiento inmutable. Idempotente por `id` (re-`add` reemplaza). */
  add(movement: StockMovement): Promise<void>;
  /** Movimientos de un lugar; si se indica `materialId`, filtra por material. */
  listByLocation(
    locationId: LocationId,
    materialId?: MaterialId,
  ): Promise<readonly StockMovement[]>;
  /**
   * Suma firmada de los deltas de un lugar + material (positivo = entrada,
   * negativo = salida). Devuelve `null` si no hay movimientos, porque el
   * `StockDelta` exige una unidad que solo puede inferirse de los movimientos.
   */
  sumByLocationAndMaterial(
    locationId: LocationId,
    materialId: MaterialId,
  ): Promise<StockDelta | null>;
}
