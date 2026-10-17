import type { BatchEventId, LocationId, MaterialId, StockMovementId } from '../value-objects/ids.js';
import type { StockDelta } from '../value-objects/stock-delta.js';

import { createDomainEvent, type DomainEventBase } from './domain-event.js';

export interface StockMovedPayload {
  readonly movementId: StockMovementId;
  readonly locationId: LocationId;
  readonly materialId: MaterialId;
  readonly delta: StockDelta;
  readonly batchEventId?: BatchEventId;
}

export interface StockMoved
  extends DomainEventBase<'stock.moved', StockMovedPayload> {}

/** Se emite por cualquier StockMovement registrado (docs/05). */
export function stockMoved(
  payload: StockMovedPayload,
  occurredAt?: Date,
): StockMoved {
  return createDomainEvent('stock.moved', payload, occurredAt);
}
