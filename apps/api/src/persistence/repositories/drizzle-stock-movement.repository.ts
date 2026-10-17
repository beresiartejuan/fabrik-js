import type {
  LocationId,
  MaterialId,
  StockDelta,
  StockMovement,
  StockMovementRepository,
} from '@fabrik/domain';
import { and, eq } from 'drizzle-orm';

import type { Executor } from '../executor.js';
import { rowToStockMovement, stockMovementToRow } from '../mappers.js';
import { stockMovements } from '../schema.js';

/**
 * Adaptador Drizzle **append-only** de `StockMovementRepository`: solo `add` y
 * lecturas/agregados (nunca `update`/`delete`). `add` es idempotente por `id`.
 */
export class DrizzleStockMovementRepository implements StockMovementRepository {
  constructor(private readonly db: Executor) {}

  async add(movement: StockMovement): Promise<void> {
    const row = stockMovementToRow(movement);
    await this.db
      .insert(stockMovements)
      .values(row)
      .onConflictDoUpdate({ target: stockMovements.id, set: row });
  }

  async listByLocation(
    locationId: LocationId,
    materialId?: MaterialId,
  ): Promise<readonly StockMovement[]> {
    const conditions = [eq(stockMovements.locationId, locationId)];
    if (materialId !== undefined) {
      conditions.push(eq(stockMovements.materialId, materialId));
    }
    const rows = await this.db
      .select()
      .from(stockMovements)
      .where(and(...conditions));
    return rows.map(rowToStockMovement);
  }

  async sumByLocationAndMaterial(
    locationId: LocationId,
    materialId: MaterialId,
  ): Promise<StockDelta | null> {
    const rows = await this.db
      .select({ amount: stockMovements.deltaAmount, unit: stockMovements.deltaUnit })
      .from(stockMovements)
      .where(
        and(eq(stockMovements.locationId, locationId), eq(stockMovements.materialId, materialId)),
      );
    if (rows.length === 0) {
      return null;
    }
    return {
      amount: rows.reduce((total, row) => total + row.amount, 0),
      unit: rows[0].unit,
    };
  }
}
