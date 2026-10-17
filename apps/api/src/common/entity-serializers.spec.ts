import {
  Batch,
  BatchEvent,
  BatchEventId,
  BatchId,
  LocationId,
  MachineId,
  MaterialId,
  Quantity,
  RecipeId,
  StockMovement,
  TimeSlot,
  WorkerId,
} from '@fabrik/domain';
import { describe, expect, it } from 'vitest';

import {
  serializeBatch,
  serializeBatchEvent,
  serializeQuantity,
  serializeStockByLocationEntry,
  serializeStockMovement,
  serializeTimeSlot,
} from './entity-serializers.js';

/**
 * Los serializadores son explícitos (lista blanca) porque `TimeSlot` guarda
 * `startMinutes`/`endMinutes` como propiedades propias: un `{ ...slot }` los
 * filtraría al wire. Este test fija ese contrato.
 */
describe('entity serializers', () => {
  it('serializeTimeSlot expone solo daysOfWeek/start/end (sin minutos internos)', () => {
    const serialized = serializeTimeSlot(TimeSlot.create([5, 1], '08:00', '16:30'));
    expect(serialized).toEqual({ daysOfWeek: [1, 5], start: '08:00', end: '16:30' });
    expect(Object.keys(serialized)).toEqual(['daysOfWeek', 'start', 'end']);
  });

  it('serializeQuantity expone amount y unit', () => {
    expect(serializeQuantity(Quantity.create(2, 'kg'))).toEqual({ amount: 2, unit: 'kg' });
  });

  // --- Entidades de producción (Fase 5) ---

  it('serializeBatch expone el lote con Quantity anidada y solo los campos presentes', () => {
    const batch = Batch.create({
      materialId: MaterialId.from('m-1'),
      quantity: Quantity.create(2, 'kg'),
      recipeId: RecipeId.from('r-1'),
      status: 'stored',
    });
    const serialized = serializeBatch(batch);
    expect(serialized).toEqual({
      id: batch.id,
      materialId: 'm-1',
      quantity: { amount: 2, unit: 'kg' },
      recipeId: 'r-1',
      status: 'stored',
    });
    // Lote de suministro (sin receta ni evento de origen): los opcionales se omiten.
    const supply = Batch.create({
      materialId: MaterialId.from('m-2'),
      quantity: Quantity.create(5, 'unit'),
      status: 'stored',
    });
    expect(serializeBatch(supply)).toEqual({
      id: supply.id,
      materialId: 'm-2',
      quantity: { amount: 5, unit: 'unit' },
      status: 'stored',
    });
    expect(Object.keys(serializeBatch(supply))).toEqual(['id', 'materialId', 'quantity', 'status']);
  });

  it('serializeBatchEvent expone inputs/outputs, observación normalizada y timestamp ISO', () => {
    const event = BatchEvent.create({
      machineId: MachineId.from('machine-1'),
      workerId: WorkerId.from('worker-1'),
      locationId: LocationId.from('loc-1'),
      inputs: [
        {
          batchId: BatchId.from('batch-in'),
          materialId: MaterialId.from('m-in'),
          quantity: Quantity.create(2, 'kg'),
        },
      ],
      outputs: [{ materialId: MaterialId.from('m-out'), quantity: Quantity.create(1, 'unit') }],
      observation: '  mezclado  ',
      timestamp: new Date('2026-01-02T03:04:05.000Z'),
    });
    const serialized = serializeBatchEvent(event);
    expect(serialized).toEqual({
      id: event.id,
      machineId: 'machine-1',
      workerId: 'worker-1',
      locationId: 'loc-1',
      inputs: [{ batchId: 'batch-in', materialId: 'm-in', quantity: { amount: 2, unit: 'kg' } }],
      outputs: [{ materialId: 'm-out', quantity: { amount: 1, unit: 'unit' } }],
      observation: 'mezclado',
      timestamp: '2026-01-02T03:04:05.000Z',
    });
  });

  it('serializeStockMovement expone el delta con signo y el timestamp ISO', () => {
    const movement = StockMovement.create({
      locationId: LocationId.from('loc-1'),
      materialId: MaterialId.from('m-1'),
      delta: { amount: -2, unit: 'kg' },
      reason: 'consumed',
      batchEventId: BatchEventId.from('event-1'),
      timestamp: new Date('2026-01-02T03:04:05.000Z'),
    });
    expect(serializeStockMovement(movement)).toEqual({
      id: movement.id,
      locationId: 'loc-1',
      materialId: 'm-1',
      delta: { amount: -2, unit: 'kg' },
      reason: 'consumed',
      batchEventId: 'event-1',
      timestamp: '2026-01-02T03:04:05.000Z',
    });
  });

  it('serializeStockByLocationEntry expone materialId/amount/unit', () => {
    expect(
      serializeStockByLocationEntry({ materialId: MaterialId.from('m-1'), amount: 5, unit: 'kg' }),
    ).toEqual({ materialId: 'm-1', amount: 5, unit: 'kg' });
  });
});
