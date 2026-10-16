import { describe, expect, it } from 'vitest';

import {
  AssignmentId,
  DomainError,
  InactiveMachineError,
  IncompatibleUnitError,
  InsufficientStockError,
  InvalidQuantityError,
  InvalidTimeSlotError,
  MachineId,
  MaterialId,
  OverlappingScheduleError,
  Quantity,
  RecipeId,
  RecipeIntegrityError,
  UnauthorizedRoleError,
  WorkerId,
  WorkerNotAssignedError,
} from '../index';

const WORKER_ID = WorkerId.from('worker-1');
const MACHINE_ID = MachineId.from('machine-1');
const MATERIAL_ID = MaterialId.from('material-1');
const ASSIGNMENT_ID = AssignmentId.from('assignment-1');
const RECIPE_ID = RecipeId.from('recipe-1');

describe('DomainError (base)', () => {
  it('fija su nombre y hereda de Error', () => {
    const error = new DomainError('boom');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DomainError');
    expect(error.message).toBe('boom');
  });
});

describe('OverlappingScheduleError', () => {
  it('transporta workerId y la asignación en conflicto', () => {
    const error = new OverlappingScheduleError(WORKER_ID, ASSIGNMENT_ID);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('OverlappingScheduleError');
    expect(error.workerId).toBe(WORKER_ID);
    expect(error.conflictingAssignmentId).toBe(ASSIGNMENT_ID);
    expect(error.message).toContain(WORKER_ID);
  });
});

describe('InsufficientStockError', () => {
  it('transporta material, cantidad solicitada y disponible', () => {
    const requested = Quantity.create(10, 'kg');
    const available = Quantity.create(3, 'kg');
    const error = new InsufficientStockError(MATERIAL_ID, requested, available);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('InsufficientStockError');
    expect(error.materialId).toBe(MATERIAL_ID);
    expect(error.requested).toBe(requested);
    expect(error.available).toBe(available);
    expect(error.message).toContain('10 kg');
    expect(error.message).toContain('3 kg');
  });
});

describe('WorkerNotAssignedError', () => {
  it('transporta worker, máquina y el instante opcional', () => {
    const at = new Date('2026-01-05T08:00:00.000Z');
    const error = new WorkerNotAssignedError(WORKER_ID, MACHINE_ID, at);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('WorkerNotAssignedError');
    expect(error.workerId).toBe(WORKER_ID);
    expect(error.machineId).toBe(MACHINE_ID);
    expect(error.at).toBe(at);
  });

  it('funciona sin instante', () => {
    const error = new WorkerNotAssignedError(WORKER_ID, MACHINE_ID);
    expect(error.at).toBeUndefined();
  });
});

describe('InactiveMachineError', () => {
  it('transporta máquina y estado', () => {
    const error = new InactiveMachineError(MACHINE_ID, 'maintenance');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('InactiveMachineError');
    expect(error.machineId).toBe(MACHINE_ID);
    expect(error.status).toBe('maintenance');
    expect(error.message).toContain('maintenance');
  });
});

describe('RecipeIntegrityError', () => {
  it('transporta la receta y el motivo', () => {
    const error = new RecipeIntegrityError(RECIPE_ID, 'el último paso no coincide con el output');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('RecipeIntegrityError');
    expect(error.recipeId).toBe(RECIPE_ID);
    expect(error.reason).toBe('el último paso no coincide con el output');
  });
});

describe('UnauthorizedRoleError', () => {
  it('transporta el rol y el caso de uso', () => {
    const error = new UnauthorizedRoleError('auditor', 'StartProduction');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('UnauthorizedRoleError');
    expect(error.role).toBe('auditor');
    expect(error.useCase).toBe('StartProduction');
    expect(error.message).toContain('auditor');
  });
});

describe('IncompatibleUnitError', () => {
  it('transporta unidad esperada y recibida', () => {
    const error = new IncompatibleUnitError('kg', 'l');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('IncompatibleUnitError');
    expect(error.expected).toBe('kg');
    expect(error.received).toBe('l');
    expect(error.materialId).toBeUndefined();
  });

  it('incluye el material cuando se provee', () => {
    const error = new IncompatibleUnitError('g', 'ml', MATERIAL_ID);
    expect(error.materialId).toBe(MATERIAL_ID);
    expect(error.message).toContain(MATERIAL_ID);
  });
});

describe('Errores de value objects (Fase 1)', () => {
  it('InvalidQuantityError hereda de DomainError', () => {
    const error = new InvalidQuantityError('cantidad inválida');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('InvalidQuantityError');
  });

  it('InvalidTimeSlotError hereda de DomainError', () => {
    const error = new InvalidTimeSlotError('franja inválida');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('InvalidTimeSlotError');
  });
});

describe('Catálogo completo de errores', () => {
  const CASES: ReadonlyArray<readonly [string, DomainError]> = [
    ['DomainError', new DomainError('x')],
    ['InvalidQuantityError', new InvalidQuantityError('x')],
    ['InvalidTimeSlotError', new InvalidTimeSlotError('x')],
    ['OverlappingScheduleError', new OverlappingScheduleError(WORKER_ID, ASSIGNMENT_ID)],
    [
      'InsufficientStockError',
      new InsufficientStockError(MATERIAL_ID, Quantity.create(1, 'g'), Quantity.create(1, 'g')),
    ],
    ['WorkerNotAssignedError', new WorkerNotAssignedError(WORKER_ID, MACHINE_ID)],
    ['InactiveMachineError', new InactiveMachineError(MACHINE_ID, 'idle')],
    ['RecipeIntegrityError', new RecipeIntegrityError(RECIPE_ID, 'x')],
    ['UnauthorizedRoleError', new UnauthorizedRoleError('worker', 'x')],
    ['IncompatibleUnitError', new IncompatibleUnitError('g', 'kg')],
  ];

  it.each(CASES)('%s hereda de DomainError con su nombre', (name, error) => {
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe(name);
  });
});
