import { beforeEach, describe, expect, it } from 'vitest';

import { DEMO_ACCESS_TOKEN_PREFIX, DEMO_REFRESH_TOKEN_PREFIX } from '@/lib/api/demo/auth';
import { loadDb, resetDb } from '@/lib/api/demo/db';
import { ensureDemoContext } from '@/lib/api/demo/module-kit';
import { DEMO_SEED_IDS } from '@/lib/api/demo/seed';
import { ApiError } from '@/lib/api/errors';
import { createProductionApi } from '@/lib/api/modules/productionApi';
import { createSuppliesApi } from '@/lib/api/modules/suppliesApi';
import { writeTokens } from '@/lib/session/session-store';

/**
 * Contrato de `productionApi` sobre el runtime DEMO (docs/11-plan-demo.md §T4b),
 * espejo del `ProductionController` (`apps/api/src/production/production.controller.ts`).
 * Los casos de uso son los reales del registro (`demo/registry.ts`), así que:
 *
 * - `start` es solo **admin** (worker/auditor → 403) y `transform` es solo
 *   **worker** (el admin recibe 403 como en la API: los administradores no
 *   operan máquinas).
 * - El `workerId` del comando sale **del actor autenticado** — el body del input
 *   no lo lleva (decisión de seguridad del `RecordTransformationSchema`).
 * - El `timestamp` no viaja: la API usa el reloj del servidor (MEDIA #3) y el
 *   demo sella con el reloj del navegador (el caso de uso aplica `new Date()`).
 * - `transform` responde `{ event, outputBatches }` y `outputBatches` se resuelve
 *   con la **lectura de apoyo** del controlador real
 *   (`batches.list({ originBatchEventId: event.id })`).
 *
 * Cada operación corre contra la base del demo con el **histórico ya sembrado**
 * (5 lotes / 2 eventos / 7 movimientos); el flujo nuevo suma sobre ese mundo.
 */

/**
 * Atrapa el fallo esperado y lo devuelve ya traducido a `ApiError` (el catch
 * del módulo hace `toApiError` al final del borde): la operación que resuelva
 * feliz rompe la espera de forma explícita.
 */
async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  const cause: unknown = await promise.catch((error: unknown) => error);
  if (cause instanceof ApiError) {
    return cause;
  }
  throw new Error('la operación debía fallar con ApiError');
}

