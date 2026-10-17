import type { LocationId, MachineId } from '../value-objects/ids.js';

import { createDomainEvent, type DomainEventBase } from './domain-event.js';

// Payload compartido por los eventos de máquinas (docs/05).
export interface MachineEventPayload {
  readonly machineId: MachineId;
  readonly locationId: LocationId;
}

export interface MachineCreated
  extends DomainEventBase<'machine.created', MachineEventPayload> {}

export interface MachineMoved
  extends DomainEventBase<'machine.moved', MachineEventPayload> {}

/** Se emite tras crear una máquina (docs/05). */
export function machineCreated(
  payload: MachineEventPayload,
  occurredAt?: Date,
): MachineCreated {
  return createDomainEvent('machine.created', payload, occurredAt);
}

/** Se emite tras mover una máquina a otro location (docs/05, invariante I2). */
export function machineMoved(
  payload: MachineEventPayload,
  occurredAt?: Date,
): MachineMoved {
  return createDomainEvent('machine.moved', payload, occurredAt);
}
