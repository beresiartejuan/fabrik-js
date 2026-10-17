import { describe, expect, it } from 'vitest';

import { InvalidTimeSlotError, TimeSlot, type DayOfWeek } from '../index.js';

const MONDAY: DayOfWeek = 1;
const TUESDAY: DayOfWeek = 2;
const FRIDAY: DayOfWeek = 5;

describe('TimeSlot', () => {
  it('crea una franja válida, deduplicando y ordenando los días', () => {
    const days: DayOfWeek[] = [3, 1, 3, 2];
    const slot = TimeSlot.create(days, '08:00', '12:00');
    expect(slot.daysOfWeek).toEqual([1, 2, 3]);
    expect(slot.start).toBe('08:00');
    expect(slot.end).toBe('12:00');
  });

  it('rechaza formatos de hora inválidos', () => {
    expect(() => TimeSlot.create([MONDAY], '8:00', '12:00')).toThrow(InvalidTimeSlotError);
    expect(() => TimeSlot.create([MONDAY], '08:60', '12:00')).toThrow(InvalidTimeSlotError);
    expect(() => TimeSlot.create([MONDAY], '24:00', '25:00')).toThrow(InvalidTimeSlotError);
    expect(() => TimeSlot.create([MONDAY], '0800', '12:00')).toThrow(InvalidTimeSlotError);
  });

  it('rechaza start >= end (sin rangos que crucen medianoche)', () => {
    expect(() => TimeSlot.create([MONDAY], '12:00', '12:00')).toThrow(InvalidTimeSlotError);
    expect(() => TimeSlot.create([MONDAY], '13:00', '12:00')).toThrow(InvalidTimeSlotError);
  });

  it('rechaza daysOfWeek vacío', () => {
    expect(() => TimeSlot.create([], '08:00', '12:00')).toThrow(InvalidTimeSlotError);
  });

  it('rechaza días fuera de rango', () => {
    expect(() => TimeSlot.create([7 as DayOfWeek], '08:00', '12:00')).toThrow(InvalidTimeSlotError);
    expect(() => TimeSlot.create([-1 as DayOfWeek], '08:00', '12:00')).toThrow(
      InvalidTimeSlotError,
    );
  });

  it('es inmutable (congelada)', () => {
    const slot = TimeSlot.create([MONDAY], '08:00', '12:00');
    expect(Object.isFrozen(slot)).toBe(true);
    expect(Object.isFrozen(slot.daysOfWeek)).toBe(true);
  });
});

describe('TimeSlot.overlaps (matriz)', () => {
  const base = TimeSlot.create([MONDAY], '08:00', '12:00');

  it('se solapa si comparten día y los rangos se intersecan', () => {
    expect(base.overlaps(TimeSlot.create([MONDAY], '10:00', '14:00'))).toBe(true);
    expect(base.overlaps(TimeSlot.create([MONDAY], '11:00', '13:00'))).toBe(true);
    expect(base.overlaps(TimeSlot.create([MONDAY], '07:00', '09:00'))).toBe(true);
    expect(base.overlaps(TimeSlot.create([MONDAY], '06:00', '13:00'))).toBe(true);
  });

  it('NO se solapa si son adyacentes (end === start)', () => {
    expect(base.overlaps(TimeSlot.create([MONDAY], '12:00', '16:00'))).toBe(false);
    expect(base.overlaps(TimeSlot.create([MONDAY], '06:00', '08:00'))).toBe(false);
  });

  it('NO se solapa si son disjuntas el mismo día', () => {
    expect(base.overlaps(TimeSlot.create([MONDAY], '13:00', '15:00'))).toBe(false);
  });

  it('NO se solapa en días distintos', () => {
    expect(base.overlaps(TimeSlot.create([TUESDAY], '08:00', '12:00'))).toBe(false);
  });

  it('se solapa si comparten al menos un día entre varios', () => {
    const multi = TimeSlot.create([TUESDAY, FRIDAY], '08:00', '12:00');
    expect(base.overlaps(multi)).toBe(false);
    expect(multi.overlaps(TimeSlot.create([FRIDAY], '09:00', '11:00'))).toBe(true);
  });
});

describe('TimeSlot.contains', () => {
  const slot = TimeSlot.create([FRIDAY], '08:00', '12:00');

  it('contiene un instante dentro del día y rango [start, end)', () => {
    // 16-oct-2026 es viernes.
    expect(slot.contains(new Date(2026, 9, 16, 10, 30))).toBe(true);
    expect(slot.contains(new Date(2026, 9, 16, 8, 0))).toBe(true);
    expect(slot.contains(new Date(2026, 9, 16, 12, 0))).toBe(false);
    expect(slot.contains(new Date(2026, 9, 16, 7, 59))).toBe(false);
  });

  it('NO contiene instantes de otro día de la semana', () => {
    expect(slot.contains(new Date(2026, 9, 17, 10, 30))).toBe(false);
  });
});

describe('TimeSlot.equals', () => {
  it('compara días normalizados y rango', () => {
    expect(
      TimeSlot.create([TUESDAY, MONDAY], '08:00', '12:00').equals(
        TimeSlot.create([MONDAY, TUESDAY], '08:00', '12:00'),
      ),
    ).toBe(true);
    expect(
      TimeSlot.create([MONDAY], '08:00', '12:00').equals(TimeSlot.create([MONDAY], '09:00', '12:00')),
    ).toBe(false);
    expect(
      TimeSlot.create([MONDAY], '08:00', '12:00').equals(TimeSlot.create([TUESDAY], '08:00', '12:00')),
    ).toBe(false);
  });
});
