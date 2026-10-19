import type { DayOfWeek } from '@fabrik/domain';
import { TimeSlot } from '@fabrik/domain';

import type { AssignmentWire, TimeSlotWire } from '@/lib/api/types';

/**
 * Estado puro del editor de `TimeSlot` (docs/10-plan-de-web.md §Pantalla 8 y
 * §Fase 3). Vive como módulo sin React (mismo patrón que
 * `recipe-builder-state.ts`) para testear validación, normalización y
 * **pre-validación de solapamientos** con el dominio (`TimeSlot.overlaps`)
 * sin montar componentes.
 *
 * Convenios de wire: `daysOfWeek` es `0 = domingo … 6 = sábado` (igual que
 * `Date.getDay()`); `start` admite `HH:mm` (00:00–23:59) y `end` además
 * `24:00` como fin de jornada. Adjacente (`end === start`) **no** es solape.
 */

export interface TimeSlotDraft {
  readonly days: readonly DayOfWeek[];
  /** `HH:mm` crudo tal como lo tipea el usuario (se valida aparte). */
  readonly start: string;
  /** `HH:mm` crudo o `24:00`. */
  readonly end: string;
}

export type SlotIssueField = 'days' | 'start' | 'end' | 'range';

export interface SlotDraftIssue {
  readonly field: SlotIssueField;
  readonly message: string;
}

export interface SlotDraftValidation {
  readonly valid: boolean;
  readonly issues: readonly SlotDraftIssue[];
}

const START_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const END_PATTERN = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

/** Orden de visualización: lunes primero (semana laboral), domingo al final. */
export const DISPLAY_DAYS: readonly DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0];

const MESSAGES = {
  days: 'Elegí al menos un día.',
  start: 'La hora de inicio debe tener formato HH:mm.',
  end: 'La hora de fin debe tener formato HH:mm (o 24:00).',
  range: 'La hora de inicio debe ser anterior a la de fin.',
} as const;

/** Borrador inicial: franja laboral de ejemplo, sin días elegidos. */
export function createEmptySlotDraft(): TimeSlotDraft {
  return { days: [], start: '08:00', end: '16:00' };
}

/** Borrador a partir de una franja del wire (todos los valores ya válidos). */
export function slotDraftFromTimeSlot(slot: TimeSlotWire): TimeSlotDraft {
  return { days: [...slot.daysOfWeek], start: slot.start, end: slot.end };
}

/** Agrega/quita un día manteniendo el orden ascendente y sin duplicados. */
export function toggleDay(draft: TimeSlotDraft, day: DayOfWeek): TimeSlotDraft {
  const next = draft.days.includes(day)
    ? draft.days.filter((current) => current !== day)
    : [...draft.days, day];
  return { ...draft, days: next.sort((a, b) => a - b) };
}

export function changeStart(draft: TimeSlotDraft, start: string): TimeSlotDraft {
  return { ...draft, start };
}

export function changeEnd(draft: TimeSlotDraft, end: string): TimeSlotDraft {
  return { ...draft, end };
}

function normalizeDays(days: readonly DayOfWeek[]): DayOfWeek[] {
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

/**
 * Validación del borrador (misma forma que exige `TimeSlot.create` del
 * dominio): ≥1 día, `start` en `HH:mm`, `end` en `HH:mm` o `24:00`, y
 * `start < end` (no se soportan franjas que crucen medianoche).
 */
export function validateSlotDraft(draft: TimeSlotDraft): SlotDraftValidation {
  const issues: SlotDraftIssue[] = [];

  if (draft.days.length === 0) {
    issues.push({ field: 'days', message: MESSAGES.days });
  }
  const startValid = START_PATTERN.test(draft.start);
  const endValid = END_PATTERN.test(draft.end);
  if (!startValid) {
    issues.push({ field: 'start', message: MESSAGES.start });
  }
  if (!endValid) {
    issues.push({ field: 'end', message: MESSAGES.end });
  }

  if (startValid && endValid) {
    const [startHours, startMinutes] = draft.start.split(':').map(Number);
    const [endHours, endMinutes] = draft.end.split(':').map(Number);
    const startTotal = startHours * 60 + startMinutes;
    const endTotal = endHours === 24 ? 1440 : endHours * 60 + endMinutes;
    if (startTotal >= endTotal) {
      issues.push({ field: 'range', message: MESSAGES.range });
    }
  }

  return { valid: issues.length === 0, issues };
}

/** Primer issue de un campo (para `FieldError`), `undefined` si no hay. */
export function issueForField(
  issues: readonly SlotDraftIssue[],
  field: SlotIssueField,
): string | undefined {
  return issues.find((issue) => issue.field === field)?.message;
}

/**
 * Instancia de dominio del borrador, o `null` si la forma es inválida
 * (`TimeSlot.create` normaliza y valida como la API: la pre-validación en
 * cliente y la validación final del servidor se basan en el mismo objeto).
 */
export function toTimeSlot(draft: TimeSlotDraft): TimeSlot | null {
  try {
    return TimeSlot.create(normalizeDays(draft.days), draft.start, draft.end);
  } catch {
    return null;
  }
}

/**
 * Franjas existentes que se solapan con el borrador (I1 del *lado del worker*,
 * misma semántica que valida el servidor). Adyacentes (`end === start`) y
 * franjas de otros días **no** cuentan. Si el borrador es inválido, no hay
 * solapes que reportar.
 */
export function findOverlappingSlots(
  draft: TimeSlotDraft,
  existing: readonly TimeSlotWire[],
): TimeSlotWire[] {
  const candidate = toTimeSlot(draft);
  if (!candidate) {
    return [];
  }
  return existing.filter((slot) => {
    try {
      return candidate.overlaps(
        TimeSlot.create(normalizeDays(slot.daysOfWeek), slot.start, slot.end),
      );
    } catch {
      // Franja del wire inexistente: no la evaluamos como conflicto.
      return false;
    }
  });
}

/**
 * Igual que `findOverlappingSlots` pero sobre **asignaciones** del wire (como
 * llegan de `GET /workers/:id/schedule`): cada `AssignmentWire` anida su franja
 * en `.slot` y se devuelve la asignación completa (la UI necesita el
 * `machineId` de la contraparte para el aviso "en …").
 */
export function findOverlappingAssignments(
  draft: TimeSlotDraft,
  assignments: readonly AssignmentWire[],
): AssignmentWire[] {
  const overlapped = new Set(
    findOverlappingSlots(
      draft,
      assignments.map((a) => a.slot),
    ),
  );
  return assignments.filter((assignment) => overlapped.has(assignment.slot));
}

/** `true` si el borrador reproduce exactamente una franja existente. */
export function draftDuplicates(draft: TimeSlotDraft, existing: readonly TimeSlotWire[]): boolean {
  const candidate = toTimeSlot(draft);
  if (!candidate) {
    return false;
  }
  return existing.some((slot) => {
    try {
      return candidate.equals(
        TimeSlot.create(normalizeDays(slot.daysOfWeek), slot.start, slot.end),
      );
    } catch {
      return false;
    }
  });
}
