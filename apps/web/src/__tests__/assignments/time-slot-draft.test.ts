import type { DayOfWeek } from '@fabrik/domain';
import { describe, expect, it } from 'vitest';

import {
  createEmptySlotDraft,
  DISPLAY_DAYS,
  draftDuplicates,
  findOverlappingSlots,
  issueForField,
  slotDraftFromTimeSlot,
  type TimeSlotDraft,
  toggleDay,
  toTimeSlot,
  validateSlotDraft,
} from '@/components/assignments/time-slot-draft';

/**
 * Estado puro del editor de franjas (docs/10-plan-de-web.md §Fase 3): forma
 * HH:mm (`end` admite 24:00), `start < end`, >= 1 día y **pre-validación de
 * solapes** con `TimeSlot.overlaps` (adyacentes y otros días no cuentan).
 */

function draft(overrides: Partial<TimeSlotDraft>): TimeSlotDraft {
  return { ...createEmptySlotDraft(), ...overrides };
}

const SLOT = (days: DayOfWeek[], start: string, end: string) => ({ daysOfWeek: days, start, end });

describe('DISPLAY_DAYS', () => {
  it('muestra la semana laboral de lunes a domingo', () => {
    expect(DISPLAY_DAYS).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe('createEmptySlotDraft / slotDraftFromTimeSlot', () => {
  it('el borrador vacío no tiene días y sugiere una franja laboral', () => {
    expect(createEmptySlotDraft()).toEqual({ days: [], start: '08:00', end: '16:00' });
  });

  it('construye un borrador desde una franja del wire', () => {
    expect(slotDraftFromTimeSlot(SLOT([1, 3], '08:00', '16:30'))).toEqual({
      days: [1, 3],
      start: '08:00',
      end: '16:30',
    });
  });
});

describe('toggleDay', () => {
  it('agrega días en orden ascendente; repetir un día lo quita (sin duplicados)', () => {
    let current = createEmptySlotDraft();
    current = toggleDay(current, 3);
    current = toggleDay(current, 1);
    expect(current.days).toEqual([1, 3]);

    current = toggleDay(current, 3);
    expect(current.days).toEqual([1]);
  });

  it('quita un día ya elegido', () => {
    const current = toggleDay(toggleDay(createEmptySlotDraft(), 1), 1);
    expect(current.days).toEqual([]);
  });
});

describe('validateSlotDraft', () => {
  it('acepta una franja válida de lunes a viernes con end 24:00', () => {
    const result = validateSlotDraft(
      draft({ days: [1, 2, 3, 4, 5], start: '06:00', end: '24:00' }),
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('exige al menos un día', () => {
    const result = validateSlotDraft(createEmptySlotDraft());
    expect(result.valid).toBe(false);
    expect(issueForField(result.issues, 'days')).toBe('Elegí al menos un día.');
  });

  it('valida el formato de start (HH:mm, 00:00–23:59)', () => {
    for (const start of ['8:00', '07:99', '24:00', '8:6', 'abc', '']) {
      const result = validateSlotDraft(draft({ days: [1], start, end: '16:00' }));
      expect(result.valid, `start=${start}`).toBe(false);
      expect(issueForField(result.issues, 'start'), `start=${start}`).toBe(
        'La hora de inicio debe tener formato HH:mm.',
      );
    }
  });

  it('valida el formato de end (HH:mm o 24:00)', () => {
    for (const end of ['16:5', '25:00', '16', '']) {
      const result = validateSlotDraft(draft({ days: [1], start: '08:00', end }));
      expect(result.valid, `end=${end}`).toBe(false);
      expect(issueForField(result.issues, 'end'), `end=${end}`).toBe(
        'La hora de fin debe tener formato HH:mm (o 24:00).',
      );
    }
  });

  it('exige start anterior a end (no hay franjas que crucen medianoche)', () => {
    const equal = validateSlotDraft(draft({ days: [1], start: '08:00', end: '08:00' }));
    expect(issueForField(equal.issues, 'range')).toBe(
      'La hora de inicio debe ser anterior a la de fin.',
    );

    const inverted = validateSlotDraft(draft({ days: [1], start: '16:00', end: '08:00' }));
    expect(issueForField(inverted.issues, 'range')).toBe(
      'La hora de inicio debe ser anterior a la de fin.',
    );

    const endOfDay = validateSlotDraft(draft({ days: [1], start: '23:30', end: '24:00' }));
    expect(endDayIssuesAreEmpty(endOfDay)).toBe(true);
  });

  it('no reporta range cuando las horas tienen formato inválido', () => {
    const result = validateSlotDraft(draft({ days: [1], start: 'mal', end: 'peor' }));
    expect(issueForField(result.issues, 'range')).toBeUndefined();
  });
});

function endDayIssuesAreEmpty(result: ReturnType<typeof validateSlotDraft>): boolean {
  return result.valid && result.issues.length === 0;
}

describe('toTimeSlot', () => {
  it('devuelve la instancia de dominio para un borrador válido', () => {
    const slot = toTimeSlot(draft({ days: [6, 0], start: '09:00', end: '24:00' }));
    expect(slot?.daysOfWeek).toEqual([0, 6]);
    expect(slot?.start).toBe('09:00');
    expect(slot?.end).toBe('24:00');
  });

  it('devuelve null si el borrador es inválido (cualquier error de creación)', () => {
    expect(toTimeSlot(createEmptySlotDraft())).toBeNull();
    expect(toTimeSlot(draft({ days: [1], start: '9:00', end: '16:00' }))).toBeNull();
  });
});

describe('findOverlappingSlots', () => {
  it('detecta el solape en días compartidos', () => {
    const candidate = draft({ days: [1, 2], start: '10:00', end: '12:00' });
    const existing = [SLOT([1], '08:00', '16:30'), SLOT([3], '10:00', '12:00')];
    expect(findOverlappingSlots(candidate, existing)).toEqual([SLOT([1], '08:00', '16:30')]);
  });

  it('las franjas adyacentes (end === start) NO son solape', () => {
    const candidate = draft({ days: [1], start: '10:00', end: '12:00' });
    const existing = [SLOT([1], '08:00', '10:00'), SLOT([1], '12:00', '14:00')];
    expect(findOverlappingSlots(candidate, existing)).toEqual([]);
  });

  it('franjas de otros días NO son solape', () => {
    const candidate = draft({ days: [1], start: '10:00', end: '12:00' });
    const existing = [SLOT([2], '10:00', '12:00')];
    expect(findOverlappingSlots(candidate, existing)).toEqual([]);
  });

  it('considera el end 24:00 al comparar (22:00–24:00 solapa con 23:00–23:59)', () => {
    const candidate = draft({ days: [5], start: '23:00', end: '23:59' });
    const existing = [SLOT([5], '22:00', '24:00')];
    expect(findOverlappingSlots(candidate, existing)).toEqual(existing);
  });

  it('sin solapes devuelve la lista vacía', () => {
    const candidate = draft({ days: [1], start: '10:00', end: '12:00' });
    expect(findOverlappingSlots(candidate, [])).toEqual([]);
  });

  it('con candidata inválida no reporta solapes', () => {
    const candidate = draft({ days: [], start: '10:00', end: '12:00' });
    const existing = [SLOT([1], '08:00', '16:30')];
    expect(findOverlappingSlots(candidate, existing)).toEqual([]);
  });
});

describe('draftDuplicates', () => {
  it('detecta la franja idéntica', () => {
    const candidate = draft({ days: [1, 3], start: '08:00', end: '16:00' });
    const existing = [SLOT([1, 3], '08:00', '16:00')];
    expect(draftDuplicates(candidate, existing)).toBe(true);
  });

  it('no marca como duplicada una franja distinta en forma', () => {
    const candidate = draft({ days: [1], start: '08:00', end: '16:00' });
    const existing = [SLOT([1], '08:01', '16:00'), SLOT([2], '08:00', '16:00')];
    expect(draftDuplicates(candidate, existing)).toBe(false);
  });
});
