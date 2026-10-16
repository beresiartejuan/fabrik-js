import type {
  BatchEventId,
  BatchId,
  LocationId,
  MachineId,
  MaterialId,
  RecipeId,
  WorkerId,
} from '../value-objects/ids';
import type { Quantity } from '../value-objects/quantity';

import { createDomainEvent, type DomainEventBase } from './domain-event';

export interface SupplyArrivedPayload {
  readonly batchId: BatchId;
  readonly materialId: MaterialId;
  readonly quantity: Quantity;
  readonly locationId: LocationId;
}

export interface BatchCreatedPayload {
  readonly batchId: BatchId;
  readonly recipeId: RecipeId;
}

// Resumen de un batch consumido/producido: solo ids, material y cantidad (docs/05).
export interface BatchQuantitySummary {
  readonly batchId: BatchId;
  readonly materialId: MaterialId;
  readonly quantity: Quantity;
}

export interface BatchTransformedPayload {
  readonly eventId: BatchEventId;
  readonly machineId: MachineId;
  readonly workerId: WorkerId;
  readonly inputs: readonly BatchQuantitySummary[];
  readonly outputs: readonly BatchQuantitySummary[];
  readonly observation?: string;
}

export interface BatchStoredPayload {
  readonly batchId: BatchId;
  readonly locationId: LocationId;
}

export interface ProductionCompletedPayload {
  readonly batchId: BatchId;
  readonly recipeId: RecipeId;
}

export interface SupplyArrived
  extends DomainEventBase<'supply.arrived', SupplyArrivedPayload> {}

export interface BatchCreated
  extends DomainEventBase<'batch.created', BatchCreatedPayload> {}

export interface BatchTransformed
  extends DomainEventBase<'batch.transformed', BatchTransformedPayload> {}

export interface BatchStored
  extends DomainEventBase<'batch.stored', BatchStoredPayload> {}

export interface ProductionCompleted
  extends DomainEventBase<'production.completed', ProductionCompletedPayload> {}

/** Se emite tras registrar el ingreso de un suministro (docs/05). */
export function supplyArrived(
  payload: SupplyArrivedPayload,
  occurredAt?: Date,
): SupplyArrived {
  return createDomainEvent('supply.arrived', payload, occurredAt);
}

/** Se emite al iniciar la producción de un lote raíz (docs/05). */
export function batchCreated(
  payload: BatchCreatedPayload,
  occurredAt?: Date,
): BatchCreated {
  return createDomainEvent('batch.created', payload, occurredAt);
}

/** Evento central de trazabilidad: registra una transformación en máquina (docs/05). */
export function batchTransformed(
  payload: BatchTransformedPayload,
  occurredAt?: Date,
): BatchTransformed {
  return createDomainEvent('batch.transformed', payload, occurredAt);
}

/** Se emite al mover un lote a almacenamiento (docs/05). */
export function batchStored(
  payload: BatchStoredPayload,
  occurredAt?: Date,
): BatchStored {
  return createDomainEvent('batch.stored', payload, occurredAt);
}

/** Se emite al completar la producción de un lote (docs/05). */
export function productionCompleted(
  payload: ProductionCompletedPayload,
  occurredAt?: Date,
): ProductionCompleted {
  return createDomainEvent('production.completed', payload, occurredAt);
}
