import type { Machine, MachineFilter, MachineId, MachineRepository } from '@fabrik/domain';
import { and, eq } from 'drizzle-orm';

import type { Executor } from '../executor.js';
import { machineToRow, rowToMachine } from '../mappers.js';
import { machines } from '../schema.js';

/** Adaptador Drizzle de `MachineRepository` (`save` = upsert por `id`). */
export class DrizzleMachineRepository implements MachineRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: MachineId): Promise<Machine | null> {
    const rows = await this.db.select().from(machines).where(eq(machines.id, id)).limit(1);
    return rows.length > 0 ? rowToMachine(rows[0]) : null;
  }

  async list(filter?: MachineFilter): Promise<readonly Machine[]> {
    const conditions = [];
    if (filter?.locationId !== undefined) {
      conditions.push(eq(machines.locationId, filter.locationId));
    }
    if (filter?.status !== undefined) {
      conditions.push(eq(machines.status, filter.status));
    }
    if (filter?.type !== undefined) {
      conditions.push(eq(machines.type, filter.type));
    }
    const rows = await this.db
      .select()
      .from(machines)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    return rows.map(rowToMachine);
  }

  async save(machine: Machine): Promise<void> {
    const row = machineToRow(machine);
    await this.db
      .insert(machines)
      .values(row)
      .onConflictDoUpdate({ target: machines.id, set: row });
  }
}
