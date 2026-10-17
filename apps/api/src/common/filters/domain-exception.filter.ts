import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import {
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
  MaterialKindMismatchError,
  NotAProductionOrderError,
  NotFoundError,
  OverlappingScheduleError,
  RecipeIntegrityError,
  UnauthorizedRoleError,
  WorkerNotAssignedError,
} from '@fabrik/domain';

/** Cuerpo de error estable que ve el cliente. */
export interface DomainErrorResponse {
  readonly statusCode: number;
  /** Nombre de la clase de error (p. ej. `NotFoundError`). */
  readonly error: string;
  readonly message: string;
  /** Campos tipados propios del error (p. ej. `{ entity, id }`). */
  readonly context?: Record<string, unknown>;
}

// Errores de dominio que representan un conflicto con el estado actual.
const CONFLICT_ERRORS = [
  OverlappingScheduleError,
  InsufficientStockError,
  InactiveMachineError,
  InactiveWorkerError,
  InvalidStateTransitionError,
  WorkerNotAssignedError,
] as const;

// Errores de dominio que representan datos/entradas de la petición no procesables.
const UNPROCESSABLE_ERRORS = [
  MaterialKindMismatchError,
  InvalidLocationKindError,
  IncompatibleUnitError,
  RecipeIntegrityError,
  InvalidQuantityError,
  InvalidTimeSlotError,
  InvalidObservationError,
  InvalidTransformationError,
  InvalidStockMovementError,
  NotAProductionOrderError,
] as const;

/**
 * Traduce un error de dominio a HTTP según la tabla de `docs/09-plan-de-api.md`
 * (el contrato):
 *
 * | Error | HTTP |
 * |---|---|
 * | `NotFoundError` | 404 |
 * | `UnauthorizedRoleError` | 403 |
 * | `OverlappingScheduleError`, `InsufficientStockError`, `InactiveMachineError`, `InactiveWorkerError`, `InvalidStateTransitionError`, `WorkerNotAssignedError` | 409 |
 * | resto del grupo 422 (kind/unidad/receta/cantidad/franja/observación/transformación/stock/orden) | 422 |
 * | `DomainError` restante | 500 |
 *
 * `WorkerNotAssignedError` se añadió a la tabla de docs/09 en la Fase 3 (violación
 * de I3) y por eso mapea a 409.
 */
export function httpStatusForDomainError(error: DomainError): number {
  if (error instanceof NotFoundError) {
    return HttpStatus.NOT_FOUND;
  }
  if (error instanceof UnauthorizedRoleError) {
    return HttpStatus.FORBIDDEN;
  }
  if (CONFLICT_ERRORS.some((ErrorClass) => error instanceof ErrorClass)) {
    return HttpStatus.CONFLICT;
  }
  if (UNPROCESSABLE_ERRORS.some((ErrorClass) => error instanceof ErrorClass)) {
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

/**
 * Extrae los campos propios del error (los que no son `name`/`message`/`stack`)
 * como `context`. Al ser clases con propiedades tipadas, el cliente recibe, por
 * ejemplo, `{ entity: 'Material', id: '...' }` o `{ machineId, status }`.
 */
export function domainErrorContext(error: DomainError): Record<string, unknown> | undefined {
  const context: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(error)) {
    if (key === 'name' || key === 'message' || key === 'stack') {
      continue;
    }
    context[key] = value;
  }
  return Object.keys(context).length > 0 ? context : undefined;
}

/**
 * Filtro global de excepciones (registrado con `APP_FILTER`).
 *
 * - `DomainError` → status de la tabla de docs/09 y cuerpo
 *   `{ statusCode, error, message, context? }`.
 * - `HttpException` (p. ej. la del `ZodValidationPipe`) → se deja pasar tal cual
 *   para no pisar la semántica de Nest/HTTP.
 * - Cualquier otra cosa → 500 genérico sin filtrar detalles internos.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(statusCode)
        .json(typeof body === 'string' ? { statusCode, message: body } : body);
      return;
    }

    if (exception instanceof DomainError) {
      const statusCode = httpStatusForDomainError(exception);
      const context = domainErrorContext(exception);
      if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          `DomainError sin status HTTP específico: ${exception.name} — ${exception.message}`,
        );
      }
      const payload: DomainErrorResponse = {
        statusCode,
        error: exception.name,
        message: exception.message,
        ...(context ? { context } : {}),
      };
      response.status(statusCode).json(payload);
      return;
    }

    this.logger.error(
      'Excepción no controlada',
      exception instanceof Error ? exception.stack : String(exception),
    );
    const payload: DomainErrorResponse = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: 'Error interno del servidor',
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(payload);
  }
}
