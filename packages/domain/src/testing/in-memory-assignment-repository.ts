import type { Assignment } from '../entities/index.js';
import type { AssignmentRepository } from '../ports/index.js';
import type { AssignmentId, MachineId, WorkerId } from '../value-objects/index.js';

import { InMemoryStore } from './in-memory-store.js';

/** Fake en memoria de `AssignmentRepository` para tests (save = upsert). */
export class InMemoryAssignmentRepository implements AssignmentRepository {
  private readonly store = new InMemoryStore<AssignmentId, Assignment>();

  async findById(id: AssignmentId): Promise<Assignment | null> {
    return this.store.get(id);
  }

  async findByWorker(workerId: WorkerId): Promise<readonly Assignment[]> {
    return this.store.all().filter((assignment) => assignment.workerId === workerId);
  }

  async findByMachine(machineId: MachineId): Promise<readonly Assignment[]> {
    return this.store.all().filter((assignment) => assignment.machineId === machineId);
  }

  async save(assignment: Assignment): Promise<void> {
    this.store.upsert(assignment);
  }

  async delete(id: AssignmentId): Promise<void> {
    this.store.remove(id);
  }

  /** Vacía el almacén (solo tests). */
  clear(): void {
    this.store.clear();
  }
}
