import {
  type Actor,
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
  LastAdminError,
  MachineTypeMismatchError,
  MaterialKindMismatchError,
  NotAProductionOrderError,
  NotFoundError,
  OverlappingScheduleError,
  RecipeIntegrityError,
  type Repositories,
  SelfModificationNotAllowedError,
  UnauthorizedRoleError,
  type UnitOfWork,
  WorkerNotAssignedError,
} from '@fabrik/domain';

import { ApiError } from '../errors';
import { DemoUnauthorizedError, me } from './auth';
import { loadDb } from './db';
import { ensureHistorySeeded } from './history';
import {
  clock,
  type DemoEventBus,
  type DemoRegistry,
  demoActorFromWire,
  demoRegistry,
  toDomainActor,
} from './registry';

/**
 * Kit compartido de los **módulos del runtime DEMO** (docs/demo.md §4/§6).
 *
 * Consume T4a (`modules/{materials,locations,machines,workers,recipes,assignments,
 * me}Demo.ts`) y T4b (`{supplies,production,batches,stock,batchEvents,trace}Demo.ts`
 * — archivos disjuntos): acá viven las dos piezas que replican la frontera HTTP
 * (`apps/api`) y por eso los componentes y `errorToMessage()`/`QueryError`/
 * `useErrorToast`/`CatalogsReadGate` siguen funcionando sin cambios:
 *
 * 1. **`toApiError` — paridad de errores (§6, espejo del `DomainExceptionFilter`
 *    de `apps/api/src/common/filters/domain-exception.filter.ts`).** Los módulos
 *    ejecutan los use cases **reales** del dominio, así que reciben las mismas
 *    clases `DomainError`: la tabla de docs/09 decide el status (`NotFoundError`
 *    404 · `UnauthorizedRoleError` 403 · 409 los 8 conflictos de estado · 422 las
 *    11 entradas no procesables · `DomainError` restante 500) y el body es
 *    `{ statusCode, error: error.name, message, context }` — el contexto son las
 *    propiedades propias del error (las que el filter extrae con
 *    `Object.entries`, excluyendo `name`/`message`/`stack`). En demo no hay
 *    transporte: se arma directamente la `ApiError` **final** que el cliente
 *    HTTP plegaría del body del filter (`statusCode`/`error`/`message`/`context`,
 *    `isNetworkError: false`). Extras: `DemoUnauthorizedError` (los 401 de
 *    `demo/auth.ts` en lugar del `UnauthorizedException` de Nest) → 401
 *    `{ error: 'Unauthorized' }` — la UI solo mira el status (`hasStatus(401)`).
 *    Lo desconocido (error técnico, `throw` no-Error) → 500
 *    `InternalServerError`/`'Error interno del servidor'`, tal como lo produce
 *    la rama genérica del filter. Una `ApiError` de entrada **pasa tal cual**
 *    (idempotente: doble traducción en un `catch` es inofensiva).
 * 2. **`DemoContext` — el singleton del runtime.** Envuelve la composición
 *    `demoRegistry` (stateless: adaptadores sobre `sessionStorage`, seguro de
 *    cachear) y añade el **actor por llamada**. Los módulos leen el access
 *    token **en cada operación** (`readTokens()?.accessToken ?? ''`, de
 *    `lib/session/session-store`) y lo pasan por argumento;
 *    `requireActor` resuelve con `demo/auth.me()` (rol **fresco** de la fila,
 *    parity del `ActorGuard`) y lanza la `ApiError` de 401 — **no se cachean
 *    actores**.
 *
 * ### Convención para los módulos demo (T4a/T4b)
 *
 * - Cada módulo es una fábrica `createXxxDemoApi(ctx = getDemoContext()): XxxApi`
 *   con **la misma interfaz** que el módulo axios de `../modules/*Api.ts` (los
 *   componentes no cambian; la línea de binding del módulo es la única editada).
 * - Cada operación es una **función `async`** (las interfaces devuelven
 *   `Promise` y `execute` es async aunque corra en memoria):
 *     1. `const ctx = await ensureDemoContext()` — sync/async: `getDemoContext()`
 *        es sync y entrega el singleton sin más (la composición no es I/O);
 *        `ensureDemoContext()` es async porque la **primera operación de la
 *        pestaña** espera a que `ensureHistorySeeded` corra el histórico
 *        (I/O de storage). Ningún módulo siembra por su cuenta.
 *     2. `const actor = await ctx.requireActor(tokenPorLlamada)` — token leído
 *        fresco de la sesión en cada operación; falla → `ApiError` 401.
 *     3. Entrada wire → dominio con `demo/mappers.ts` (`*Id.from`,
 *        `Quantity.create`, `TimeSlot.create`… revalidan invariantes, igual que
 *        la hidratación de `apps/api`).
 *     4. Los casos de uso viven en `ctx.registry.useCases.<módulo>.<Caso>`
 *        (ejecutar `await caso.execute(actor, command)`).
 *     5. Entidad → wire con `demo/mappers.ts` (`*ToWire`, **campos opcionales
 *        omitidos**) y resolver la promesa. Lecturas de apoyo del controlador
 *        real (p. ej. `outputBatches` de `/production/transform`) se replican
 *        con los mismos casos de uso/repos de `ctx` y `ctx.clock` para
 *        derivadas del reloj (`me/schedule`: `activeNow`).
 * - **Errores:** todo el cuerpo va en un `try/catch` cuyo catch hace
 *   `throw toApiError(e)` — una sola traducción al final del borde (ver (1);
 *   la `ApiError` de `requireActor` pasa íntegra, sin doble mapeo).
 */

