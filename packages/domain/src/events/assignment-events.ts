import type { AssignmentId, MachineId, WorkerId } from '../value-objects/ids.js';
import type { TimeSlot } from '../value-objects/time-slot.js';

import { createDomainEvent, type DomainEventBase } from './domain-event.js';

export interface WorkerAssignedPayload {
  readonly assignmentId: AssignmentId;
  readonly workerId: WorkerId;
  readonly machineId: MachineId;
  readonly slot: TimeSlot;
}

export interface WorkerUnassignedPayload {
  readonly assignmentId: AssignmentId;
}

export interface WorkerAssigned extends DomainEventBase<'worker.assigned', WorkerAssignedPayload> {}

export interface WorkerUnassigned
  extends DomainEventBase<'worker.unassigned', WorkerUnassignedPayload> {}

/** Se emite tras asignar un worker a una máquina en una franja horaria (docs/05). */
export function workerAssigned(payload: WorkerAssignedPayload, occurredAt?: Date): WorkerAssigned {
  return createDomainEvent('worker.assigned', payload, occurredAt);
}

/** Se emite tras eliminar una asignación (docs/05). */
export function workerUnassigned(
  payload: WorkerUnassignedPayload,
  occurredAt?: Date,
): WorkerUnassigned {
  return createDomainEvent('worker.unassigned', payload, occurredAt);
}
