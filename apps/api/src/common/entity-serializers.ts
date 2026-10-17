import type { Quantity, TimeSlot } from '@fabrik/domain';

/**
 * Serializadores de los value objects que se anidan en las respuestas (Fase 4).
 *
 * Las entidades y VOs del dominio son instancias de clase **congeladas**. Un
 * `{ ...entity }` funciona para las entidades (solo tienen props planas), pero
 * `TimeSlot` guarda también `startMinutes`/`endMinutes` como propiedades propias:
 * un spread filtraría esos campos internos. Por eso la serialización es
 * **explícita** (lista blanca de campos) en lugar de un `spread` genérico: es
 * ~1 línea por recurso y garantiza que el wire no filtra detalles de la VO.
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
