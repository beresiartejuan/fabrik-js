import type { Machine, MachineStatus, MachineType } from '../entities/machine.js';
import type { LocationId, MachineId } from '../value-objects/ids.js';

// Filtro explícito y pequeño para `list`.
export interface MachineFilter {
  readonly locationId?: LocationId;
  readonly status?: MachineStatus;
  readonly type?: MachineType;
}

/**
 * Persistencia del catálogo de máquinas (docs/04, `CreateMachine`/`MoveMachine`).
 * `save` es upsert por `id`; `findById` devuelve `null` si no existe.
 */
export interface MachineRepository {
  findById(id: MachineId): Promise<Machine | null>;
  list(filter?: MachineFilter): Promise<readonly Machine[]>;
  save(machine: Machine): Promise<void>;
}
