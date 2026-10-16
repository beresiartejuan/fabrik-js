import type { BatchEventId, LocationId, MaterialId, StockMovementId } from '../value-objects/ids';
import type { UnitOfMeasure } from '../value-objects/quantity';

import { createDomainEvent, type DomainEventBase } from './domain-event';

// Delta de stock con signo: `amount` positivo = entrada, negativo = salida.
// No se usa Quantity porque su invariante exige amount > 0 (mismatch con docs/02).
export interface StockDelta {
  readonly amount: number;
  readonly unit: UnitOfMeasure;
}

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
