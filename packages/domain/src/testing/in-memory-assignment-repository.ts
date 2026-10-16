import type { Assignment } from '../entities';
import type { AssignmentRepository } from '../ports';
import type { AssignmentId, MachineId, WorkerId } from '../value-objects';

import { InMemoryStore } from './in-memory-store';

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
