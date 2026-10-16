import type { WorkerAssigned, WorkerUnassigned } from './assignment-events';
import type { StockMoved } from './inventory-events';
import type { MachineCreated, MachineMoved } from './machine-events';
import type { MaterialCreated, MaterialUpdated } from './material-events';
import type {
  BatchCreated,
  BatchStored,
  BatchTransformed,
  ProductionCompleted,
  SupplyArrived,
} from './production-events';

/**
 * Contrato base de todo evento de dominio (docs/05). Cada evento concreto fija
 * su `name` y el tipo de su `payload` mediante parámetros genéricos.
 */
export interface DomainEventBase<
  Name extends string = string,
  Payload extends object = Record<string, unknown>,
> {
  readonly name: Name;
  readonly occurredAt: Date;
  readonly payload: Payload;
}

/**
 * Fábrica interna de eventos: sella el nombre, fija el instante de ocurrencia
 * (por defecto ahora) y congela el payload para preservar su inmutabilidad.
 */
export function createDomainEvent<Name extends string, Payload extends object>(
  name: Name,
  payload: Payload,
  occurredAt: Date = new Date(),
): DomainEventBase<Name, Payload> {
  return { name, occurredAt, payload: Object.freeze(payload) };
}

/**
 * Unión discriminada por `name` de todos los eventos del catálogo (docs/05).
 * Permite a los consumidores obtener payloads tipados a partir del nombre.
 */
export type DomainEvent =
  | MaterialCreated
  | MaterialUpdated
  | MachineCreated
  | MachineMoved
  | WorkerAssigned
  | WorkerUnassigned
  | SupplyArrived
  | BatchCreated
  | BatchTransformed
  | BatchStored
  | ProductionCompleted
  | StockMoved;

/** Nombres válidos de eventos de dominio. */
export type DomainEventName = DomainEvent['name'];