function loginAs(userId: string): void {
  writeTokens({
    accessToken: `${DEMO_ACCESS_TOKEN_PREFIX}${userId}`,
    refreshToken: `${DEMO_REFRESH_TOKEN_PREFIX}${userId}`,
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
  resetDb();
});

describe('production: contrato de API (runtime demo)', () => {
  it('flujo completo: arrive → start (admin) → transform + store (worker) → complete', async () => {
    // Insumos frescos en el almacén (mismo camino que el histórico).
    loginAs(DEMO_SEED_IDS.admin);
    const supplies = createSuppliesApi();
    const harinaBatch = await supplies.arrive({
      materialId: DEMO_SEED_IDS.harina,
      quantity: { amount: 2, unit: 'kg' },
      locationId: DEMO_SEED_IDS.almacen,
    });
    const aguaBatch = await supplies.arrive({
      materialId: DEMO_SEED_IDS.agua,
      quantity: { amount: 1, unit: 'l' },
      locationId: DEMO_SEED_IDS.almacen,
    });

    const api = createProductionApi();
    const root = await api.start({ recipeId: DEMO_SEED_IDS.panArtesanal });
    expect(root).toMatchObject({
      materialId: DEMO_SEED_IDS.pan,
      quantity: { amount: 1, unit: 'unit' },
      recipeId: DEMO_SEED_IDS.panArtesanal,
      status: 'in_progress',
    });
    expect('originBatchEventId' in root).toBe(false);

    // La transformación es solo worker: cambia de actor a mitad del flujo.
    loginAs(DEMO_SEED_IDS.operario);
    const transformation = await api.transform({
      machineId: DEMO_SEED_IDS.mezcladora,
      recipeStepId: DEMO_SEED_IDS.paso1,
      inputs: [
        { batchId: harinaBatch.id, quantity: { amount: 2, unit: 'kg' } },
        { batchId: aguaBatch.id, quantity: { amount: 1, unit: 'l' } },
      ],
      outputs: [{ materialId: DEMO_SEED_IDS.masa, quantity: { amount: 2, unit: 'kg' } }],
      observation: 'Hornada de prueba',
    });

    const { event, outputBatches } = transformation;
    expect(event).toMatchObject({
      machineId: DEMO_SEED_IDS.mezcladora,
      workerId: DEMO_SEED_IDS.operario, // del actor, no del body (no lo lleva)
      locationId: DEMO_SEED_IDS.produccion, // el lugar de la máquina
      recipeStepId: DEMO_SEED_IDS.paso1,
      observation: 'Hornada de prueba',
    });
    expect(event.inputs).toEqual([
      {
        batchId: harinaBatch.id,
        materialId: DEMO_SEED_IDS.harina,
        quantity: { amount: 2, unit: 'kg' },
      },
      { batchId: aguaBatch.id, materialId: DEMO_SEED_IDS.agua, quantity: { amount: 1, unit: 'l' } },
    ]);
    // Los outputs del evento no llevan `batchId` (el lote referencia al evento).
    expect(event.outputs).toEqual([
      { materialId: DEMO_SEED_IDS.masa, quantity: { amount: 2, unit: 'kg' } },
    ]);
    expect('batchId' in event.outputs[0]).toBe(false);
    // Reloj del navegador (el demo no acepta timestamp del cliente): ISO válido.
    expect(Number.isNaN(new Date(event.timestamp).getTime())).toBe(false);

    // Lectura de apoyo con paridad del ProductionController: los lotes de output
    // se resuelven por `originBatchEventId`.
    expect(outputBatches).toHaveLength(1);
    expect(outputBatches[0]).toMatchObject({
      materialId: DEMO_SEED_IDS.masa,
      quantity: { amount: 2, unit: 'kg' },
      originBatchEventId: event.id,
      status: 'in_progress',
    });
    expect('recipeId' in outputBatches[0]).toBe(false);
    expect(loadDb().batches.filter((batch) => batch.originBatchEventId === event.id)).toEqual(
      outputBatches,
    );
    expect(loadDb().batchEvents).toHaveLength(3); // 2 del histórico + el nuevo

    // store (A/W): el output pasa al almacén con el movimiento `produced`.
    const stored = await api.store({
      batchId: outputBatches[0].id,
      locationId: DEMO_SEED_IDS.almacen,
    });
    expect(stored).toMatchObject({ id: outputBatches[0].id, status: 'stored' });
    const produced = loadDb().stockMovements.filter(
      (movement) => movement.reason === 'produced' && movement.batchEventId === event.id,
    );
    expect(produced).toHaveLength(1);
    expect(produced[0]).toMatchObject({
      locationId: DEMO_SEED_IDS.almacen,
      materialId: DEMO_SEED_IDS.masa,
      delta: { amount: 2, unit: 'kg' },
    });

    // complete (A/W): cierra la orden (lote raíz con receta).
    const completed = await api.complete({ batchId: root.id });
    expect(completed).toMatchObject({
      id: root.id,
      recipeId: DEMO_SEED_IDS.panArtesanal,
      status: 'completed',
    });
    expect(loadDb().batches.find((batch) => batch.id === root.id)?.status).toBe('completed');
  });

  it('transform es solo worker: el admin recibe 403 (los administradores no operan máquinas)', async () => {
    loginAs(DEMO_SEED_IDS.admin);

    const failure = await failureOf(
      createProductionApi().transform({
        machineId: DEMO_SEED_IDS.mezcladora,
        inputs: [],
        outputs: [],
      }),
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.statusCode).toBe(403);
    expect(failure.error).toBe('UnauthorizedRoleError');
    expect(failure.context).toStrictEqual({ role: 'admin', useCase: 'RecordTransformation' });
  });

  it('transform con inputs y outputs vacíos → 422 (InvalidTransformation, regla del dominio)', async () => {
    loginAs(DEMO_SEED_IDS.operario);

    const failure = await failureOf(
      createProductionApi().transform({
        machineId: DEMO_SEED_IDS.mezcladora,
        inputs: [],
        outputs: [],
      }),
    );

    expect(failure.statusCode).toBe(422);
    expect(failure.error).toBe('InvalidTransformationError');
  });

  it('transform normaliza el body como la API: omite recipeStepId vacío y observation en blanco; el workerId queda del actor', async () => {
    loginAs(DEMO_SEED_IDS.operario);
    // Priming: la primera operación del módulo corre el histórico de arranque
    // (parity de la primera carga de la pestaña); se espera antes de leer la base.
    await ensureDemoContext();
    // Consumo válido sin contexto de receta: el lote de masa del histórico ya
    // está almacenado y no tiene `recipeId`, así que el paso no se valida.
    const masaBatch = loadDb().batches.find((batch) => batch.materialId === DEMO_SEED_IDS.masa)!;

    const transformation = await createProductionApi().transform({
      machineId: DEMO_SEED_IDS.mezcladora,
      inputs: [{ batchId: masaBatch.id, quantity: { amount: 2, unit: 'kg' } }],
      outputs: [{ materialId: DEMO_SEED_IDS.masa, quantity: { amount: 2, unit: 'kg' } }],
      observation: '   ',
    });

    expect('recipeStepId' in transformation.event).toBe(false);
    expect('observation' in transformation.event).toBe(false);
    expect(transformation.event.workerId).toBe(DEMO_SEED_IDS.operario);
    expect(transformation.outputBatches[0]).toMatchObject({
      materialId: DEMO_SEED_IDS.masa,
      originBatchEventId: transformation.event.id,
      status: 'in_progress',
    });
  });

  it('start es solo admin: el worker recibe 403; recipeId desconocido → 404', async () => {
    loginAs(DEMO_SEED_IDS.operario);
    const workerFailure = await failureOf(
      createProductionApi().start({ recipeId: DEMO_SEED_IDS.panArtesanal }),
    );
    expect(workerFailure.statusCode).toBe(403);
    expect(workerFailure.error).toBe('UnauthorizedRoleError');
    expect(workerFailure.context).toStrictEqual({ role: 'worker', useCase: 'StartProduction' });

    loginAs(DEMO_SEED_IDS.admin);
    const notFound = await failureOf(createProductionApi().start({ recipeId: 'rec-faltante' }));
    expect(notFound.statusCode).toBe(404);
    expect(notFound.error).toBe('NotFoundError');
    expect(notFound.context).toStrictEqual({ entity: 'Recipe', id: 'rec-faltante' });
  });

  it('transform mapea 404 para lotes de input desconocidos (read path del dominio)', async () => {
    loginAs(DEMO_SEED_IDS.operario);

    const failure = await failureOf(
      createProductionApi().transform({
        machineId: DEMO_SEED_IDS.mezcladora,
        inputs: [{ batchId: 'b-faltante', quantity: { amount: 1, unit: 'kg' } }],
        outputs: [{ materialId: DEMO_SEED_IDS.masa, quantity: { amount: 1, unit: 'kg' } }],
      }),
    );

    expect(failure.statusCode).toBe(404);
    expect(failure.error).toBe('NotFoundError');
    expect(failure.context).toStrictEqual({ entity: 'Batch', id: 'b-faltante' });
  });

  it('store re-almacena un lote ya `stored` → 409 (InvalidStateTransition)', async () => {
    loginAs(DEMO_SEED_IDS.operario);
    // Priming de histórico antes de leer lotes sembrados (ver el test de arriba).
    await ensureDemoContext();
    // El lote de masa del histórico ya está `stored` en el almacén.
    const masaBatch = loadDb().batches.find((batch) => batch.materialId === DEMO_SEED_IDS.masa)!;

    const failure = await failureOf(
      createProductionApi().store({ batchId: masaBatch.id, locationId: DEMO_SEED_IDS.almacen }),
    );

    expect(failure.statusCode).toBe(409);
    expect(failure.error).toBe('InvalidStateTransitionError');
    expect(failure.context).toMatchObject({ entity: 'Batch' });
  });

  it('complete exige una orden de producción (lote con receta): un suministro → 422', async () => {
    loginAs(DEMO_SEED_IDS.operario);
    // Priming de histórico antes de leer lotes sembrados (ver el test de arriba).
    await ensureDemoContext();
    // El arribo de harina del histórico es `stored` pero sin `recipeId`.
    const arrival = loadDb().batches.find((batch) => batch.materialId === DEMO_SEED_IDS.harina)!;

    const failure = await failureOf(createProductionApi().complete({ batchId: arrival.id }));

    expect(failure.statusCode).toBe(422);
    expect(failure.error).toBe('NotAProductionOrderError');
  });

  it('store a un lugar de producción → 422 (InvalidLocationKind); batch desconocido → 404', async () => {
    loginAs(DEMO_SEED_IDS.operario);
    const api = createProductionApi();
    // Priming de histórico antes de leer lotes sembrados (ver el test de arriba).
    await ensureDemoContext();
    // Un lote `in_progress` fresco: el chequeo de lugar del caso de uso corre
    // después del de estado, así que necesita un lote aún no almacenado.
    const masaBatch = loadDb().batches.find((batch) => batch.materialId === DEMO_SEED_IDS.masa)!;
    const { outputBatches } = await api.transform({
      machineId: DEMO_SEED_IDS.mezcladora,
      inputs: [{ batchId: masaBatch.id, quantity: { amount: 2, unit: 'kg' } }],
      outputs: [{ materialId: DEMO_SEED_IDS.masa, quantity: { amount: 2, unit: 'kg' } }],
    });

    const invalidKind = await failureOf(
      api.store({ batchId: outputBatches[0].id, locationId: DEMO_SEED_IDS.produccion }),
    );
    expect(invalidKind.statusCode).toBe(422);
    expect(invalidKind.error).toBe('InvalidLocationKindError');

    const notFound = await failureOf(
      api.store({ batchId: 'b-faltante', locationId: DEMO_SEED_IDS.almacen }),
    );
    expect(notFound.statusCode).toBe(404);
    expect(notFound.error).toBe('NotFoundError');
    expect(notFound.context).toStrictEqual({ entity: 'Batch', id: 'b-faltante' });
  });

  it('sin sesión activa la operación falla con 401', async () => {
    const failure = await failureOf(
      createProductionApi().start({ recipeId: DEMO_SEED_IDS.panArtesanal }),
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.statusCode).toBe(401);
    expect(failure.error).toBe('Unauthorized');
  });
});
