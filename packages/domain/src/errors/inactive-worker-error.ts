import type { WorkerId } from '../value-objects/ids.js';

import { DomainError } from './domain-error.js';

// Un worker dado de baja no puede recibir asignaciones horarias (docs/04).
export class InactiveWorkerError extends DomainError {
  readonly workerId: WorkerId;

  constructor(workerId: WorkerId) {
    super(`El worker ${workerId} está inactivo`);
    this.name = 'InactiveWorkerError';
    this.workerId = workerId;
  }
}
