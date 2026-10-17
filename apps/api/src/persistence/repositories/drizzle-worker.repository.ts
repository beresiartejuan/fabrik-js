import { and, eq } from 'drizzle-orm';

import type { Worker, WorkerFilter, WorkerId, WorkerRepository } from '@fabrik/domain';

import type { Executor } from '../executor.js';
import { rowToWorker, workerToRow } from '../mappers.js';
import { workers } from '../schema.js';

/** Adaptador Drizzle de `WorkerRepository` (`save` = upsert por `id`). */
export class DrizzleWorkerRepository implements WorkerRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: WorkerId): Promise<Worker | null> {
    const rows = await this.db.select().from(workers).where(eq(workers.id, id)).limit(1);
    return rows.length > 0 ? rowToWorker(rows[0]) : null;
  }

  async list(filter?: WorkerFilter): Promise<readonly Worker[]> {
    const conditions = [];
    if (filter?.role !== undefined) {
      conditions.push(eq(workers.role, filter.role));
    }
    if (filter?.active !== undefined) {
      conditions.push(eq(workers.active, filter.active));
    }
    const rows = await this.db
      .select()
      .from(workers)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    return rows.map(rowToWorker);
  }

  async save(worker: Worker): Promise<void> {
    const row = workerToRow(worker);
    await this.db
      .insert(workers)
      .values(row)
      .onConflictDoUpdate({ target: workers.id, set: row });
  }
}
