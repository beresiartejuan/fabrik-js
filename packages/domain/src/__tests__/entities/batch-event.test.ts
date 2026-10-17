import { describe, expect, it } from 'vitest';

import {
  BatchEvent,
  BatchEventId,
  BatchId,
  InvalidObservationError,
  LocationId,
  MachineId,
  MaterialId,
  MAX_OBSERVATION_LENGTH,
  Quantity,
  RecipeStepId,
  WorkerId,
} from '../../index.js';

const MACHINE_ID = MachineId.from('machine-1');
const WORKER_ID = WorkerId.from('worker-1');
const LOCATION_ID = LocationId.from('location-1');
const BATCH_ID = BatchId.from('batch-1');
const MATERIAL_ID = MaterialId.from('material-1');

function baseProps() {
  return {
    machineId: MACHINE_ID,
    workerId: WORKER_ID,
    locationId: LOCATION_ID,
    inputs: [{ batchId: BATCH_ID, materialId: MATERIAL_ID, quantity: Quantity.create(10, 'kg') }],
    outputs: [{ materialId: MATERIAL_ID, quantity: Quantity.create(8, 'kg') }],
  };
}

describe('BatchEvent', () => {
  it('create genera id y timestamp por defecto', () => {
    const before = Date.now();
    const event = BatchEvent.create(baseProps());
    expect(typeof event.id).toBe('string');
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('fromPersistence conserva id, timestamp y paso de receta', () => {
    const id = BatchEventId.from('event-1');
    const recipeStepId = RecipeStepId.from('step-1');
    const timestamp = new Date('2026-01-05T08:00:00.000Z');
    const event = BatchEvent.fromPersistence({
      ...baseProps(),
      id,
      recipeStepId,
      timestamp,
    });
    expect(event.id).toBe(id);
    expect(event.recipeStepId).toBe(recipeStepId);
    expect(event.timestamp).toBe(timestamp);
  });

  it('es inmutable: congela la entidad, los arrays y sus elementos (I4)', () => {
    const event = BatchEvent.create(baseProps());
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.inputs)).toBe(true);
    expect(Object.isFrozen(event.outputs)).toBe(true);
    expect(Object.isFrozen(event.inputs[0])).toBe(true);
    expect(() => {
      // @ts-expect-error intento de mutación sobre una entidad inmutable
      event.inputs[0].quantity = Quantity.create(1, 'kg');
    }).toThrow();
  });

  it('normaliza la observación con trim', () => {
    const event = BatchEvent.create({ ...baseProps(), observation: '  merma leve  ' });
    expect(event.observation).toBe('merma leve');
  });

  it('convierte una observación vacía en undefined', () => {
    expect(BatchEvent.create({ ...baseProps(), observation: '   ' }).observation).toBeUndefined();
    expect(BatchEvent.create(baseProps()).observation).toBeUndefined();
  });

  it('rechaza una observación que supera el máximo (post-trim)', () => {
    const tooLong = 'a'.repeat(MAX_OBSERVATION_LENGTH + 1);
    expect(() => BatchEvent.create({ ...baseProps(), observation: tooLong })).toThrow(
      InvalidObservationError,
    );
  });

  it('acepta una observación en el límite', () => {
    const limit = 'a'.repeat(MAX_OBSERVATION_LENGTH);
    expect(BatchEvent.create({ ...baseProps(), observation: limit }).observation).toBe(limit);
  });

  it('los outputs pueden no referenciar un batch', () => {
    const event = BatchEvent.create(baseProps());
    expect(event.inputs[0].batchId).toBe(BATCH_ID);
    expect(event.outputs[0].batchId).toBeUndefined();
  });
});