// ---------------------------------------------------------------------------
// §6 — La tabla dominio → HTTP (espejo stricto del DomainExceptionFilter)
// ---------------------------------------------------------------------------

/** Errores de dominio que son **conflicto con el estado actual**. */
const CONFLICT_ERRORS = [
  OverlappingScheduleError,
  InsufficientStockError,
  InactiveMachineError,
  InactiveWorkerError,
  InvalidStateTransitionError,
  WorkerNotAssignedError,
  // Invariantes anti-lockout (Fase 8): el estado actual impide la operación.
  SelfModificationNotAllowedError,
  LastAdminError,
] as const;

/** Errores de dominio que son **datos de la petición no procesables**. */
const UNPROCESSABLE_ERRORS = [
  MaterialKindMismatchError,
  // La combinación paso de receta ↔ tipo de máquina es inválida, igual que un
  // material/lugar de la clase equivocada (mismo grupo 422).
  MachineTypeMismatchError,
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

/** Status HTTP del error (la tabla de docs/09 que ejecuta el filter del API). */
function httpStatusForDomainError(error: DomainError): number {
  if (error instanceof NotFoundError) {
    return 404;
  }
  if (error instanceof UnauthorizedRoleError) {
    return 403;
  }
  if (CONFLICT_ERRORS.some((ErrorClass) => error instanceof ErrorClass)) {
    return 409;
  }
  if (UNPROCESSABLE_ERRORS.some((ErrorClass) => error instanceof ErrorClass)) {
    return 422;
  }
  // Fallback del filter: `DomainError` sin fila de la tabla → 500, pero con el
  // **nombre propio** en `error` (la rama es "no conocido", no "borrar rastro").
  return 500;
}

/**
 * Campos propios del error (`Object.entries` excluye `name`/`message`/`stack`,
 * no-enumerables en las clases del dominio) — la misma extracción que
 * `domainErrorContext()` del filter; el cliente no los serializa, los recibe.
 */
function domainErrorContext(error: DomainError): Record<string, unknown> | undefined {
  const context: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(error)) {
    if (key === 'name' || key === 'message' || key === 'stack') {
      continue;
    }
    context[key] = value;
  }
  return Object.keys(context).length > 0 ? context : undefined;
}

// Cuerpo exacto que el filter del API emite para un error no dominio: los
// detalles internos no salen del servidor (`'Error interno del servidor'`).
const INTERNAL_SERVER_ERROR_BODY = {
  statusCode: 500,
  error: 'InternalServerError',
  message: 'Error interno del servidor',
} as const;

/**
 * Traduce un error del **camino demo** a la `ApiError` FINAL que el cliente
 * HTTP habría plegado del body del `DomainExceptionFilter` (§6). Idempotente
 * sobre `ApiError`; el resto del camino axios (`errors.ts`) no participa.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  // 401 de auth demo: la forma del `UnauthorizedException` de Nest al pasar por
  // el filter (`{ statusCode: 401, error: 'Unauthorized', message }`); el
  // mensaje viene del `demo/auth.ts` y la UI solo decide por el status.
  if (error instanceof DemoUnauthorizedError) {
    return new ApiError({
      statusCode: 401,
      error: 'Unauthorized',
      message: error.message,
    });
  }

  // Error de dominio real (el use case lo lanzó, no un transporte): status
  // según la tabla + propio nombre + propio mensaje + context con campos.
  if (error instanceof DomainError) {
    const statusCode = httpStatusForDomainError(error);
    const context = domainErrorContext(error);
    return new ApiError({
      statusCode,
      error: error.name,
      message: error.message,
      ...(context !== undefined ? { context } : {}),
    });
  }

  // Error técnico u otro valor lanzado: la rama genérica del filter no filtra
  // detalles del servidor, el cliente solo ve el body de arriba.
  return new ApiError({
    ...INTERNAL_SERVER_ERROR_BODY,
  });
}

// ---------------------------------------------------------------------------
// Contexto singleton del runtime demo
// ---------------------------------------------------------------------------

/**
 * Contexto de ejecución de los módulos demo. `registry` es la composición
 * **de la pestaña** (`demoRegistry`, stateless — seguro compartir/cachear);
 * `requireActor` es lo único por llamada.
 */
