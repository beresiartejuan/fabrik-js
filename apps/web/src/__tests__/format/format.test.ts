import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime } from '@/lib/format/date';
import { DAY_LABELS, dayLabel, formatDays, formatTimeSlot } from '@/lib/format/days';
import { formatQty, formatQuantity, validateQuantity } from '@/lib/format/quantity';
import { unitLabel } from '@/lib/format/units';

describe('units', () => {
  it('etiqueta todas las unidades del wire', () => {
    expect(unitLabel('g')).toBe('g');
    expect(unitLabel('kg')).toBe('kg');
    expect(unitLabel('l')).toBe('l');
    expect(unitLabel('ml')).toBe('ml');
    expect(unitLabel('m3')).toBe('m³');
    expect(unitLabel('unit')).toBe('u');
  });
});

describe('days', () => {
  it('etiqueta los siete días (0 = domingo … 6 = sábado)', () => {
    expect(DAY_LABELS[0]).toBe('dom');
    expect(dayLabel(6)).toBe('sáb');
  });

  it('formatDays deduplica y ordena', () => {
    expect(formatDays([3, 1, 3, 5])).toBe('lun, mié, vie');
  });

  it('formatTimeSlot compone días y horas', () => {
    expect(formatTimeSlot({ daysOfWeek: [1, 3], start: '08:00', end: '16:30' })).toBe(
      'lun, mié 08:00–16:30',
    );
  });
});

describe('quantity', () => {
  it('formatQty compone amount + etiqueta', () => {
    expect(formatQty(2, 'kg')).toBe('2 kg');
    expect(formatQty(3, 'unit')).toBe('3 u');
    expect(formatQty(1, 'm3')).toBe('1 m³');
  });

  it('formatQuantity acepta el wire { amount, unit }', () => {
    expect(formatQuantity({ amount: 250, unit: 'g' })).toBe('250 g');
  });

  it('validateQuantity usa el invariante del dominio', () => {
    expect(validateQuantity(2, 'kg')?.amount).toBe(2);
    expect(validateQuantity(0, 'kg')).toBeNull();
    expect(validateQuantity(-1, 'l')).toBeNull();
    expect(validateQuantity(Number.NaN, 'g')).toBeNull();
  });
});

describe('date', () => {
  const iso = '2026-03-04T13:05:00.000Z';

  it('formatDateTime coincide con Intl es (dateStyle/timeStyle short)', () => {
    const expected = new Intl.DateTimeFormat('es', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
    expect(formatDateTime(iso)).toBe(expected);
    expect(formatDateTime(new Date(iso))).toBe(expected);
  });

  it('formatDate coincide con Intl es (dateStyle short)', () => {
    const expected = new Intl.DateTimeFormat('es', { dateStyle: 'short' }).format(new Date(iso));
    expect(formatDate(iso)).toBe(expected);
  });

  it('devuelve cadena vacía con fechas inválidas', () => {
    expect(formatDate('no-es-fecha')).toBe('');
    expect(formatDateTime('no-es-fecha')).toBe('');
  });
});
