import type { Machine } from '../entities/index.js';
import type { MachineFilter, MachineRepository } from '../ports/index.js';
import type { MachineId } from '../value-objects/index.js';

import { InMemoryStore } from './in-memory-store.js';

function matches(machine: Machine, filter?: MachineFilter): boolean {
  if (filter?.locationId !== undefined && machine.locationId !== filter.locationId) {
    return false;
  }
  if (filter?.status !== undefined && machine.status !== filter.status) {
    return false;
  }
  if (filter?.type !== undefined && machine.type !== filter.type) {
    return false;
  }
  return true;
}

/** Fake en memoria de `MachineRepository` para tests (save = upsert). */
export class InMemoryMachineRepository implements MachineRepository {
  private readonly store = new InMemoryStore<MachineId, Machine>();

  async findById(id: MachineId): Promise<Machine | null> {
    return this.store.get(id);
  }

  async list(filter?: MachineFilter): Promise<readonly Machine[]> {
    return this.store.all().filter((machine) => matches(machine, filter));
  }

  async save(machine: Machine): Promise<void> {
    this.store.upsert(machine);
  }

  /** Vacía el almacén (solo tests). */
  clear(): void {
    this.store.clear();
  }
}
