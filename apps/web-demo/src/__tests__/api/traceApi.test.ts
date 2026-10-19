import { beforeEach, describe, expect, it } from 'vitest';

import { DEMO_ACCESS_TOKEN_PREFIX, DEMO_REFRESH_TOKEN_PREFIX } from '@/lib/api/demo/auth';
import { type DemoData, loadDb, resetDb, saveDb } from '@/lib/api/demo/db';
import { ensureDemoContext } from '@/lib/api/demo/module-kit';
import { DEMO_SEED_IDS } from '@/lib/api/demo/seed';
import { ApiError } from '@/lib/api/errors';
import { createTraceApi } from '@/lib/api/modules/traceApi';
import { writeTokens } from '@/lib/session/session-store';

/**
 * Contrato de `traceApi` sobre el runtime DEMO (docs/demo.md §T4b),
 * espejo del `TraceController` (`apps/api/src/trace/trace.controller.ts`):
 * `TraceBatch`/`TraceForward` son A/Au (un worker recibe 403) y un id
 * desconocido lanza `NotFoundError` → 404. Los árboles se serializan como en
 * `apps/api/src/trace/trace.dto.ts`:
 *
 * - hacia atrás: `batch` siempre presente; `event` omitido en las hojas
 *   (suministros y raíces sin origen).
 * - hacia adelante (recall): nodo de lote XOR nodo de evento — los eventos
 *   cuelgan del lote que consumen y sus hijos son los lotes producidos.
 * - `cycleDetected` se emite **solo** en la rama cortada por datos corruptos.
 *
 * Las afirmaciones corren contra el **histórico ya sembrado** (arribos → paso 1
 * → paso 2 → cierre): harina/agua → masa → pan.
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

/** Mundo corrupto a mano: dos lotes que se consumen mutuamente (ciclo de datos). */
function seedCorruptedCycle(data: DemoData): DemoData {
  const timestamp = new Date('2026-01-02T10:00:00.000Z').toISOString();
  return {
    ...data,
    batches: [
      ...data.batches,
      {
        id: 'b-ciclo-a',
        materialId: DEMO_SEED_IDS.harina,
        quantity: { amount: 1, unit: 'kg' },
        originBatchEventId: 'ev-ciclo-1',
        status: 'in_progress',
      },
      {
        id: 'b-ciclo-b',
        materialId: DEMO_SEED_IDS.agua,
        quantity: { amount: 1, unit: 'l' },
        originBatchEventId: 'ev-ciclo-2',
        status: 'in_progress',
      },
    ],
    batchEvents: [
      ...data.batchEvents,
      {
        id: 'ev-ciclo-1',
        machineId: DEMO_SEED_IDS.mezcladora,
        workerId: DEMO_SEED_IDS.operario,
        locationId: DEMO_SEED_IDS.produccion,
        inputs: [
          {
            batchId: 'b-ciclo-b',
            materialId: DEMO_SEED_IDS.agua,
            quantity: { amount: 1, unit: 'l' },
          },
        ],
        outputs: [{ materialId: DEMO_SEED_IDS.harina, quantity: { amount: 1, unit: 'kg' } }],
        timestamp,
      },
      {
        id: 'ev-ciclo-2',
        machineId: DEMO_SEED_IDS.mezcladora,
        workerId: DEMO_SEED_IDS.operario,
        locationId: DEMO_SEED_IDS.produccion,
        inputs: [
          {
            batchId: 'b-ciclo-a',
            materialId: DEMO_SEED_IDS.harina,
            quantity: { amount: 1, unit: 'kg' },
          },
        ],
        outputs: [{ materialId: DEMO_SEED_IDS.agua, quantity: { amount: 1, unit: 'l' } }],
        timestamp,
      },
    ],
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  resetDb();
});

