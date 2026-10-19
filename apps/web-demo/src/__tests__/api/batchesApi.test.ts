import { beforeEach, describe, expect, it } from 'vitest';

import { DEMO_ACCESS_TOKEN_PREFIX, DEMO_REFRESH_TOKEN_PREFIX } from '@/lib/api/demo/auth';
import { loadDb, resetDb } from '@/lib/api/demo/db';
import { DEMO_SEED_IDS } from '@/lib/api/demo/seed';
import { ApiError } from '@/lib/api/errors';
import { createBatchesApi } from '@/lib/api/modules/batchesApi';
import { writeTokens } from '@/lib/session/session-store';

/**
 * Contrato de `batchesApi` sobre el runtime DEMO (docs/demo.md §T4b),
 * espejo del `BatchesController` (`apps/api/src/batches/batches.controller.ts`):
 * listar y leer lotes es **A/Au/W** (el operario la consume en `/produccion`),
 * lecturas puras vía `ListBatches`/`GetBatch` del registro demo (`demo/registry.ts`).
 *
 * El wire replica `serializeBatch` del API: campos opcionales omitidos (los
 * lotes de suministro no llevan `recipeId`/`originBatchEventId`, solo la raíz
 * de la orden lleva `recipeId` y los outputs de transformación llevan
 * `originBatchEventId`). Las afirmaciones corren contra el **histórico ya
 * sembrado** por `ensureDemoContext`: 5 lotes (2 arribos + raíz + masa + pan).
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

describe('batches: contrato de API (runtime demo)', () => {
  it('list devuelve el histórico sembrado con la forma exacta del wire', async () => {
    loginAs(DEMO_SEED_IDS.admin);

    const batches = await createBatchesApi().list();

    expect(batches).toHaveLength(5);
    const stored = batches.filter((batch) => batch.status === 'stored');
    const completed = batches.filter((batch) => batch.status === 'completed');
    expect(stored).toHaveLength(4); // 2 arribos + masa + pan
    expect(completed).toHaveLength(1); // la orden cerrada
    for (const batch of batches) {
      expect(batch.quantity).toMatchObject({
        amount: expect.any(Number),
        unit: expect.any(String),
      });
    }

    // Raíz de la orden: única con `recipeId`; sin `originBatchEventId`.
    const [root] = completed;
    expect(root.materialId).toBe(DEMO_SEED_IDS.pan);
    expect(root.quantity).toEqual({ amount: 1, unit: 'unit' });
    expect(root.recipeId).toBe(DEMO_SEED_IDS.panArtesanal);
    expect('originBatchEventId' in root).toBe(false);

    // Arribos de suministro: sin receta ni origen (campos omitidos).
    const arrivals = batches.filter(
      (batch) =>
        batch.materialId === DEMO_SEED_IDS.harina || batch.materialId === DEMO_SEED_IDS.agua,
    );
    expect(arrivals).toHaveLength(2);
    for (const batch of arrivals) {
      expect(batch.status).toBe('stored');
      expect('recipeId' in batch).toBe(false);
      expect('originBatchEventId' in batch).toBe(false);
    }

    // Lotes de output de transformación: `originBatchEventId` presente, sin receta.
    const outputs = batches.filter((batch) => batch.originBatchEventId !== undefined);
    expect(outputs).toHaveLength(2); // masa (paso 1) + pan (paso 2)
    for (const batch of outputs) {
      expect('recipeId' in batch).toBe(false);
      expect(typeof batch.originBatchEventId).toBe('string'); // id autogenerado (UUID)
      expect(batch.originBatchEventId).not.toBe('');
    }
  });

  it('list aplica los cuatro filtros de BatchFilter', async () => {
    loginAs(DEMO_SEED_IDS.admin);
    const api = createBatchesApi();

    expect(await api.list({ status: 'in_progress' })).toHaveLength(0);
    expect((await api.list({ status: 'stored' })).map((batch) => batch.materialId).sort()).toEqual([
      DEMO_SEED_IDS.agua,
      DEMO_SEED_IDS.harina,
      DEMO_SEED_IDS.masa,
      DEMO_SEED_IDS.pan,
    ]);
    expect(await api.list({ materialId: DEMO_SEED_IDS.masa })).toEqual([
      expect.objectContaining({ status: 'stored', originBatchEventId: expect.any(String) }),
    ]);
    // Solo la raíz de la orden lleva el `recipeId`.
    expect((await api.list({ recipeId: DEMO_SEED_IDS.panArtesanal })).map((b) => b.status)).toEqual(
      ['completed'],
    );

    // `originBatchEventId`: los outputs del paso 1 (masa) y del paso 2 (pan).
    const paso2Event = loadDb().batchEvents.find(
      (event) => event.inputs[0].materialId === DEMO_SEED_IDS.masa,
    )!;
    expect(await api.list({ originBatchEventId: paso2Event.id })).toEqual([
      expect.objectContaining({ materialId: DEMO_SEED_IDS.pan }),
    ]);
  });

  it('get devuelve un lote por id (A/Au/W: el operario también puede) y 404 para desconocidos', async () => {
    loginAs(DEMO_SEED_IDS.operario);
    const [root] = (await createBatchesApi().list()).filter(
      (batch) => batch.status === 'completed',
    );

    const batch = await createBatchesApi().get(root.id);
    expect(batch).toMatchObject({
      id: root.id,
      recipeId: DEMO_SEED_IDS.panArtesanal,
      status: 'completed',
    });

    const failure = await failureOf(createBatchesApi().get('b-faltante'));
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.statusCode).toBe(404);
    expect(failure.error).toBe('NotFoundError');
    expect(failure.context).toStrictEqual({ entity: 'Batch', id: 'b-faltante' });
  });

  it('sin sesión activa la operación falla con 401', async () => {
    const failure = await failureOf(createBatchesApi().list());

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.statusCode).toBe(401);
    expect(failure.error).toBe('Unauthorized');
  });
});
