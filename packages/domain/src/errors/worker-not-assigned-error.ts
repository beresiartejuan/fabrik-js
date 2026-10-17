import type { MachineId, WorkerId } from '../value-objects/ids.js';

import { DomainError } from './domain-error.js';

// Invariante I3: solo registra un BatchEvent el worker con asignación vigente a la máquina.
export class WorkerNotAssignedError extends DomainError {
  readonly workerId: WorkerId;
  readonly machineId: MachineId;
  readonly at?: Date;

  constructor(workerId: WorkerId, machineId: MachineId, at?: Date) {
    const when = at ? ` en ${at.toISOString()}` : '';
    super(`El worker ${workerId} no tiene asignación vigente a la máquina ${machineId}${when}`);
    this.name = 'WorkerNotAssignedError';
    this.workerId = workerId;
    this.machineId = machineId;
    this.at = at;
  }
}
