import { describe, expect, it } from 'vitest';

import {
  InvalidQuantityError,
  Quantity,
  isUnitCompatibleWith,
  type PhysicalState,
  type UnitOfMeasure,
} from '../index.js';

describe('Quantity', () => {
  it('crea una cantidad válida', () => {
    const quantity = Quantity.create(10, 'kg');
    expect(quantity.amount).toBe(10);
    expect(quantity.unit).toBe('kg');
  });

  it('rechaza amount 0', () => {
    expect(() => Quantity.create(0, 'g')).toThrow(InvalidQuantityError);
  });

  it('rechaza amount negativo', () => {
    expect(() => Quantity.create(-1, 'g')).toThrow(InvalidQuantityError);
  });

  it('rechaza NaN', () => {
    expect(() => Quantity.create(Number.NaN, 'g')).toThrow(InvalidQuantityError);
  });

  it('rechaza Infinity', () => {
    expect(() => Quantity.create(Number.POSITIVE_INFINITY, 'g')).toThrow(InvalidQuantityError);
    expect(() => Quantity.create(Number.NEGATIVE_INFINITY, 'g')).toThrow(InvalidQuantityError);
  });

  it('suma cantidades de la misma unidad', () => {
    const result = Quantity.create(2, 'g').add(Quantity.create(3, 'g'));
    expect(result.equals(Quantity.create(5, 'g'))).toBe(true);
  });

  it('lanza al sumar cantidades de distinta unidad', () => {
    expect(() => Quantity.create(1, 'g').add(Quantity.create(1, 'kg'))).toThrow(InvalidQuantityError);
  });

  it('resta cantidades de la misma unidad', () => {
    const result = Quantity.create(5, 'l').subtract(Quantity.create(2, 'l'));
    expect(result.equals(Quantity.create(3, 'l'))).toBe(true);
  });

  it('lanza si la resta da 0 o negativo', () => {
    expect(() => Quantity.create(5, 'g').subtract(Quantity.create(5, 'g'))).toThrow(
      InvalidQuantityError,
    );
    expect(() => Quantity.create(5, 'g').subtract(Quantity.create(6, 'g'))).toThrow(
      InvalidQuantityError,
    );
  });

  it('lanza al restar cantidades de distinta unidad', () => {
    expect(() => Quantity.create(5, 'g').subtract(Quantity.create(1, 'unit'))).toThrow(
      InvalidQuantityError,
    );
  });

  it('compara igualdad por unidad y monto', () => {
    expect(Quantity.create(3, 'ml').equals(Quantity.create(3, 'ml'))).toBe(true);
    expect(Quantity.create(3, 'ml').equals(Quantity.create(3, 'l'))).toBe(false);
    expect(Quantity.create(3, 'ml').equals(Quantity.create(4, 'ml'))).toBe(false);
  });

  it('expone un toString legible', () => {
    expect(Quantity.create(2.5, 'kg').toString()).toBe('2.5 kg');
  });

  it('es inmutable (congelada)', () => {
    const quantity = Quantity.create(1, 'unit');
    expect(Object.isFrozen(quantity)).toBe(true);
  });
});

const UNITS: readonly UnitOfMeasure[] = ['g', 'kg', 'unit', 'ml', 'l', 'm3'];
const STATES: readonly PhysicalState[] = ['solid', 'liquid', 'gas'];
const COMPATIBLE: Record<PhysicalState, readonly UnitOfMeasure[]> = {
  solid: ['g', 'kg', 'unit'],
  liquid: ['ml', 'l'],
  gas: ['ml', 'l', 'm3'],
};

const COMPATIBILITY_CASES = UNITS.flatMap((unit) =>
  STATES.map((state) => [unit, state, COMPATIBLE[state].includes(unit)] as const),
);

describe('isUnitCompatibleWith (matriz 6 unidades x 3 estados)', () => {
  it.each(COMPATIBILITY_CASES)('%s + %s => %s', (unit, state, expected) => {
    expect(isUnitCompatibleWith(unit, state)).toBe(expected);
  });
});
