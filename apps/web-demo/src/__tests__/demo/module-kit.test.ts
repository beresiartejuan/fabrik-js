import {
  AssignmentId,
  DomainError,
  InsufficientStockError,
  InvalidQuantityError,
  InvalidStateTransitionError,
  MaterialId,
  MaterialKindMismatchError,
  NotFoundError,
  OverlappingScheduleError,
  Quantity,
  UnauthorizedRoleError,
  WorkerId,
} from '@fabrik/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ACCESS_TOKEN_PREFIX, DemoUnauthorizedError } from '@/lib/api/demo/auth';
import { loadDb, resetDb, saveDb } from '@/lib/api/demo/db';
import { ensureDemoContext, getDemoContext, toApiError } from '@/lib/api/demo/module-kit';
import { demoRegistry } from '@/lib/api/demo/registry';
import { DEMO_SEED_IDS } from '@/lib/api/demo/seed';
import { ApiError, errorToMessage } from '@/lib/api/errors';

/**
 * Kit de módulos demo: paridad de errores (§6 de docs/11) + contexto singleton.
 *
 * - **Paridad:** la `ApiError` del kit (camino demo, sin transporte) se compara
 *   contra la que el cliente HTTP real habría plegado — el body que el
 *   `DomainExceptionFilter` de `apps/api` emite para el error (tabla §6) se
 *   convierte **directamente** en la `ApiError` final (`statusCode`/`error`/
 *   `message`/`context`, `isNetworkError: false`). Ambas deben ser
 *   **indistinguibles** en forma y valores.
 * - **Contexto:** singleton del runtime (`getDemoContext` sync /
 *   `ensureDemoContext` async): identidad estable, una sola corrida del
 *   histórico por el sello `historySeeded` (concurrente y serial), resiembra
 *   tras `resetDb`, y la `ApiError` 401 de `requireActor` con rol fresco.
 */

/** Tabla de docs/09 que ejecuta `httpStatusForDomainError` del filter del API. */
const HTTP_STATUS_ROWS = [
  { status: 404, klass: NotFoundError },
  { status: 403, klass: UnauthorizedRoleError },
  { status: 409, klass: OverlappingScheduleError },
  { status: 409, klass: InsufficientStockError },
  { status: 409, klass: InvalidStateTransitionError },
  { status: 422, klass: MaterialKindMismatchError },
  { status: 422, klass: InvalidQuantityError },
] as const;

/**
 * La `ApiError` FINAL que el cliente HTTP construiría para este error: el body
 * EXACTO que el `DomainExceptionFilter` emite (`statusCode` de la tabla,
 * `error: error.name`, `message`, `context` = props propias) convertido
 * directamente a la `ApiError` del fold (`errors.ts`). Referencia contra la
 * que debe iguales a el camino demo.
 */
function apiErrorViaHttp(domain: DomainError): ApiError {
  const context: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(domain)) {
    if (key === 'name' || key === 'message' || key === 'stack') {
      continue;
    }
    context[key] = value;
  }
  const status = HTTP_STATUS_ROWS.find(({ klass }) => domain instanceof klass)?.status ?? 500;
  return new ApiError({
    statusCode: status,
    error: domain.name,
    message: domain.message,
    ...(Object.keys(context).length > 0 ? { context } : {}),
  });
}

/** La ApiError que el filter produce para un 401 de auth (`UnauthorizedException`). */
function unauthorizedViaHttp(message: string): ApiError {
  return new ApiError({ statusCode: 401, error: 'Unauthorized', message });
}