export interface DemoContext {
  /** La composición completa: 9 puertos + `UnitOfWork` + bus + los 39 casos de uso. */
  readonly registry: DemoRegistry;
  /** Puertos (atajo de `registry.repos` para lecturas de apoyo, p. ej. `/me/schedule`). */
  readonly repos: Repositories;
  /** Unidad de trabajo del demo (passthrough con autosave por mutación). */
  readonly unitOfWork: UnitOfWork;
  /** Bus del demo (acumula lo publicado — tests/debug de flows T4b). */
  readonly events: DemoEventBus;
  /** Reloj del navegador a cada llamada (derivadas del reloj: `activeNow`). */
  readonly clock: () => Date;
  /**
   * Token de acceso → `Actor` del dominio para `useCase.execute`.
   *
   * Resuelve por `demo/auth.me()` con **rol fresco** de la fila del worker
   * (parity `ActorGuard`: el rol del token/seminado no se confía). Auth fallida
   * (token ilegible, worker inexistente o inactivo) → `ApiError` 401 con
   * `error: 'Unauthorized'` y el mensaje de `demo/auth.ts`.
   */
  readonly requireActor: (token: string) => Promise<Actor>;
}

/** Arma el contexto una única vez (la primera `getDemoContext`). */
function createDemoContext(): DemoContext {
  // La composición es `demoRegistry` (misma instancia que consumen
  // `ensureHistorySeeded` y los tests): un único grafo por pestaña.
  const registry = demoRegistry;
  return {
    registry,
    repos: registry.repos,
    unitOfWork: registry.unitOfWork,
    events: registry.events,
    clock,
    requireActor: async (token: string): Promise<Actor> => {
      try {
        return toDomainActor(demoActorFromWire(await me(token)));
      } catch (error: unknown) {
        // La ApiError de 401 (y cualquier otro fallo de auth) sale lista acá,
        // así el catch del módulo solo hace `toApiError` de ida y vuelta.
        throw toApiError(error);
      }
    },
  };
}

/** Contexto armado (lazy); siempre la MISMA instancia por pestaña. */
let context: DemoContext | null = null;

/**
 * `getDemoContext()` — acceso **sincrónico** al singleton del runtime demo:
 * construirlo no es I/O (la composición es stateless y ya está creada en
 * `demoRegistry`). Para las operaciones de módulo normales es suficiente.
 * Corridas de arranque (histórico) usan `ensureDemoContext()`.
 */
export function getDemoContext(): DemoContext {
  if (context === null) {
    context = createDemoContext();
  }
  return context;
}

/**
 * Corrida del histórico **en vuelo** (single-flight de `ensureDemoContext`):
 * las llamadas concurrentes en la ventana de arranque comparten esta promesa,
 * así que `ensureHistorySeeded` corre una sola vez aunque dos pantallas de la
 * UI pidan datos a la vez al abrir la pestaña. `null` = sin corrida en vuelo.
 */
let historyRun: Promise<void> | null = null;

/**
 * `ensureDemoContext()` — el singleton con la **garantía de arranque**: el
 * histórico de producción (`history.ts`) corre con use cases reales **una vez
 * por mundo** (sello `historySeeded` de `db.ts`) antes de resolver.
 *
 * - Sello vigente (`historySeeded === true`) → no-op inmediato (sin corridas).
 * - Sin sello (sembrado fresco o tras `resetDb`, que destruye el mundo) → una
 *   única corrida, compartida por single-flight entre llamadas concurrentes;
 *   terminada (bien o mal) se libera y la próxima llamada decide por el sello
 *   de nuevo (`ensureHistorySeeded` no fija el sello si falló → reintentos).
 */
export async function ensureDemoContext(): Promise<DemoContext> {
  const ctx = getDemoContext();
  if (loadDb().historySeeded === true) {
    return ctx;
  }

  historyRun ??= ensureHistorySeeded(ctx.registry).then(() => undefined);
  try {
    await historyRun;
  } finally {
    // Completada (el sello quedó fijado) o fallida (sin sello → reintentar):
    // la promesa en vuelo ya no sirve, la próxima llamada decide por el sello.
    historyRun = null;
  }
  return ctx;
}
