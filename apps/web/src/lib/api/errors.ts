import axios from 'axios';

import type { ApiErrorBody } from './types';

/**
 * Error normalizado de la capa HTTP.
 *
 * Cualquier fallo (error de red, `DomainExceptionFilter`, `HttpException` de
 * Nest…) se traduce a `ApiError` para que la UI trabaje con una única forma y
 * `errorToMessage()` pueda decidir el mensaje en español.
 */
export interface ApiErrorOptions {
  /** HTTP status; `0` para errores de red/parseo. */
  readonly statusCode: number;
  /** Nombre de la clase de error (`error` en el body) o un rótulo interno. */
  readonly error: string;
  readonly message: string;
  /** Campos tipados del error de dominio (si el filtro los envió). */
  readonly context?: Record<string, unknown>;
  /** `true` cuando no hubo respuesta del servidor (red caída, CORS, timeout). */
  readonly isNetworkError?: boolean;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly error: string;
  readonly context?: Record<string, unknown>;
  readonly isNetworkError: boolean;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = 'ApiError';
    this.statusCode = options.statusCode;
    this.error = options.error;
    this.context = options.context;
    this.isNetworkError = options.isNetworkError ?? false;
  }

  /** `true` si el servidor respondió con este status. */
  hasStatus(status: number): boolean {
    return this.statusCode === status;
  }
}

/** Normaliza cualquier `unknown` a `ApiError` (idempotente). */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const response = error.response;
    if (response) {
      const body = response.data as Partial<ApiErrorBody> | undefined;
      return new ApiError({
        statusCode: body?.statusCode ?? response.status,
        error: body?.error ?? 'HttpError',
        message: body?.message ?? error.message,
        context: body?.context,
      });
    }
    return new ApiError({
      statusCode: 0,
      error: 'NetworkError',
      message: 'No se pudo contactar al servidor.',
      isNetworkError: true,
    });
  }

  if (error instanceof Error) {
    return new ApiError({ statusCode: 0, error: error.name, message: error.message });
  }

  return new ApiError({ statusCode: 0, error: 'UnknownError', message: String(error) });
}

/**
 * Mensajes en español por **nombre** de error de dominio
 * (`DomainExceptionFilter`, docs/10-plan-de-web.md §Errores).
 */
const ERROR_NAME_MESSAGES: Record<string, string> = {
  OverlappingScheduleError: 'El trabajador ya tiene una asignación en ese horario.',
  InsufficientStockError: 'Stock insuficiente para esa salida.',
  WorkerNotAssignedError: 'No estás asignado a esa máquina en este horario.',
  InactiveMachineError: 'La máquina no está operativa (mantenimiento).',
  InvalidStateTransitionError: 'El lote no admite esa transición de estado.',
  IncompatibleUnitError: 'Unidad o receta incompatible.',
  RecipeIntegrityError: 'Unidad o receta incompatible.',
  InvalidTransformationError: 'La transformación no es válida (vacía o con inputs repetidos).',
};

/** Errores cuyo mensaje canónico es genérico: se enriquece con `message`. */
const ERRORS_WITH_DETAIL = new Set(['IncompatibleUnitError', 'RecipeIntegrityError']);

/**
 * Traduce un error a un mensaje en español para la UI.
 *
 * Prioridad: **nombre** de error de dominio → status HTTP → error de red →
 * `message` del servidor como último recurso. `401` no suele llegar aquí (lo
 * resuelve el interceptor), pero se mapea por si acaso.
 */
export function errorToMessage(error: unknown): string {
  const api = toApiError(error);

  const byName = ERROR_NAME_MESSAGES[api.error];
  if (byName) {
    if (ERRORS_WITH_DETAIL.has(api.error) && api.message && api.message !== byName) {
      return `${byName} (${api.message})`;
    }
    return byName;
  }

  if (api.isNetworkError) {
    return 'No se pudo contactar al servidor.';
  }

  switch (api.statusCode) {
    case 401:
      return 'Tu sesión expiró. Volvé a iniciar sesión.';
    case 403:
      return 'No tenés permisos para esta acción.';
    case 404:
      return 'No se encontró el recurso.';
    case 500:
      return 'Ocurrió un error inesperado.';
    default:
      break;
  }

  if (api.statusCode >= 500) {
    return 'Ocurrió un error inesperado.';
  }

  return api.message.length > 0 ? api.message : 'Ocurrió un error inesperado.';
}
