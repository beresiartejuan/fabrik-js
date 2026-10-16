import type { MaterialId } from '../value-objects/ids';

import { createDomainEvent, type DomainEventBase } from './domain-event';

// Payload compartido por los eventos del catálogo de materiales (docs/05).
export interface MaterialEventPayload {
  readonly materialId: MaterialId;
}

export interface MaterialCreated
  extends DomainEventBase<'material.created', MaterialEventPayload> {}

export interface MaterialUpdated
  extends DomainEventBase<'material.updated', MaterialEventPayload> {}

/** Se emite tras crear un material (docs/05). */
export function materialCreated(
  payload: MaterialEventPayload,
  occurredAt?: Date,
): MaterialCreated {
  return createDomainEvent('material.created', payload, occurredAt);
}

/** Se emite tras actualizar un material (docs/05). */
export function materialUpdated(
  payload: MaterialEventPayload,
  occurredAt?: Date,
): MaterialUpdated {
  return createDomainEvent('material.updated', payload, occurredAt);
}
