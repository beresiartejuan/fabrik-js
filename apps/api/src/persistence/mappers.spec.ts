import type { DayOfWeek } from '@fabrik/domain';
import { describe, expect, it } from 'vitest';

import { decodeDays, encodeDays } from './mappers.js';

describe('mappers de daysOfWeek', () => {
  it('encodeDays ordena y serializa; decodeDays hace round-trip', () => {
    expect(encodeDays([3, 1, 2] as DayOfWeek[])).toBe('1,2,3');
    expect(decodeDays('1,3')).toEqual([1, 3]);
    expect(decodeDays(encodeDays([0, 6] as DayOfWeek[]))).toEqual([0, 6]);
  });

  it('decodeDays lanza un Error plano ante un token fuera de 0..6 (fila corrupta)', () => {
    for (const corrupt of ['1,7', '-1', 'a', '1,', ' 1', '01', '1,2,x']) {
      expect(() => decodeDays(corrupt)).toThrow(Error);
      expect(() => decodeDays(corrupt)).toThrow(/daysOfWeek inválido/);
    }
  });
});
