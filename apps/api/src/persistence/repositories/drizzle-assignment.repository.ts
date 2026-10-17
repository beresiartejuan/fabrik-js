import { eq } from 'drizzle-orm';

import type {
  Assignment,
  AssignmentId,
  AssignmentRepository,
  MachineId,
  WorkerId,
} from '@fabrik/domain';

import type { Executor } from '../executor.js';
import { assignmentToRow, rowToAssignment } from '../mappers.js';
import { assignments } from '../schema.js';

/** Adaptador Drizzle de `AssignmentRepository` (`save` = upsert, `delete` real). */
export class DrizzleAssignmentRepository implements AssignmentRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: AssignmentId): Promise<Assignment | null> {
    const rows = await this.db.select().from(assignments).where(eq(assignments.id, id)).limit(1);
    return rows.length > 0 ? rowToAssignment(rows[0]) : null;
  }

  async findByWorker(workerId: WorkerId): Promise<readonly Assignment[]> {
    const rows = await this.db
      .select()
      .from(assignments)
      .where(eq(assignments.workerId, workerId));
    return rows.map(rowToAssignment);
  }

  async findByMachine(machineId: MachineId): Promise<readonly Assignment[]> {
    const rows = await this.db
      .select()
      .from(assignments)
      .where(eq(assignments.machineId, machineId));
    return rows.map(rowToAssignment);
  }

  async save(assignment: Assignment): Promise<void> {
    const row = assignmentToRow(assignment);
    await this.db
      .insert(assignments)
      .values(row)
      .onConflictDoUpdate({ target: assignments.id, set: row });
  }

  async delete(id: AssignmentId): Promise<void> {
    await this.db.delete(assignments).where(eq(assignments.id, id));
  }
}
