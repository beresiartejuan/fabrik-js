import { InvalidTimeSlotError } from '../errors/index.js';

// Día de la semana: 0 = domingo ... 6 = sábado (igual que Date.getDay()).
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// `start` admite 00:00–23:59; `end` admite además 24:00 para representar el
// final del día (fin de jornada), manteniendo la semántica [start, end).
const HH_MM_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const END_HH_MM_PATTERN = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

// Normaliza los días: valida rango, deduplica y ordena ascendente.
function normalizeDays(days: readonly DayOfWeek[]): DayOfWeek[] {
  if (days.length === 0) {
    throw new InvalidTimeSlotError('daysOfWeek no puede estar vacío');
  }
  const unique = new Set<DayOfWeek>();
  for (const day of days) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new InvalidTimeSlotError(`Día de la semana inválido: ${day}`);
    }
    unique.add(day);
  }
  return [...unique].sort((a, b) => a - b);
}

// Convierte 'HH:mm' a minutos desde medianoche, validando el formato.
// `allowEndOfDay` habilita '24:00' (1440) únicamente para el extremo final.
function toMinutes(value: string, allowEndOfDay = false): number {
  const pattern = allowEndOfDay ? END_HH_MM_PATTERN : HH_MM_PATTERN;
  if (!pattern.test(value)) {
    const hint = allowEndOfDay ? 'HH:mm o 24:00' : 'HH:mm';
    throw new InvalidTimeSlotError(`Hora inválida (se espera ${hint}): ${value}`);
  }
  const [hours, minutes] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/**
 * Franja horaria semanal inmutable: días + rango [start, end).
 * En esta fase no se soportan rangos que crucen medianoche (`start < end`).
 * `end` puede ser `'24:00'` para expresar el final del día (fin de jornada).
 *
 * Política de zona horaria: los instantes se evalúan en la **zona local del
 * servidor** (`contains` usa `Date.getDay/getHours/getMinutes`), que es la fuente
 * de verdad para I3. Los clientes no deben recalcular la vigencia por su cuenta:
 * la API expondrá la evaluación server-side (`/me/schedule` con `activeNow`).
 */
export class TimeSlot {
  readonly daysOfWeek: readonly DayOfWeek[];
  readonly start: string;
  readonly end: string;

  private readonly startMinutes: number;
  private readonly endMinutes: number;

  private constructor(
    daysOfWeek: DayOfWeek[],
    start: string,
    end: string,
    startMinutes: number,
    endMinutes: number,
  ) {
    this.daysOfWeek = Object.freeze(daysOfWeek);
    this.start = start;
    this.end = end;
    this.startMinutes = startMinutes;
    this.endMinutes = endMinutes;
    Object.freeze(this);
  }

  /**
   * Crea una franja validando días, formato HH:mm (`end` también admite 24:00)
   * y `start < end`.
   */
  static create(daysOfWeek: readonly DayOfWeek[], start: string, end: string): TimeSlot {
    const days = normalizeDays(daysOfWeek);
    const startMinutes = toMinutes(start);
    const endMinutes = toMinutes(end, true);
    if (startMinutes >= endMinutes) {
      throw new InvalidTimeSlotError(`start debe ser anterior a end (${start} >= ${end})`);
    }
    return new TimeSlot(days, start, end, startMinutes, endMinutes);
  }

  /**
   * Indica si dos franjas se solapan: comparten al menos un día y sus rangos
   * se intersecan estrictamente. Franjas adyacentes (end === start) NO se solapan.
   */
  overlaps(other: TimeSlot): boolean {
    const sharesDay = this.daysOfWeek.some((day) => other.daysOfWeek.includes(day));
    if (!sharesDay) {
      return false;
    }
    return this.startMinutes < other.endMinutes && other.startMinutes < this.endMinutes;
  }

  /**
   * Indica si un instante cae dentro de la franja (día + rango [start, end)),
   * evaluado en la **zona local del servidor** (fuente de verdad para I3). Con
   * `end: '24:00'` y `start: '00:00'` la franja cubre el día completo.
   */
  contains(date: Date): boolean {
    if (!this.daysOfWeek.includes(date.getDay() as DayOfWeek)) {
      return false;
    }
    const minutes = date.getHours() * 60 + date.getMinutes();
    return this.startMinutes <= minutes && minutes < this.endMinutes;
  }

  equals(other: TimeSlot): boolean {
    return (
      this.start === other.start &&
      this.end === other.end &&
      this.daysOfWeek.length === other.daysOfWeek.length &&
      this.daysOfWeek.every((day, index) => day === other.daysOfWeek[index])
    );
  }
}
