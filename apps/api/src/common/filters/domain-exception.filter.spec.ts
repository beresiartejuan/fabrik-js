import { Logger, type ArgumentsHost } from '@nestjs/common';
import {
  AssignmentId,
  BatchId,
  DomainError,
  InactiveMachineError,
  InactiveWorkerError,
  IncompatibleUnitError,
  InsufficientStockError,
  InvalidLocationKindError,
  InvalidObservationError,
  InvalidQuantityError,
  InvalidStateTransitionError,
  InvalidStockMovementError,
  InvalidTimeSlotError,
  InvalidTransformationError,
  LocationId,
  MachineId,
  MaterialId,
  MaterialKindMismatchError,
  NotAProductionOrderError,
  NotFoundError,
  OverlappingScheduleError,
  Quantity,
  RecipeId,
  RecipeIntegrityError,
  UnauthorizedRoleError,
  WorkerId,
  WorkerNotAssignedError,
} from '@fabrik/domain';

import { DomainExceptionFilter } from './domain-exception.filter.js';

interface FakeHttp {
  readonly host: ArgumentsHost;
  readonly status: ReturnType<typeof vi.fn>;
  readonly json: ReturnType<typeof vi.fn>;
}

function fakeHost(): FakeHttp {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

// Tabla de docs/09-plan-de-api.md (el contrato error → HTTP). Un caso por clase
// de error del catálogo.
const cases: ReadonlyArray<readonly [label: string, error: Error, expected: number]> = [
  ['NotFoundError', new NotFoundError('Material', MaterialId.from('m1')), 404],
  ['UnauthorizedRoleError', new UnauthorizedRoleError('worker', 'CreateMaterial'), 403],
  [
    'OverlappingScheduleError',
    new OverlappingScheduleError(WorkerId.from('w1'), AssignmentId.from('a1')),
    409,
  ],
  [
    'InsufficientStockError',
    new InsufficientStockError(
      MaterialId.from('m1'),
      Quantity.create(5, 'kg'),
      Quantity.create(1, 'kg'),
    ),
    409,
  ],
  ['InactiveMachineError', new InactiveMachineError(MachineId.from('m1'), 'maintenance'), 409],
  ['InactiveWorkerError', new InactiveWorkerError(WorkerId.from('w1')), 409],
  ['InvalidStateTransitionError', new InvalidStateTransitionError('Batch', 'stored', 'in_progress'), 409],
  [
    'WorkerNotAssignedError',
    new WorkerNotAssignedError(WorkerId.from('w1'), MachineId.from('m1')),
    409,
  ],
  [
    'MaterialKindMismatchError',
    new MaterialKindMismatchError(MaterialId.from('m1'), 'supply', 'product'),
    422,
  ],
  [
    'InvalidLocationKindError',
    new InvalidLocationKindError('storage', LocationId.from('l1'), 'production'),
    422,
  ],
  ['IncompatibleUnitError', new IncompatibleUnitError('kg', 'unit', MaterialId.from('m1')), 422],
  ['RecipeIntegrityError', new RecipeIntegrityError(RecipeId.from('r1'), 'output no coincide'), 422],
  ['InvalidQuantityError', new InvalidQuantityError('no positiva'), 422],
  ['InvalidTimeSlotError', new InvalidTimeSlotError('franja inválida'), 422],
  ['InvalidObservationError', new InvalidObservationError(501), 422],
  ['InvalidTransformationError', new InvalidTransformationError('empty', 'sin inputs'), 422],
  ['InvalidStockMovementError', new InvalidStockMovementError('produced', 'sin batchEventId'), 422],
  ['NotAProductionOrderError', new NotAProductionOrderError(BatchId.from('b1')), 422],
  ['DomainError (resto)', new DomainError('boom'), 500],
];

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // El filtro registra los 500; se silencia el logger y se comprueba aparte.
    errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it.each(cases)('mapea %s → %i', (_label, error, expected) => {
    const { host, status, json } = fakeHost();
    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(expected);
    expect(json).toHaveBeenCalledTimes(1);
    const body = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.statusCode).toBe(expected);
    expect(body.error).toBe(error.name);
    expect(body.message).toBe(error.message);
  });

  it('incluye el contexto tipado del error de dominio', () => {
    const { host, json } = fakeHost();
    filter.catch(new NotFoundError('Material', 'material-42'), host);

    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'NotFoundError',
      message: 'Material no encontrado: material-42',
      context: { entity: 'Material', id: 'material-42' },
    });
  });

  it('mapea un error desconocido a 500 genérico sin filtrar detalles', () => {
    const { host, status, json } = fakeHost();
    filter.catch(new Error('secreto interno'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      error: 'InternalServerError',
      message: 'Error interno del servidor',
    });
    expect(errorSpy).toHaveBeenCalled();
  });
});
