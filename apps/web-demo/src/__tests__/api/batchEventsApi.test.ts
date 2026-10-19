import { beforeEach, describe, expect, it } from 'vitest';

import { DEMO_ACCESS_TOKEN_PREFIX, DEMO_REFRESH_TOKEN_PREFIX } from '@/lib/api/demo/auth';
import { resetDb } from '@/lib/api/demo/db';
import { DEMO_SEED_IDS } from '@/lib/api/demo/seed';
import { ApiError } from '@/lib/api/errors';
import { createBatchEventsApi } from '@/lib/api/modules/batchEventsApi';
import { writeTokens } from '@/lib/session/session-store';

/**
 * Contrato de `batchEventsApi.list` sobre el runtime DEMO
 * (docs/demo.md §T4b), espejo del `BatchEventsController`
 * (`apps/api/src/batch-events/batch-events.controller.ts`): la búsqueda ejecuta
 * `ListBatchEvents` (A/Au; un worker recibe 403 como en la API) con los filtros
 * opcionales máquina/operario/material —material presente en inputs **o**
 * outputs— y el rango inclusivo `from`/`to` (que se arma solo si hay algún
 * extremo, como en el controlador). La respuesta llega cronológica ascendente
 * (regla del caso de uso) en el wire exacto de la API: `timestamp` ISO y los
 * `batchId` de outputs **omitidos** —los lotes referencian al evento, no al
 * revés. Las afirmaciones corren contra el **histórico ya sembrado**
 * (2 eventos: paso 1 harina+agua→masa y paso 2 masa→pan).
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

describe('batch-events: contrato de API (runtime demo)', () => {
  it('list devuelve los del histórico en orden ascendente con el wire exacto', async () => {
    loginAs(DEMO_SEED_IDS.auditor);

    const events = await createBatchEventsApi().list();

    expect(events).toHaveLength(2);
    // Ascendente por `timestamp` (estable ante empates).
    const times = events.map((event) => new Date(event.timestamp).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));

    // Paso 1: consume los lotes de suministro (inputs con batchId), produce masa.
    const [paso1, paso2] = events;
    expect(paso1).toMatchObject({
      machineId: DEMO_SEED_IDS.mezcladora,
      workerId: DEMO_SEED_IDS.operario,
      locationId: DEMO_SEED_IDS.produccion,
      recipeStepId: DEMO_SEED_IDS.paso1,
      observation: 'Historial de demo',
    });
    expect(paso1.inputs).toEqual([
      {
        batchId: expect.any(String),
        materialId: DEMO_SEED_IDS.harina,
        quantity: { amount: 2, unit: 'kg' },
      },
      {
        batchId: expect.any(String),
        materialId: DEMO_SEED_IDS.agua,
        quantity: { amount: 1, unit: 'l' },
      },
    ]);
    expect(paso1.outputs).toEqual([
      { materialId: DEMO_SEED_IDS.masa, quantity: { amount: 2, unit: 'kg' } },
    ]);
    expect(Number.isNaN(new Date(paso1.timestamp).getTime())).toBe(false);

    // Paso 2: consume la masa, produce pan. Outputs sin `batchId` (omitido).
    expect(paso2).toMatchObject({
      machineId: DEMO_SEED_IDS.mezcladora,
      locationId: DEMO_SEED_IDS.produccion,
      recipeStepId: DEMO_SEED_IDS.paso2,
    });
    expect(paso2.inputs.map((input) => input.materialId)).toEqual([DEMO_SEED_IDS.masa]);
    expect(paso2.outputs).toEqual([
      { materialId: DEMO_SEED_IDS.pan, quantity: { amount: 1, unit: 'unit' } },
    ]);
    expect('batchId' in paso2.outputs[0]).toBe(false);
    expect(paso2.observation).toBe('Historial de demo');
  });

  it('aplica los filtros de máquina, operario y material (en inputs u outputs)', async () => {
    loginAs(DEMO_SEED_IDS.auditor);
    const api = createBatchEventsApi();

    expect(await api.list({ machineId: DEMO_SEED_IDS.mezcladora })).toHaveLength(2);
    expect(await api.list({ machineId: 'maq-faltante' })).toHaveLength(0);
    expect(await api.list({ workerId: DEMO_SEED_IDS.operario })).toHaveLength(2);
    expect(await api.list({ workerId: DEMO_SEED_IDS.admin })).toHaveLength(0);

    // El material filtra por inputs **u** outputs: la masa participa en ambos
    // eventos (output del paso 1, input del paso 2); la harina solo en el paso 1.
    const masaEvents = await api.list({ materialId: DEMO_SEED_IDS.masa });
    expect(masaEvents.map((event) => event.recipeStepId).sort()).toEqual([
      DEMO_SEED_IDS.paso1,
      DEMO_SEED_IDS.paso2,
    ]);
    expect(
      (await api.list({ materialId: DEMO_SEED_IDS.harina })).map((e) => e.recipeStepId),
    ).toEqual([DEMO_SEED_IDS.paso1]);
    expect(await api.list({ materialId: DEMO_SEED_IDS.pan })).toHaveLength(1);
  });

  it('aplica el rango temporal inclusivo from/to, combinado o por un solo extremo', async () => {
    loginAs(DEMO_SEED_IDS.auditor);
    const api = createBatchEventsApi();

    // El histórico se sella con el reloj del navegador en la primera operación.
    const now = Date.now();

    expect(
      await api.list({
        from: new Date(now - 60_000).toISOString(),
        to: new Date(now + 60_000).toISOString(),
      }),
    ).toHaveLength(2);
    // Solo un extremo también arma el rango (parity del controlador).
    expect(await api.list({ to: new Date(now + 60_000).toISOString() })).toHaveLength(2);
    // Fuera de ventana (los extremos son inclusivos).
    expect(await api.list({ from: new Date(now + 60_000).toISOString() })).toHaveLength(0);
    expect(await api.list({ to: new Date(now - 60_000).toISOString() })).toHaveLength(0);
  });

  it('RBAC: la búsqueda es A/Au — un worker recibe 403', async () => {
    loginAs(DEMO_SEED_IDS.operario);

    const failure = await failureOf(createBatchEventsApi().list());

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.statusCode).toBe(403);
    expect(failure.error).toBe('UnauthorizedRoleError');
    expect(failure.context).toStrictEqual({ role: 'worker', useCase: 'ListBatchEvents' });
  });

  it('sin sesión activa la operación falla con 401', async () => {
    const failure = await failureOf(createBatchEventsApi().list());

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.statusCode).toBe(401);
    expect(failure.error).toBe('Unauthorized');
  });
});
