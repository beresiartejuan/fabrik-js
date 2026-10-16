import { describe, expect, it } from 'vitest';

import {
  BatchEventId,
  InvalidStockMovementError,
  LocationId,
  MaterialId,
  StockMovement,
  StockMovementId,
} from '../../index';

const LOCATION_ID = LocationId.from('location-1');
const MATERIAL_ID = MaterialId.from('material-1');
const EVENT_ID = BatchEventId.from('event-1');

describe('StockMovement', () => {
  it('create genera id y timestamp por defecto', () => {
    const before = Date.now();
    const movement = StockMovement.create({
      locationId: LOCATION_ID,
      materialId: MATERIAL_ID,
      delta: { amount: 10, unit: 'kg' },
      reason: 'transfer_in',
    });
    expect(typeof movement.id).toBe('string');
    expect(movement.timestamp).toBeInstanceOf(Date);
    expect(movement.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(Object.isFrozen(movement)).toBe(true);
    expect(Object.isFrozen(movement.delta)).toBe(true);
  });

  it('admite deltas negativos con motivo de salida', () => {
    const movement = StockMovement.create({
      locationId: LOCATION_ID,
      materialId: MATERIAL_ID,
      delta: { amount: -5, unit: 'kg' },
      reason: 'transfer_out',
    });
    expect(movement.delta.amount).toBe(-5);
  });

  it('exige batchEventId para produced/consumed', () => {
    expect(() =>
      StockMovement.create({
        locationId: LOCATION_ID,
        materialId: MATERIAL_ID,
        delta: { amount: 5, unit: 'kg' },
        reason: 'produced',
      }),
    ).toThrow(InvalidStockMovementError);

    const produced = StockMovement.create({
      locationId: LOCATION_ID,
      materialId: MATERIAL_ID,
      delta: { amount: 5, unit: 'kg' },
      reason: 'produced',
      batchEventId: EVENT_ID,
    });
    expect(produced.batchEventId).toBe(EVENT_ID);
  });

  it('admite supply_in sin batchEventId y lo prohíbe con uno', () => {
    const movement = StockMovement.create({
      locationId: LOCATION_ID,
      materialId: MATERIAL_ID,
      delta: { amount: 20, unit: 'kg' },
      reason: 'supply_in',
    });
    expect(movement.reason).toBe('supply_in');
    expect(movement.batchEventId).toBeUndefined();

    expect(() =>
      StockMovement.create({
        locationId: LOCATION_ID,
        materialId: MATERIAL_ID,
        delta: { amount: 20, unit: 'kg' },
        reason: 'supply_in',
        batchEventId: EVENT_ID,
      }),
    ).toThrow(InvalidStockMovementError);
  });

  it('prohíbe batchEventId para transferencias y ajustes', () => {
    expect(() =>
      StockMovement.create({
        locationId: LOCATION_ID,
        materialId: MATERIAL_ID,
        delta: { amount: 1, unit: 'kg' },
        reason: 'manual_adjustment',
        batchEventId: EVENT_ID,
      }),
    ).toThrow(InvalidStockMovementError);
  });

  it('rechaza deltas nulos o no finitos', () => {
    expect(() =>
      StockMovement.create({
        locationId: LOCATION_ID,
        materialId: MATERIAL_ID,
        delta: { amount: 0, unit: 'kg' },
        reason: 'manual_adjustment',
      }),
    ).toThrow(InvalidStockMovementError);

    expect(() =>
      StockMovement.create({
        locationId: LOCATION_ID,
        materialId: MATERIAL_ID,
        delta: { amount: Number.NaN, unit: 'kg' },
        reason: 'manual_adjustment',
      }),
    ).toThrow(InvalidStockMovementError);
  });

  it('fromPersistence valida y conserva el id', () => {
    const id = StockMovementId.from('movement-1');
    const movement = StockMovement.fromPersistence({
      id,
      locationId: LOCATION_ID,
      materialId: MATERIAL_ID,
      delta: { amount: -2, unit: 'kg' },
      reason: 'consumed',
      batchEventId: EVENT_ID,
      timestamp: new Date('2026-01-05T08:00:00.000Z'),
    });
    expect(movement.id).toBe(id);
    expect(movement.timestamp.toISOString()).toBe('2026-01-05T08:00:00.000Z');
  });
});
