import type { UnitOfMeasure } from '@fabrik/domain';

/**
 * Etiquetas en español de las unidades de medida.
 *
 * El wire usa `m3` (sin superíndice); la UI muestra `m³`. `unit` se muestra como
 * `u` (abreviatura de "unidad").
 */
export const UNIT_LABELS: Record<UnitOfMeasure, string> = {
  g: 'g',
  kg: 'kg',
  l: 'l',
  ml: 'ml',
  m3: 'm³',
  unit: 'u',
};

/** Etiqueta legible de una unidad (`unit` → "u", `m3` → "m³"). */
export function unitLabel(unit: UnitOfMeasure): string {
  return UNIT_LABELS[unit];
}
