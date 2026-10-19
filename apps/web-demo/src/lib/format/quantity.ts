import { Quantity, type UnitOfMeasure } from '@fabrik/domain';

import type { QuantityWire, StockDeltaWire } from '@/lib/api/types';

import { unitLabel } from './units';

/** Formatea una cantidad como `"<amount> <unidad>"` (`2 kg`, `3 u`, `1 m³`). */
export function formatQty(amount: number, unit: UnitOfMeasure): string {
  return `${amount} ${unitLabel(unit)}`;
}

/** Formatea una cantidad del wire (`{ amount, unit }`). */
export function formatQuantity(quantity: QuantityWire): string {
  return formatQty(quantity.amount, quantity.unit);
}

/**
 * Formatea un **delta** de stock con el signo explícito (`+2 kg`, `-3 kg`,
 * Fase 5). El signo negativo lo trae el número; el positivo se añade para que
 * las entradas no queden como neutras.
 */
export function formatDelta(delta: StockDeltaWire): string {
  const sign = delta.amount > 0 ? '+' : '';
  return `${sign}${delta.amount} ${unitLabel(delta.unit)}`;
}

/**
 * Valida en formularios reutilizando el invariante del dominio
 * (`amount` finito y `> 0`). Devuelve la `Quantity` creada o `null` si es
 * inválida, sin propagar la excepción.
 */
export function validateQuantity(amount: number, unit: UnitOfMeasure): Quantity | null {
  try {
    return Quantity.create(amount, unit);
  } catch {
    return null;
  }
}
