import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';

import { ApiError, errorToMessage, toApiError } from '@/lib/api/errors';

function httpError(
  statusCode: number,
  error: string,
  message: string,
  context?: Record<string, unknown>,
): AxiosError {
  const config = {} as InternalAxiosRequestConfig;
  return new AxiosError(error, 'ERR_BAD_REQUEST', config, undefined, {
    data: context ? { statusCode, error, message, context } : { statusCode, error, message },
    status: statusCode,
    statusText: '',
    headers: {},
    config,
  });
}

describe('toApiError', () => {
  it('usa el cuerpo del servidor cuando es un error HTTP', () => {
    const api = toApiError(
      httpError(409, 'OverlappingScheduleError', 'solapa', { workerId: 'w1' }),
    );

    expect(api).toBeInstanceOf(ApiError);
    expect(api.statusCode).toBe(409);
    expect(api.error).toBe('OverlappingScheduleError');
    expect(api.context).toEqual({ workerId: 'w1' });
  });

  it('marca como NetworkError los errores sin respuesta', () => {
    const api = toApiError(new AxiosError('Network Error', 'ERR_NETWORK'));

    expect(api.statusCode).toBe(0);
    expect(api.error).toBe('NetworkError');
    expect(api.isNetworkError).toBe(true);
  });

  it('es idempotente con ApiError', () => {
    const original = new ApiError({ statusCode: 404, error: 'NotFoundError', message: 'x' });
    expect(toApiError(original)).toBe(original);
  });

  it('normaliza errores desconocidos', () => {
    expect(toApiError('boom')).toMatchObject({ statusCode: 0, error: 'UnknownError' });
    expect(toApiError(new Error('kaboom'))).toMatchObject({ error: 'Error', message: 'kaboom' });
  });
});

describe('errorToMessage: por nombre de error', () => {
  const cases: Array<[string, string]> = [
    ['OverlappingScheduleError', 'El trabajador ya tiene una asignación en ese horario.'],
    ['InsufficientStockError', 'Stock insuficiente para esa salida.'],
    ['WorkerNotAssignedError', 'No estás asignado a esa máquina en este horario.'],
    ['InactiveMachineError', 'La máquina no está operativa (mantenimiento).'],
    ['InvalidStateTransitionError', 'El lote no admite esa transición de estado.'],
    [
      'InvalidTransformationError',
      'La transformación no es válida (vacía o con inputs repetidos).',
    ],
  ];

  for (const [name, expected] of cases) {
    it(`${name} → mensaje canónico`, () => {
      expect(errorToMessage(httpError(409, name, 'detalle crudo'))).toBe(expected);
    });
  }

  it('IncompatibleUnitError / RecipeIntegrityError añaden el detalle del servidor', () => {
    expect(errorToMessage(httpError(422, 'IncompatibleUnitError', 'unidades distintas'))).toBe(
      'Unidad o receta incompatible. (unidades distintas)',
    );
    expect(
      errorToMessage(httpError(422, 'RecipeIntegrityError', 'Unidad o receta incompatible.')),
    ).toBe('Unidad o receta incompatible.');
  });
});

describe('errorToMessage: fallbacks por status', () => {
  it('403 → permisos', () => {
    expect(errorToMessage(httpError(403, 'UnauthorizedRoleError', 'x'))).toBe(
      'No tenés permisos para esta acción.',
    );
  });

  it('404 → no encontrado', () => {
    expect(errorToMessage(httpError(404, 'NotFoundError', 'x'))).toBe('No se encontró el recurso.');
  });

  it('500 → inesperado', () => {
    expect(errorToMessage(httpError(500, 'InternalServerError', 'stack interno'))).toBe(
      'Ocurrió un error inesperado.',
    );
  });

  it('>=500 sin nombre → inesperado', () => {
    expect(errorToMessage(httpError(502, 'BadGateway', 'upstream'))).toBe(
      'Ocurrió un error inesperado.',
    );
  });

  it('401 → sesión expirada', () => {
    expect(errorToMessage(httpError(401, 'UnauthorizedError', 'x'))).toBe(
      'Tu sesión expiró. Volvé a iniciar sesión.',
    );
  });

  it('error de red → no se pudo contactar', () => {
    expect(errorToMessage(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(
      'No se pudo contactar al servidor.',
    );
  });

  it('4xx sin nombre usa el message del servidor', () => {
    expect(errorToMessage(httpError(400, 'BadRequest', 'El nombre es obligatorio'))).toBe(
      'El nombre es obligatorio',
    );
  });

  it('prioriza el nombre sobre el status', () => {
    expect(errorToMessage(httpError(409, 'InsufficientStockError', 'x'))).toBe(
      'Stock insuficiente para esa salida.',
    );
  });
});
