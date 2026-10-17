/**
 * Formato de fechas en español con `Intl`.
 *
 * El wire transporta ISO 8601; estas funciones aceptan `string | Date` y
 * devuelven `''` si la fecha es inválida (evita el `RangeError` de `Intl`).
 */

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const DATE_FORMAT = new Intl.DateTimeFormat('es', { dateStyle: 'short' });

function toValidDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Fecha y hora (`dateStyle: short`, `timeStyle: short`). */
export function formatDateTime(value: string | Date): string {
  const date = toValidDate(value);
  return date ? DATE_TIME_FORMAT.format(date) : '';
}

/** Solo fecha (`dateStyle: short`). */
export function formatDate(value: string | Date): string {
  const date = toValidDate(value);
  return date ? DATE_FORMAT.format(date) : '';
}
