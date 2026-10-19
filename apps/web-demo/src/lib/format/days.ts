import type { DayOfWeek } from '@fabrik/domain';

import type { TimeSlotWire } from '@/lib/api/types';

/**
 * Días de la semana. El wire usa `0 = domingo … 6 = sábado` (igual que
 * `Date.getDay()`); se muestran con etiquetas cortas en español.
 */
export const DAY_LABELS: Record<DayOfWeek, string> = {
  0: 'dom',
  1: 'lun',
  2: 'mar',
  3: 'mié',
  4: 'jue',
  5: 'vie',
  6: 'sáb',
};

/** Etiqueta corta de un día (`0` → "dom"). */
export function dayLabel(day: DayOfWeek): string {
  return DAY_LABELS[day];
}

/** Lista de días deduplicada y ordenada de domingo a sábado: `"lun, mié"`. */
export function formatDays(days: readonly DayOfWeek[]): string {
  const unique = Array.from(new Set(days)).sort((a, b) => a - b);
  return unique.map(dayLabel).join(', ');
}

/** Franja horaria legible: `"lun, mié 08:00–16:30"`. */
export function formatTimeSlot(slot: TimeSlotWire): string {
  return `${formatDays(slot.daysOfWeek)} ${slot.start}–${slot.end}`;
}
