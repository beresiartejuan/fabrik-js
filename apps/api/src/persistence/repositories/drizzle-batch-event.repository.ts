import { and, eq, gte, inArray, lte } from 'drizzle-orm';

import type {
  BatchEvent,
  BatchEventFilter,
  BatchEventId,
  BatchEventRepository,
  BatchId,
} from '@fabrik/domain';

import type { Executor } from '../executor.js';
import {
  batchEventQuantityToInputRow,
  batchEventQuantityToOutputRow,
  batchEventToRow,
  rowToBatchEvent,
} from '../mappers.js';
import { batchEventInputs, batchEventOutputs, batchEvents, type BatchEventRow } from '../schema.js';

/**
 * Adaptador Drizzle **append-only** de `BatchEventRepository`: solo `add`/`findBy`/`list`
 * (nunca `update`/`delete`). `add` es idempotente por `id` (re-`add` reemplaza,
 * como los fakes de test del dominio).
 */
export class DrizzleBatchEventRepository implements BatchEventRepository {
  constructor(private readonly db: Executor) {}

  async add(event: BatchEvent): Promise<void> {
    const row = batchEventToRow(event);
    await this.db
      .insert(batchEvents)
      .values(row)
      .onConflictDoUpdate({ target: batchEvents.id, set: row });

    // Reemplazo de las tablas hijas para preservar la idempotencia por `id`.
    await this.db.delete(batchEventInputs).where(eq(batchEventInputs.eventId, event.id));
    await this.db.delete(batchEventOutputs).where(eq(batchEventOutputs.eventId, event.id));

    const inputRows = batchEventQuantityToInputRow(event.id, event.inputs);
    if (inputRows.length > 0) {
      await this.db.insert(batchEventInputs).values(inputRows);
    }
    const outputRows = batchEventQuantityToOutputRow(event.id, event.outputs);
    if (outputRows.length > 0) {
      await this.db.insert(batchEventOutputs).values(outputRows);
    }
  }

  async findById(id: BatchEventId): Promise<BatchEvent | null> {
    const rows = await this.db.select().from(batchEvents).where(eq(batchEvents.id, id)).limit(1);
    if (rows.length === 0) {
      return null;
    }
    const hydrated = await this.hydrate(rows);
    return hydrated[0] ?? null;
  }

  async listBy(filters?: BatchEventFilter): Promise<readonly BatchEvent[]> {
    const conditions = [];
    if (filters?.machineId !== undefined) {
      conditions.push(eq(batchEvents.machineId, filters.machineId));
    }
    if (filters?.workerId !== undefined) {
      conditions.push(eq(batchEvents.workerId, filters.workerId));
    }
    if (filters?.dateRange?.from !== undefined) {
      conditions.push(gte(batchEvents.timestamp, filters.dateRange.from));
    }
    if (filters?.dateRange?.to !== undefined) {
      conditions.push(lte(batchEvents.timestamp, filters.dateRange.to));
    }
    if (filters?.materialId !== undefined) {
      const candidateIds = await this.eventIdsByMaterial(filters.materialId);
      if (candidateIds.length === 0) {
        return [];
      }
      conditions.push(inArray(batchEvents.id, candidateIds));
    }

    const rows = await this.db
      .select()
      .from(batchEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    return this.hydrate(rows);
  }

  async listByInputBatchId(batchId: BatchId): Promise<readonly BatchEvent[]> {
    const consuming = await this.db
      .select({ eventId: batchEventInputs.eventId })
      .from(batchEventInputs)
      .where(eq(batchEventInputs.batchId, batchId));
    const eventIds = unique(consuming.map((row) => row.eventId));
    if (eventIds.length === 0) {
      return [];
    }
    const rows = await this.db.select().from(batchEvents).where(inArray(batchEvents.id, eventIds));
    return this.hydrate(rows);
  }

  private async eventIdsByMaterial(materialId: string): Promise<string[]> {
    const [asInput, asOutput] = await Promise.all([
      this.db
        .select({ eventId: batchEventInputs.eventId })
        .from(batchEventInputs)
        .where(eq(batchEventInputs.materialId, materialId)),
      this.db
        .select({ eventId: batchEventOutputs.eventId })
        .from(batchEventOutputs)
        .where(eq(batchEventOutputs.materialId, materialId)),
    ]);
    return unique([...asInput, ...asOutput].map((row) => row.eventId));
  }

  private async hydrate(rows: readonly BatchEventRow[]): Promise<BatchEvent[]> {
    if (rows.length === 0) {
      return [];
    }
    const eventIds = rows.map((row) => row.id);
    const [inputs, outputs] = await Promise.all([
      this.db.select().from(batchEventInputs).where(inArray(batchEventInputs.eventId, eventIds)),
      this.db.select().from(batchEventOutputs).where(inArray(batchEventOutputs.eventId, eventIds)),
    ]);
    const inputsByEvent = groupBy(inputs, (row) => row.eventId);
    const outputsByEvent = groupBy(outputs, (row) => row.eventId);
    return rows.map((row) =>
      rowToBatchEvent(row, inputsByEvent.get(row.id) ?? [], outputsByEvent.get(row.id) ?? []),
    );
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) {
      bucket.push(item);
    } else {
      map.set(k, [item]);
    }
  }
  return map;
}
