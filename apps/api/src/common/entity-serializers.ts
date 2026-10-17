import type {
  Batch,
  BatchEvent,
  BatchQuantity,
  Quantity,
  StockByLocationEntry,
  StockDelta,
  StockMovement,
  TimeSlot,
} from '@fabrik/domain';

/**
 * Serializadores de los value objects y de las entidades compartidas (Fases 4–5).
 *
 * Las entidades y VOs del dominio son instancias de clase **congeladas**. Un
 * `{ ...entity }` funciona para las entidades (solo tienen props planas), pero
 * `TimeSlot` guarda también `startMinutes`/`endMinutes` como propiedades propias:
 * un spread filtraría esos campos internos. Por eso la serialización es
 * **explícita** (lista blanca de campos) en lugar de un `spread` genérico: es
 * ~1 línea por recurso y garantiza que el wire no filtra detalles de la VO.
 *
 * En la Fase 4 cada recurso serializaba su entidad en su `*.dto.ts` porque no se
 * compartía ninguna. Aquí (`Batch`, `BatchEvent`, `StockMovement`) las entidades
 * las consumen **varios** módulos (`supplies`, `production`, `stock`), así que sus
 * serializadores viven en este módulo común para no duplicarlos. Los `Date`
 * (`BatchEvent.timestamp`, `StockMovement.timestamp`) se emiten como ISO 8601
 * (`toISOString()`): el wire no transporta objetos `Date`.
 */

/** Cantidad física en el wire: `{ amount, unit }`. */
export interface QuantityResponse {
  readonly amount: number;
  readonly unit: Quantity['unit'];
}

export function serializeQuantity(quantity: Quantity): QuantityResponse {
  return { amount: quantity.amount, unit: quantity.unit };
}

/** Franja horaria en el wire: `{ daysOfWeek, start, end }`. */
export interface TimeSlotResponse {
  readonly daysOfWeek: number[];
  readonly start: string;
  readonly end: string;
}

export function serializeTimeSlot(slot: TimeSlot): TimeSlotResponse {
  return { daysOfWeek: [...slot.daysOfWeek], start: slot.start, end: slot.end };
}

/** Delta de stock en el wire: `{ amount, unit }` (signo en `amount`). */
export interface StockDeltaResponse {
  readonly amount: number;
  readonly unit: StockDelta['unit'];
}

export function serializeStockDelta(delta: StockDelta): StockDeltaResponse {
  return { amount: delta.amount, unit: delta.unit };
}

/** Lote en el wire. Los campos opcionales se omiten (no se emiten `null`). */
export interface BatchResponse {
  readonly id: string;
  readonly materialId: string;
  readonly quantity: QuantityResponse;
  readonly recipeId?: string;
  readonly originBatchEventId?: string;
  readonly status: Batch['status'];
}

export function serializeBatch(batch: Batch): BatchResponse {
  return {
    id: batch.id,
    materialId: batch.materialId,
    quantity: serializeQuantity(batch.quantity),
    ...(batch.recipeId !== undefined ? { recipeId: batch.recipeId } : {}),
    ...(batch.originBatchEventId !== undefined
      ? { originBatchEventId: batch.originBatchEventId }
      : {}),
    status: batch.status,
  };
}

/** Referencia material+cantidad dentro de un evento: `{ batchId?, materialId, quantity }`. */
export interface BatchQuantityResponse {
  readonly batchId?: string;
  readonly materialId: string;
  readonly quantity: QuantityResponse;
}

export function serializeBatchQuantity(item: BatchQuantity): BatchQuantityResponse {
  return {
    ...(item.batchId !== undefined ? { batchId: item.batchId } : {}),
    materialId: item.materialId,
    quantity: serializeQuantity(item.quantity),
  };
}

/** Evento de transformación en el wire; `timestamp` como ISO 8601. */
export interface BatchEventResponse {
  readonly id: string;
  readonly machineId: string;
  readonly workerId: string;
  readonly locationId: string;
  readonly recipeStepId?: string;
  readonly inputs: BatchQuantityResponse[];
  readonly outputs: BatchQuantityResponse[];
  readonly observation?: string;
  readonly timestamp: string;
}

export function serializeBatchEvent(event: BatchEvent): BatchEventResponse {
  return {
    id: event.id,
    machineId: event.machineId,
    workerId: event.workerId,
    locationId: event.locationId,
    ...(event.recipeStepId !== undefined ? { recipeStepId: event.recipeStepId } : {}),
    inputs: event.inputs.map(serializeBatchQuantity),
    outputs: event.outputs.map(serializeBatchQuantity),
    ...(event.observation !== undefined ? { observation: event.observation } : {}),
    timestamp: event.timestamp.toISOString(),
  };
}

/** Movimiento de stock en el wire; `timestamp` como ISO 8601. */
export interface StockMovementResponse {
  readonly id: string;
  readonly locationId: string;
  readonly materialId: string;
  readonly delta: StockDeltaResponse;
  readonly reason: StockMovement['reason'];
  readonly batchEventId?: string;
  readonly timestamp: string;
}

export function serializeStockMovement(movement: StockMovement): StockMovementResponse {
  return {
    id: movement.id,
    locationId: movement.locationId,
    materialId: movement.materialId,
    delta: serializeStockDelta(movement.delta),
    reason: movement.reason,
    ...(movement.batchEventId !== undefined ? { batchEventId: movement.batchEventId } : {}),
    timestamp: movement.timestamp.toISOString(),
  };
}

/** Entrada de stock agregada por lugar: `{ materialId, amount, unit }`. */
export interface StockByLocationEntryResponse {
  readonly materialId: string;
  readonly amount: number;
  readonly unit: StockByLocationEntry['unit'];
}

export function serializeStockByLocationEntry(
  entry: StockByLocationEntry,
): StockByLocationEntryResponse {
  return { materialId: entry.materialId, amount: entry.amount, unit: entry.unit };
}
