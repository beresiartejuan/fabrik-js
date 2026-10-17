import type { AssignmentId, WorkerId } from '../value-objects/ids.js';

import { DomainError } from './domain-error.js';

// Invariante I1: un worker no puede tener dos asignaciones con franjas solapadas.
export class OverlappingScheduleError extends DomainError {
  readonly workerId: WorkerId;
  readonly conflictingAssignmentId: AssignmentId;

  constructor(workerId: WorkerId, conflictingAssignmentId: AssignmentId) {
    super(
      `El worker ${workerId} ya tiene una asignación con horario solapado (${conflictingAssignmentId})`,
    );
    this.name = 'OverlappingScheduleError';
    this.workerId = workerId;
    this.conflictingAssignmentId = conflictingAssignmentId;
  }
}
