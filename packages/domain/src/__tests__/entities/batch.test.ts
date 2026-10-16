import { describe, expect, it } from 'vitest';

import {
  Batch,
  BatchEventId,
  BatchId,
  InvalidStateTransitionError,
  MaterialId,
  Quantity,
  RecipeId,
} from '../../index';

const MATERIAL_ID = MaterialId.from('material-1');

function makeBatch(recipeId?: RecipeId): Batch {
  return Batch.create({ materialId: MATERIAL_ID, quantity: Quantity.create(10, 'kg'), recipeId });
}

describe('Batch', () => {
  it('create arranca en in_progress', () => {
    const batch = makeBatch(RecipeId.from('recipe-1'));
    expect(batch.status).toBe('in_progress');
    expect(batch.recipeId).toBe('recipe-1');
    expect(batch.originBatchEventId).toBeUndefined();
    expect(Object.isFrozen(batch)).toBe(true);
  });

  it('permite in_progress → stored → in_progress', () => {
    const batch = makeBatch();
    const stored = batch.store();
    expect(stored.status).toBe('stored');
    expect(stored.resume().status).toBe('in_progress');
    // la instancia original no cambia
    expect(batch.status).toBe('in_progress');
  });

  it('permite completar desde in_progress', () => {
    expect(makeBatch().complete().status).toBe('completed');
  });

  it('permite completar desde stored', () => {
    expect(makeBatch().store().complete().status).toBe('completed');
  });

  it('completed es final: no admite más transiciones', () => {
    const completed = makeBatch().complete();
    expect(() => completed.store()).toThrow(InvalidStateTransitionError);
    expect(() => completed.resume()).toThrow(InvalidStateTransitionError);
    expect(() => completed.complete()).toThrow(InvalidStateTransitionError);
  });

  it('resume solo es válido desde stored', () => {
    expect(() => makeBatch().resume()).toThrow(InvalidStateTransitionError);
  });

  it('store solo es válido desde in_progress', () => {
    expect(() => makeBatch().store().store()).toThrow(InvalidStateTransitionError);
  });

  it('fromPersistence reconstituye id y metadatos', () => {
    const id = BatchId.from('batch-1');
    const eventId = BatchEventId.from('event-1');
    const batch = Batch.fromPersistence({
      id,
      materialId: MATERIAL_ID,
      quantity: Quantity.create(5, 'kg'),
      originBatchEventId: eventId,
      status: 'stored',
    });
    expect(batch.id).toBe(id);
    expect(batch.originBatchEventId).toBe(eventId);
    expect(batch.status).toBe('stored');
  });
});
