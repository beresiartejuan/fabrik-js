import { describe, expect, it } from 'vitest';

import {
  AssignmentId,
  BatchEventId,
  BatchId,
  FactoryId,
  LocationId,
  MachineId,
  MaterialId,
  RecipeId,
  RecipeStepId,
  StockMovementId,
  WorkerId,
  type IdFactory,
} from '../index';

const FACTORIES: ReadonlyArray<IdFactory<string>> = [
  FactoryId,
  WorkerId,
  MachineId,
  MaterialId,
  LocationId,
  RecipeId,
  RecipeStepId,
  BatchId,
  BatchEventId,
  AssignmentId,
  StockMovementId,
];

describe('Entity ids', () => {
  it('create genera identificadores únicos', () => {
    expect(WorkerId.create()).not.toBe(WorkerId.create());
  });

  it('from reconstituye el valor original (round-trip)', () => {
    const raw = 'worker-123';
    const id = WorkerId.from(raw);
    expect(id).toBe(raw);
    expect(WorkerId.from(raw)).toBe(id);
  });

  it('todas las fábricas generan y reconstituyen correctamente', () => {
    for (const factory of FACTORIES) {
      const first = factory.create();
      const second = factory.create();
      expect(typeof first).toBe('string');
      expect(first).not.toBe(second);
      expect(factory.from(first)).toBe(first);
    }
  });

  it('los ids son brandeados (no intercambiables entre entidades)', () => {
    const workerId = WorkerId.create();
    // @ts-expect-error un WorkerId no es un MachineId
    const invalid: MachineId = workerId;
    expect(invalid).toBe(workerId);
  });
});
