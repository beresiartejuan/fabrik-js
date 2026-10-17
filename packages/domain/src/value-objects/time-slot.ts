import { InvalidTimeSlotError } from '../errors/index.js';

// Día de la semana: 0 = domingo ... 6 = sábado (igual que Date.getDay()).
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const HH_MM_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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
function toMinutes(value: string): number {
  if (!HH_MM_PATTERN.test(value)) {
    throw new InvalidTimeSlotError(`Hora inválida (se espera HH:mm): ${value}`);
  }
  const [hours, minutes] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/**
 * Franja horaria semanal inmutable: días + rango [start, end) en hora local.
 * En esta fase no se soportan rangos que crucen medianoche (`start < end`).
 */
export class TimeSlot {
  readonly daysOfWeek: readonly DayOfWeek[];
  readonly start: string;
  readonly end: string;

  private readonly startMinutes: number;
  private readonly endMinutes: number;

  private constructor(daysOfWeek: DayOfWeek[], start: string, end: string, startMinutes: number, endMinutes: number) {
    this.daysOfWeek = Object.freeze(daysOfWeek);
    this.start = start;
    this.end = end;
    this.startMinutes = startMinutes;
    this.endMinutes = endMinutes;
    Object.freeze(this);
  }

  /** Crea una franja validando días, formato HH:mm y `start < end`. */
  static create(daysOfWeek: readonly DayOfWeek[], start: string, end: string): TimeSlot {
    const days = normalizeDays(daysOfWeek);
    const startMinutes = toMinutes(start);
    const endMinutes = toMinutes(end);
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

  /** Indica si un instante cae dentro de la franja (día + rango [start, end)). */
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
