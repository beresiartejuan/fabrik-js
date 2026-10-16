import type { StockMovement } from '../entities';
import type { StockMovementRepository } from '../ports';
import type { LocationId, MaterialId, StockMovementId } from '../value-objects';
import type { StockDelta } from '../value-objects/stock-delta';

import { InMemoryStore } from './in-memory-store';

/** Fake en memoria append-only de `StockMovementRepository` para tests. */
export class InMemoryStockMovementRepository implements StockMovementRepository {
  private readonly store = new InMemoryStore<StockMovementId, StockMovement>();

  async add(movement: StockMovement): Promise<void> {
    this.store.upsert(movement);
  }

  async listByLocation(
    locationId: LocationId,
    materialId?: MaterialId,
  ): Promise<readonly StockMovement[]> {
    return this.store
      .all()
      .filter(
        (movement) =>
          movement.locationId === locationId &&
          (materialId === undefined || movement.materialId === materialId),
      );
  }

  async sumByLocationAndMaterial(
    locationId: LocationId,
    materialId: MaterialId,
  ): Promise<StockDelta | null> {
    const movements = await this.listByLocation(locationId, materialId);
    if (movements.length === 0) {
      return null;
    }
    // La unidad la fija el primer movimiento; la coherencia de unidades la
    // garantizan las reglas de negocio (I6) aguas arriba.
    const unit = movements[0].delta.unit;
    const amount = movements.reduce((total, movement) => total + movement.delta.amount, 0);
    return { amount, unit };
  }

  /** Vacía el almacén (solo tests). */
  clear(): void {
    this.store.clear();
  }
}