beforeEach(() => {
  window.sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// toApiError — paridad de errores
// ---------------------------------------------------------------------------

describe('toApiError — paridad con DomainExceptionFilter (body → ApiError)', () => {
  it('NotFoundError → 404 con context { entity, id }', () => {
    const domain = new NotFoundError('Material', 'mat-x');
    const kit = toApiError(domain);
    expect(kit).toStrictEqual(apiErrorViaHttp(domain));
    expect(kit.statusCode).toBe(404);
    expect(kit.error).toBe('NotFoundError');
    expect(kit.message).toBe('Material no encontrado: mat-x');
    expect(kit.context).toStrictEqual({ entity: 'Material', id: 'mat-x' });
    expect(kit.isNetworkError).toBe(false);
    expect(kit.hasStatus(404)).toBe(true);
  });

  it('UnauthorizedRoleError → 403 con context { role, useCase } (gates de rol)', () => {
    const domain = new UnauthorizedRoleError('worker', 'ListMaterials');
    const kit = toApiError(domain);
    expect(kit).toStrictEqual(apiErrorViaHttp(domain));
    expect(kit.statusCode).toBe(403);
    expect(kit.error).toBe('UnauthorizedRoleError');
    expect(kit.context).toStrictEqual({ role: 'worker', useCase: 'ListMaterials' });
  });

  it('OverlappingScheduleError → 409 con context de ids (I1)', () => {
    const domain = new OverlappingScheduleError(
      WorkerId.from('usr-operario'),
      AssignmentId.from('asg-operario-mezcladora-1'),
    );
    const kit = toApiError(domain);
    expect(kit).toStrictEqual(apiErrorViaHttp(domain));
    expect(kit.statusCode).toBe(409);
    expect(kit.error).toBe('OverlappingScheduleError');
    // Los branded ids son strings en runtime, iguales que en el body JSON.
    expect(kit.context).toStrictEqual({
      workerId: 'usr-operario',
      conflictingAssignmentId: 'asg-operario-mezcladora-1',
    });
  });

  it('InvalidStateTransitionError → 409 (conflicto con el estado del lote)', () => {
    const domain = new InvalidStateTransitionError('Batch', 'in_progress', 'stored');
    const kit = toApiError(domain);
    expect(kit).toStrictEqual(apiErrorViaHttp(domain));
    expect(kit.statusCode).toBe(409);
    expect(kit.context).toStrictEqual({ entity: 'Batch', from: 'in_progress', to: 'stored' });
  });

  it('InsufficientStockError → 409 (I5 diferida; mapea igual)', () => {
    const domain = new InsufficientStockError(
      MaterialId.from('mat-harina'),
      Quantity.create(2, 'kg'),
      Quantity.create(1, 'kg'),
    );
    const kit = toApiError(domain);
    expect(kit).toStrictEqual(apiErrorViaHttp(domain));
    expect(kit.statusCode).toBe(409);
    expect(kit.error).toBe('InsufficientStockError');
  });

  it('MaterialKindMismatchError → 422 con context (arribo de no-suministro)', () => {
    const domain = new MaterialKindMismatchError(MaterialId.from('mat-pan'), 'supply', 'product');
    const kit = toApiError(domain);
    expect(kit).toStrictEqual(apiErrorViaHttp(domain));
    expect(kit.statusCode).toBe(422);
    expect(kit.context).toStrictEqual({
      expected: 'supply',
      materialId: 'mat-pan',
      received: 'product',
    });
  });

  it('InvalidQuantityError → 422 SIN context (la clave se omite del body)', () => {
    const domain = new InvalidQuantityError('La cantidad 0 no es positiva');
    const kit = toApiError(domain);
    expect(kit).toStrictEqual(apiErrorViaHttp(domain));
    expect(kit.statusCode).toBe(422);
    expect(kit.context).toBeUndefined();
  });

  it('DemoUnauthorizedError → 401 { error: Unauthorized, mensaje propio } como el 401 de Nest', () => {
    const kit = toApiError(new DemoUnauthorizedError('El worker está inactivo'));
    expect(kit).toStrictEqual(unauthorizedViaHttp('El worker está inactivo'));
    expect(kit.statusCode).toBe(401);
    expect(kit.error).toBe('Unauthorized');
    expect(kit.context).toBeUndefined();
    expect(kit.hasStatus(401)).toBe(true);
  });

  it('DomainError sin fila de la tabla → 500 conservando nombre y mensaje (rama del filter)', () => {
    const domain = new DomainError('invariante sin fila de la tabla');
    const kit = toApiError(domain);
    expect(kit).toStrictEqual(apiErrorViaHttp(domain));
    expect(kit.statusCode).toBe(500);
    expect(kit.error).toBe('DomainError');
    expect(kit.message).toBe('invariante sin fila de la tabla');
  });

  it('Error técnico (no dominio) → 500 InternalServerError, sin filtrar detalles', () => {
    const kit = toApiError(new Error('boom de bug interno'));
    expect(kit.statusCode).toBe(500);
    expect(kit.error).toBe('InternalServerError');
    // El filter genérico del API oculta el detalle del servidor.
    expect(kit.message).toBe('Error interno del servidor');
    expect(kit.context).toBeUndefined();
    expect(kit.isNetworkError).toBe(false);
  });

  it('valores no-Error lanzados (string / null / undefined / number) → 500 InternalServerError', () => {
    for (const thrown of ['fuego', null, undefined, 42]) {
      const kit = toApiError(thrown);
      expect(kit.statusCode).toBe(500);
      expect(kit.error).toBe('InternalServerError');
      expect(kit.message).toBe('Error interno del servidor');
    }
  });

  it('ApiError de entrada pasa tal cual (idempotente, MISMA instancia)', () => {
    const input = new ApiError({
      statusCode: 409,
      error: 'NotFoundError',
      message: 'Material no encontrado: mat-x',
      context: { entity: 'Material', id: 'mat-x' },
    });
    expect(toApiError(input)).toBe(input);
  });

  it('la ApiError del kit alimenta errorToMessage sin cambios (mensajes español intactos)', () => {
    expect(errorToMessage(toApiError(new NotFoundError('Material', 'mat-x')))).toBe(
      'No se encontró el recurso.',
    );
    expect(errorToMessage(toApiError(new UnauthorizedRoleError('worker', 'ListMaterials')))).toBe(
      'No tenés permisos para esta acción.',
    );
    expect(
      errorToMessage(
        toApiError(
          new OverlappingScheduleError(WorkerId.from('usr-operario'), AssignmentId.from('asg-x')),
        ),
      ),
    ).toBe('El trabajador ya tiene una asignación en ese horario.');
    expect(
      errorToMessage(toApiError(new InvalidQuantityError('La cantidad 0 no es positiva'))),
    ).toBe('La cantidad 0 no es positiva');
    expect(errorToMessage(unauthorizedViaHttp('el mensaje que venga'))).toBe(
      'Tu sesión expiró. Volvé a iniciar sesión.',
    );
    expect(errorToMessage(toApiError(new Error('bug')))).toBe('Ocurrió un error inesperado.');
  });
});

// ---------------------------------------------------------------------------
// Contexto singleton + histórico de arranque
// ---------------------------------------------------------------------------

describe('demo module kit — contexto', () => {
  it('getDemoContext es un singleton: misma identidad y la composición de demoRegistry', () => {
    const ctx = getDemoContext();
    expect(getDemoContext()).toBe(ctx);
    expect(ctx.registry).toBe(demoRegistry);
    expect(ctx.repos).toBe(demoRegistry.repos);
    expect(ctx.unitOfWork).toBe(demoRegistry.unitOfWork);
    expect(ctx.events).toBe(demoRegistry.events);
    expect(ctx.clock()).toBeInstanceOf(Date);
  });

  it('ensureDemoContext resuelve el MISMO singleton (sin recrear contexto)', async () => {
    const ctx = getDemoContext();
    await expect(ensureDemoContext()).resolves.toBe(ctx);
  });

  it('la primera corrida CONCURRENTE siembra el histórico UNA sola vez', async () => {
    const ctx = getDemoContext();
    expect(loadDb().historySeeded).toBeUndefined(); // pestaña fresca: sin sello
    const baselineEvents = ctx.events.published.length;
    const baselineBatches = loadDb().batches.length;

    // Dos pantallas piden datos a la vez al abrir la pestaña: comparten la
    // promesa de arranque y `runProductionHistory` NO corre dos veces.
    const [a, b] = await Promise.all([ensureDemoContext(), ensureDemoContext()]);
    expect(a).toBe(ctx);
    expect(b).toBe(ctx);

    const data = loadDb();
    expect(data.historySeeded).toBe(true);
    // 2 arribos + lote raíz + masa + pan (UNA corrida, sin duplicar nada).
    expect(data.batches).toHaveLength(5);
    expect(data.batchEvents).toHaveLength(2);
    expect(data.stockMovements).toHaveLength(7);
    // Publicado solo por esa corrida: 2 supplyArrived + batchCreated +
    // 2 batchTransformed + 2 batchStored + productionCompleted.
    expect(ctx.events.published.length - baselineEvents).toBe(8);
    expect(loadDb().batches.length - baselineBatches).toBe(5);
  });

  it('llamadas SERIALES repetidas no vuelven a correr el histórico (sello no-op)', async () => {
    await ensureDemoContext();
    const ctx = getDemoContext();
    const eventsAfterFirst = ctx.events.published.length;
    const batchesAfterFirst = loadDb().batches;

    // Segunda llamada: el sello está → resuelve sin publicar ni escribir nada.
    await expect(ensureDemoContext()).resolves.toBe(ctx);
    expect(ctx.events.published.length).toBe(eventsAfterFirst);
    expect(loadDb().batches).toEqual(batchesAfterFirst);
    expect(loadDb().batchEvents).toHaveLength(2);
  });

  it('tras resetDb el sello se pierde y ensureDemoContext vuelve a sembrar un mundo nuevo', async () => {
    await ensureDemoContext();
    const primera = loadDb().batches;
    expect(primera).toHaveLength(5);

    resetDb();
    expect(loadDb().historySeeded).toBeUndefined(); // el sello murió con el mundo

    const ctx = getDemoContext();
    const baseline = ctx.events.published.length;
    await expect(ensureDemoContext()).resolves.toBe(ctx);
    const segunda = loadDb();
    expect(segunda.historySeeded).toBe(true);
    expect(segunda.batches).toHaveLength(5);
    // Mundo NUEVO: los ids los genera el dominio en esta corrida (sin solapes).
    expect(segunda.batches.map((batch) => batch.id).sort()).not.toEqual(
      primera.map((batch) => batch.id).sort(),
    );
    // La corrida nueva publicó sus 8 eventos propios (delta sobre el baseline).
    expect(ctx.events.published.length - baseline).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// requireActor — actor fresco por llamada + ApiError 401
// ---------------------------------------------------------------------------

describe('demo module kit — requireActor', () => {
  const tokenFor = (userId: string): string => `${DEMO_ACCESS_TOKEN_PREFIX}${userId}`;

  it('access token válido → Actor del dominio (workerId + rol de la fila)', async () => {
    const ctx = getDemoContext();
    const actor = await ctx.requireActor(tokenFor(DEMO_SEED_IDS.admin));
    expect(actor.workerId).toBe(DEMO_SEED_IDS.admin);
    expect(actor.role).toBe('admin');
  });

  it('rol FRESCO en cada llamada: el cambio por use case se ve en la próxima llamada', async () => {
    const ctx = getDemoContext();
    const admin = { workerId: WorkerId.from(DEMO_SEED_IDS.admin), role: 'admin' as const };

    // Camino REAL: el rol se cambia por el use case (parity `UpdateWorker`).
    await ctx.registry.useCases.workers.UpdateWorker.execute(admin, {
      id: WorkerId.from(DEMO_SEED_IDS.operario),
      role: 'admin',
    });

    // El token viejo del operario lleva solo el id; el rol se lee fresco.
    const actor = await ctx.requireActor(tokenFor(DEMO_SEED_IDS.operario));
    expect(actor.workerId).toBe(DEMO_SEED_IDS.operario);
    expect(actor.role).toBe('admin');
  });

  it('token ilegible → ApiError 401 { error: Unauthorized, mensaje de demo/auth }', async () => {
    const failure = await getDemoContext()
      .requireActor('no-es-un-token')
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(ApiError);
    if (!(failure instanceof ApiError)) {
      throw new Error('el fallo debía ser ApiError');
    }
    expect(failure).toStrictEqual(unauthorizedViaHttp('Token de acceso inválido'));
    expect(failure.statusCode).toBe(401);
    // El catch de los módulos hace toApiError de ida y vuelta: sin doble mapeo.
    expect(toApiError(failure)).toBe(failure);
  });

  it('sin token (sesión vacía) → ApiError 401', async () => {
    await expect(getDemoContext().requireActor('')).rejects.toStrictEqual(
      unauthorizedViaHttp('Token de acceso inválido'),
    );
  });

  it('worker inexistente o inactivo → ApiError 401 (parity ActorGuard)', async () => {
    const data = loadDb();
    saveDb({
      ...data,
      workers: data.workers.map((worker) =>
        worker.id === DEMO_SEED_IDS.operario ? { ...worker, active: false } : worker,
      ),
    });
    await expect(
      getDemoContext().requireActor(tokenFor(DEMO_SEED_IDS.operario)),
    ).rejects.toStrictEqual(unauthorizedViaHttp('Worker inexistente o inactivo'));
  });

  it('worker inexistente → ApiError 401 (token con id fuera del seed maestro)', async () => {
    expect(loadDb().users.length).toBeGreaterThan(0); // el seed maestro está
    await expect(getDemoContext().requireActor(tokenFor('usr-fantasma'))).rejects.toStrictEqual(
      unauthorizedViaHttp('Worker inexistente o inactivo'),
    );
  });
});
