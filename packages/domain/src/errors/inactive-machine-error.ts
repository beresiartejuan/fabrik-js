import type { MachineId } from '../value-objects/ids';

import { DomainError } from './domain-error';

// La máquina no está en estado operativo para ejecutar una transformación.
export class InactiveMachineError extends DomainError {
  readonly machineId: MachineId;
  readonly status: 'idle' | 'running' | 'maintenance';

  constructor(machineId: MachineId, status: 'idle' | 'running' | 'maintenance') {
    super(`La máquina ${machineId} no está operativa (estado: ${status})`);
    this.name = 'InactiveMachineError';
    this.machineId = machineId;
    this.status = status;
  }
}
