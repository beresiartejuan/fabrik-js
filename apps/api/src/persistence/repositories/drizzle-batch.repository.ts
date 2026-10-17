import { and, eq } from 'drizzle-orm';

import type { Batch, BatchFilter, BatchId, BatchRepository, MaterialId } from '@fabrik/domain';

import type { Executor } from '../executor.js';
import { batchToRow, rowToBatch } from '../mappers.js';
import { batches } from '../schema.js';

/** Adaptador Drizzle de `BatchRepository` (`save` = upsert por `id`). */
export class DrizzleBatchRepository implements BatchRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: BatchId): Promise<Batch | null> {
    const rows = await this.db.select().from(batches).where(eq(batches.id, id)).limit(1);
    return rows.length > 0 ? rowToBatch(rows[0]) : null;
  }

  async findByMaterial(materialId: MaterialId): Promise<readonly Batch[]> {
    const rows = await this.db.select().from(batches).where(eq(batches.materialId, materialId));
    return rows.map(rowToBatch);
  }

  async list(filter?: BatchFilter): Promise<readonly Batch[]> {
    const conditions = [];
    if (filter?.materialId !== undefined) {
      conditions.push(eq(batches.materialId, filter.materialId));
    }
    if (filter?.status !== undefined) {
      conditions.push(eq(batches.status, filter.status));
    }
    if (filter?.recipeId !== undefined) {
      conditions.push(eq(batches.recipeId, filter.recipeId));
    }
    if (filter?.originBatchEventId !== undefined) {
      conditions.push(eq(batches.originBatchEventId, filter.originBatchEventId));
    }
    const rows = await this.db
      .select()
      .from(batches)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    return rows.map(rowToBatch);
  }

  async save(batch: Batch): Promise<void> {
    const row = batchToRow(batch);
    await this.db
      .insert(batches)
      .values(row)
      .onConflictDoUpdate({ target: batches.id, set: row });
  }
}