describe('trace: contrato de API (runtime demo)', () => {
  it('backward reconstruye la genealogía del pan con las hojas sin `event`', async () => {
    loginAs(DEMO_SEED_IDS.auditor);
    // Priming: la primera operación del módulo corre el histórico de arranque;
    // se espera antes de leer la base (los árboles buscan lotes sembrados).
    await ensureDemoContext();
    const db = loadDb();
    const paso1Event = db.batchEvents.find(
      (event) => event.inputs[0].materialId === DEMO_SEED_IDS.harina,
    )!;
    const paso2Event = db.batchEvents.find(
      (event) => event.inputs[0].materialId === DEMO_SEED_IDS.masa,
    )!;
    const panBatch = db.batches.find(
      (batch) => batch.materialId === DEMO_SEED_IDS.pan && batch.status === 'stored',
    )!;

    const node = await createTraceApi().backward(panBatch.id);

    // Raíz: lote almacenado + el evento que lo produjo (paso 2).
    expect(node.batch).toMatchObject({
      id: panBatch.id,
      materialId: DEMO_SEED_IDS.pan,
      status: 'stored',
      originBatchEventId: paso2Event.id,
    });
    expect(node.event).toMatchObject({ id: paso2Event.id, recipeStepId: DEMO_SEED_IDS.paso2 });
    expect('cycleDetected' in node).toBe(false);

    // Un solo niño: el lote intermedio de masa, producido por el paso 1.
    expect(node.children).toHaveLength(1);
    const masaNode = node.children[0];
    expect(masaNode.batch).toMatchObject({ materialId: DEMO_SEED_IDS.masa, status: 'stored' });
    expect(masaNode.event).toMatchObject({ id: paso1Event.id });

    // Hojas: los arribos de suministro — `event` y `cycleDetected` omitidos.
    expect(masaNode.children.map((child) => child.batch.materialId)).toEqual([
      DEMO_SEED_IDS.harina,
      DEMO_SEED_IDS.agua,
    ]);
    for (const leaf of masaNode.children) {
      expect('event' in leaf).toBe(false);
      expect('cycleDetected' in leaf).toBe(false);
      expect('recipeId' in leaf.batch).toBe(false);
    }
    expect('cycleDetected' in masaNode).toBe(false);
  });

  it('backward de una hoja de suministro no lleva `event` (suministro o raíz sin origen)', async () => {
    loginAs(DEMO_SEED_IDS.auditor);
    // Priming: la primera operación del módulo corre el histórico de arranque;
    // se espera antes de leer la base (los árboles buscan lotes sembrados).
    await ensureDemoContext();
    const db = loadDb();
    const harinaBatch = db.batches.find((batch) => batch.materialId === DEMO_SEED_IDS.harina)!;
    const [root] = db.batches.filter((batch) => batch.status === 'completed');

    const leaf = await createTraceApi().backward(harinaBatch.id);
    expect('event' in leaf).toBe(false);
    expect(leaf.children).toHaveLength(0);

    // La raíz de la orden tampoco tiene origen de transformación.
    const originless = await createTraceApi().backward(root.id);
    expect('event' in originless).toBe(false);
    expect(originless.children).toHaveLength(0);
  });

  it('forward (recall) alterna nodos de lote y evento: los eventos cuelgan del lote que consumen', async () => {
    loginAs(DEMO_SEED_IDS.auditor);
    // Priming: la primera operación del módulo corre el histórico de arranque;
    // se espera antes de leer la base (los árboles buscan lotes sembrados).
    await ensureDemoContext();
    const db = loadDb();
    const paso1Event = db.batchEvents.find(
      (event) => event.inputs[0].materialId === DEMO_SEED_IDS.harina,
    )!;
    const paso2Event = db.batchEvents.find(
      (event) => event.inputs[0].materialId === DEMO_SEED_IDS.masa,
    )!;
    const harinaBatch = db.batches.find((batch) => batch.materialId === DEMO_SEED_IDS.harina)!;

    const node = await createTraceApi().forward(harinaBatch.id);

    // Raíz: nodo de lote sin `event` ni `cycleDetected`.
    expect(node.batch).toMatchObject({ id: harinaBatch.id, materialId: DEMO_SEED_IDS.harina });
    expect('event' in node).toBe(false);
    expect('cycleDetected' in node).toBe(false);

    // Nodo de evento: lote XOR evento — el evento del paso 1 consume la harina.
    expect(node.children).toHaveLength(1);
    const paso1Node = node.children[0];
    expect(paso1Node.event).toMatchObject({ id: paso1Event.id });
    expect('batch' in paso1Node).toBe(false);

    // Los hijos del evento son los lotes que produjo: el lote de masa...
    expect(paso1Node.children.map((child) => child.batch?.materialId)).toEqual([
      DEMO_SEED_IDS.masa,
    ]);
    // ...que a su vez cuelga del evento del paso 2, con el pan como hoja final.
    const masaNode = paso1Node.children[0];
    expect('event' in masaNode).toBe(false);
    expect(masaNode.children).toHaveLength(1);
    const paso2Node = masaNode.children[0];
    expect(paso2Node.event).toMatchObject({ id: paso2Event.id });
    expect(paso2Node.children.map((child) => child.batch?.materialId)).toEqual([DEMO_SEED_IDS.pan]);
    expect(paso2Node.children[0].children).toHaveLength(0);
  });

  it('backward corta la rama en datos corruptos con `cycleDetected: true` (y solo ahí)', async () => {
    loginAs(DEMO_SEED_IDS.admin);
    saveDb(seedCorruptedCycle(loadDb()));

    const node = await createTraceApi().backward('b-ciclo-a');

    // a → ev1 → b → ev2 → a (repetido): la rama se corta en el nodo repetido.
    const bNode = node.children[0];
    expect(bNode.batch).toMatchObject({ id: 'b-ciclo-b', originBatchEventId: 'ev-ciclo-2' });
    expect('cycleDetected' in node).toBe(false);
    expect('cycleDetected' in bNode).toBe(false);

    const cycleNode = bNode.children[0];
    expect(cycleNode.batch).toMatchObject({ id: 'b-ciclo-a' });
    expect(cycleNode.cycleDetected).toBe(true);
    expect(cycleNode.children).toHaveLength(0);
  });

  it('forward corta la rama en datos corruptos con `cycleDetected: true` (y solo ahí)', async () => {
    loginAs(DEMO_SEED_IDS.admin);
    saveDb(seedCorruptedCycle(loadDb()));

    const node = await createTraceApi().forward('b-ciclo-a');

    // a → ev2 → b → ev1 → a (repetido el lote al que produce el evento).
    const eventNode = node.children[0];
    expect(eventNode.event).toMatchObject({ id: 'ev-ciclo-2' });
    expect('batch' in eventNode).toBe(false);
    expect('cycleDetected' in eventNode).toBe(false);

    const cycleNode = eventNode.children[0].children[0].children[0];
    expect(cycleNode.batch).toMatchObject({ id: 'b-ciclo-a' });
    expect(cycleNode.cycleDetected).toBe(true);
    expect(cycleNode.children).toHaveLength(0);
  });

  it('RBAC: los árboles son A/Au — un worker recibe 403 en ambas rutas', async () => {
    loginAs(DEMO_SEED_IDS.operario);
    const api = createTraceApi();

    const backwardFailure = await failureOf(api.backward('b-cualquiera'));
    expect(backwardFailure).toBeInstanceOf(ApiError);
    expect(backwardFailure.statusCode).toBe(403);
    expect(backwardFailure.error).toBe('UnauthorizedRoleError');
    expect(backwardFailure.context).toStrictEqual({ role: 'worker', useCase: 'TraceBatch' });

    const forwardFailure = await failureOf(api.forward('b-cualquiera'));
    expect(forwardFailure.statusCode).toBe(403);
    expect(forwardFailure.context).toStrictEqual({ role: 'worker', useCase: 'TraceForward' });
  });

  it('un batchId desconocido responde 404 en backward y forward', async () => {
    loginAs(DEMO_SEED_IDS.auditor);
    const api = createTraceApi();

    const backwardFailure = await failureOf(api.backward('b-faltante'));
    expect(backwardFailure.statusCode).toBe(404);
    expect(backwardFailure.error).toBe('NotFoundError');
    expect(backwardFailure.context).toStrictEqual({ entity: 'Batch', id: 'b-faltante' });

    const forwardFailure = await failureOf(api.forward('b-faltante'));
    expect(forwardFailure.statusCode).toBe(404);
    expect(forwardFailure.error).toBe('NotFoundError');
    expect(forwardFailure.context).toStrictEqual({ entity: 'Batch', id: 'b-faltante' });
  });

  it('sin sesión activa la operación falla con 401', async () => {
    const failure = await failureOf(createTraceApi().backward('b-cualquiera'));

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.statusCode).toBe(401);
    expect(failure.error).toBe('Unauthorized');
  });
});
