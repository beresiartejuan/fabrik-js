import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN, createE2EApp, type E2EContext } from '../support/e2e-app.js';

/**
 * E2E smoke del flujo completo de `docs/flujo-de-produccion.md` (Fase 7, docs/09).
 *
 * A diferencia de los e2e de Fase 5/6 (que preparan el estado por repositorio),
 * este smoke recorre el ciclo **solo por HTTP** (salvo el bootstrap de usuarios del
 * helper): login → alta de todo el catálogo por API → arribos ×2 → start →
 * transformación del paso 1 (con observación) → store del intermedio →
 * transformación del paso 2 (con merma) → complete.
 *
 * Después se pone el sombrero de **auditor** y reconstruye el recorrido con las
 * consultas de lectura: stock y movimientos por lugar, trazabilidad hacia atrás
 * (genealogía del producto final), hacia adelante (recall desde un suministro) y
 * el listado de eventos filtrado por máquina. Afirma que toda la cadena es
 * coherente: suministros → intermedio → producto final, con la máquina, el worker
 * y la observación correctos en cada paso.
 */

interface BatchBody {
  id: string;
  materialId: string;
  quantity: { amount: number; unit: string };
  recipeId?: string;
  originBatchEventId?: string;
  status: 'in_progress' | 'stored' | 'completed';
}

interface EventBody {
  id: string;
  machineId: string;
  workerId: string;
  locationId: string;
  recipeStepId?: string;
  inputs: { batchId?: string; materialId: string; quantity: { amount: number; unit: string } }[];
  outputs: { batchId?: string; materialId: string; quantity: { amount: number; unit: string } }[];
  observation?: string;
  timestamp: string;
}

interface TransformationBody {
  event: EventBody;
  outputBatches: BatchBody[];
}

interface MovementBody {
  id: string;
  materialId: string;
  delta: { amount: number; unit: string };
  reason: string;
  batchEventId?: string;
  timestamp: string;
}

interface TraceNodeBody {
  batch: BatchBody;
  event?: EventBody;
  children: TraceNodeBody[];
  cycleDetected?: boolean;
}

interface ForwardNodeBody {
  batch?: BatchBody;
  event?: EventBody;
  children: ForwardNodeBody[];
  cycleDetected?: boolean;
}

// Instantes locales deterministas dentro de la franja del operario (I3). El smoke
// inyecta `timestamp`, así que es reproducible a cualquier hora del día.
const T1 = new Date(2026, 4, 13, 10, 0, 0);
const T2 = new Date(2026, 4, 13, 10, 30, 0);

/** Recolecta recursivamente los ids de lote del árbol hacia adelante. */
function collectForwardBatchIds(node: ForwardNodeBody): string[] {
  return [...(node.batch ? [node.batch.id] : []), ...node.children.flatMap(collectForwardBatchIds)];
}

/** Recolecta recursivamente los ids de evento del árbol hacia adelante. */
function collectForwardEventIds(node: ForwardNodeBody): string[] {
  return [...(node.event ? [node.event.id] : []), ...node.children.flatMap(collectForwardEventIds)];
}

describe('Smoke — flujo completo de docs/03 (e2e)', () => {
  let ctx: E2EContext;

  // Catálogo y receta.
  let storageLocationId: string;
  let productionLocationId: string;
  let harinaId: string;
  let aguaId: string;
  let masaId: string;
  let panId: string;
  let machineId: string;
  let recipeId: string;
  let step1Id: string;
  let step2Id: string;
  let workerId: string;

  // Ejecución.
  let harinaBatchId: string;
  let aguaBatchId: string;
  let rootBatchId: string;
  let masaBatchId: string;
  let panBatchId: string;
  let transform1EventId: string;
  let transform2EventId: string;

  beforeAll(async () => {
    ctx = await createE2EApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('recorre login → catálogo → arribos ×2 → start → transform → store → transform (merma) → complete', async () => {
    const server = ctx.app.getHttpServer();

    // 1) Login real del admin (docs/03: el admin planifica).
    const adminTokens = await ctx.login(ADMIN.name, ADMIN.password);
    const admin = `Bearer ${adminTokens.accessToken}`;
    const worker = ctx.auth('worker');

    const create = async (path: string, body: Record<string, unknown>): Promise<string> => {
      const response = await request(server)
        .post(path)
        .set('Authorization', admin)
        .send(body)
        .expect(201);
      return (response.body as { id: string }).id;
    };

    // 2) Alta de todo el catálogo por API.
    storageLocationId = await create('/locations', { name: 'Almacén central', kind: 'storage' });
    productionLocationId = await create('/locations', {
      name: 'Planta de producción',
      kind: 'production',
    });

    harinaId = await create('/materials', {
      name: 'Harina',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
    });
    aguaId = await create('/materials', {
      name: 'Agua',
      kind: 'supply',
      physicalState: 'liquid',
      unitOfMeasure: 'l',
    });
    masaId = await create('/materials', {
      name: 'Masa',
      kind: 'product',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
    });
    panId = await create('/materials', {
      name: 'Pan',
      kind: 'product',
      physicalState: 'solid',
      unitOfMeasure: 'unit',
    });

    machineId = await create('/machines', {
      name: 'Mezcladora',
      type: 'mixer',
      locationId: productionLocationId,
    });

    const recipe = await request(server)
      .post('/recipes')
      .set('Authorization', admin)
      .send({
        name: 'Pan artesanal',
        outputProductId: panId,
        outputQuantity: { amount: 1, unit: 'unit' },
        steps: [
          {
            position: 1,
            machineType: 'mixer',
            inputs: [
              { materialId: harinaId, quantity: { amount: 2, unit: 'kg' } },
              { materialId: aguaId, quantity: { amount: 1, unit: 'l' } },
            ],
            outputProductId: masaId,
            outputQuantity: { amount: 2, unit: 'kg' },
          },
          {
            position: 2,
            machineType: 'mixer',
            inputs: [{ materialId: masaId, quantity: { amount: 2, unit: 'kg' } }],
            outputProductId: panId,
            outputQuantity: { amount: 1, unit: 'unit' },
          },
        ],
      })
      .expect(201);
    recipeId = (recipe.body as { id: string }).id;
    const steps = (recipe.body as { steps: { id: string }[] }).steps;
    step1Id = steps[0].id;
    step2Id = steps[1].id;

    // 3) Worker sembrado por el helper: lo asignamos por API a la máquina de lunes
    //    a domingo 06:00–18:00 (los timestamps del flujo caen dentro).
    const me = await request(server).get('/auth/me').set('Authorization', worker).expect(200);
    workerId = (me.body as { workerId: string }).workerId;
    await create('/assignments', {
      workerId,
      machineId,
      slot: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], start: '06:00', end: '18:00' },
    });

    // 4) Arribos ×2 (harina y agua) al almacén.
    const arrive = async (materialId: string, amount: number, unit: string): Promise<BatchBody> => {
      const response = await request(server)
        .post('/supplies/arrivals')
        .set('Authorization', worker)
        .send({ materialId, quantity: { amount, unit }, locationId: storageLocationId })
        .expect(201);
      return response.body as BatchBody;
    };
    const harinaArrival = await arrive(harinaId, 2, 'kg');
    const aguaArrival = await arrive(aguaId, 1, 'l');
    harinaBatchId = harinaArrival.id;
    aguaBatchId = aguaArrival.id;
    expect(harinaArrival).toMatchObject({ status: 'stored', quantity: { amount: 2, unit: 'kg' } });
    expect(aguaArrival).toMatchObject({ status: 'stored', quantity: { amount: 1, unit: 'l' } });

    // 5) El admin arranca la orden: lote raíz con la cantidad planificada.
    const start = await request(server)
      .post('/production/start')
      .set('Authorization', admin)
      .send({ recipeId })
      .expect(201);
    rootBatchId = (start.body as BatchBody).id;
    expect(start.body).toMatchObject({
      materialId: panId,
      quantity: { amount: 1, unit: 'unit' },
      recipeId,
      status: 'in_progress',
    });

    // 6) Paso 1 (con observación): harina + agua → masa.
    const transform1 = await request(server)
      .post('/production/transform')
      .set('Authorization', worker)
      .send({
        machineId,
        recipeStepId: step1Id,
        inputs: [
          { batchId: harinaBatchId, quantity: { amount: 2, unit: 'kg' } },
          { batchId: aguaBatchId, quantity: { amount: 1, unit: 'l' } },
        ],
        outputs: [{ materialId: masaId, quantity: { amount: 2, unit: 'kg' } }],
        observation: '  mezclado  ',
        timestamp: T1.toISOString(),
      })
      .expect(201);
    const t1 = transform1.body as TransformationBody;
    transform1EventId = t1.event.id;
    masaBatchId = t1.outputBatches[0].id;
    expect(t1.event).toMatchObject({
      machineId,
      workerId,
      locationId: productionLocationId,
      recipeStepId: step1Id,
      observation: 'mezclado',
      timestamp: T1.toISOString(),
    });
    expect(t1.outputBatches[0]).toMatchObject({
      materialId: masaId,
      quantity: { amount: 2, unit: 'kg' },
      originBatchEventId: transform1EventId,
      status: 'in_progress',
    });

    // 7) Almacenamiento intermedio: el lote de masa va al almacén.
    const stored = await request(server)
      .post('/production/store')
      .set('Authorization', worker)
      .send({ batchId: masaBatchId, locationId: storageLocationId })
      .expect(200);
    expect(stored.body).toMatchObject({ id: masaBatchId, status: 'stored' });

    // 8) Paso 2 (con merma): 2 kg de masa → 1 unit de pan (la cantidad real se
    //    registra y puede diferir del plan; aquí se registra la realidad).
    const transform2 = await request(server)
      .post('/production/transform')
      .set('Authorization', worker)
      .send({
        machineId,
        recipeStepId: step2Id,
        inputs: [{ batchId: masaBatchId, quantity: { amount: 2, unit: 'kg' } }],
        outputs: [{ materialId: panId, quantity: { amount: 1, unit: 'unit' } }],
        timestamp: T2.toISOString(),
      })
      .expect(201);
    const t2 = transform2.body as TransformationBody;
    transform2EventId = t2.event.id;
    panBatchId = t2.outputBatches[0].id;
    expect(t2.event.inputs).toEqual([
      { batchId: masaBatchId, materialId: masaId, quantity: { amount: 2, unit: 'kg' } },
    ]);
    expect(t2.outputBatches[0]).toMatchObject({
      materialId: panId,
      quantity: { amount: 1, unit: 'unit' },
      status: 'in_progress',
    });

    // 9) El worker cierra la orden (lote raíz → completed).
    const completed = await request(server)
      .post('/production/complete')
      .set('Authorization', worker)
      .send({ batchId: rootBatchId })
      .expect(200);
    expect(completed.body).toMatchObject({ id: rootBatchId, status: 'completed' });
  });

  it('el auditor reconstruye el recorrido con stock, movimientos, trazabilidad y eventos', async () => {
    const server = ctx.app.getHttpServer();
    const auditor = ctx.auth('auditor');

    // --- Stock por lugar (A/Au/W) ---
    const storageStock = await request(server)
      .get(`/stock/${storageLocationId}`)
      .set('Authorization', auditor)
      .expect(200);
    // El almacén conserva el ingreso de suministros y la masa almacenada.
    expect(storageStock.body).toEqual([
      { materialId: harinaId, amount: 2, unit: 'kg' },
      { materialId: aguaId, amount: 1, unit: 'l' },
      { materialId: masaId, amount: 2, unit: 'kg' },
    ]);

    const productionStock = await request(server)
      .get(`/stock/${productionLocationId}`)
      .set('Authorization', auditor)
      .expect(200);
    // En la planta quedan los consumos (deltas negativos) de cada paso.
    expect(productionStock.body).toEqual([
      { materialId: harinaId, amount: -2, unit: 'kg' },
      { materialId: aguaId, amount: -1, unit: 'l' },
      { materialId: masaId, amount: -2, unit: 'kg' },
    ]);

    // --- Movimientos por lugar, en orden cronológico ---
    const storageMovements = await request(server)
      .get(`/stock/${storageLocationId}/movements`)
      .set('Authorization', auditor)
      .expect(200);
    expect((storageMovements.body as MovementBody[]).map((m) => m.reason)).toEqual([
      'supply_in',
      'supply_in',
      'produced',
    ]);

    const productionMovements = await request(server)
      .get(`/stock/${productionLocationId}/movements`)
      .set('Authorization', auditor)
      .expect(200);
    expect(productionMovements.body).toMatchObject([
      {
        materialId: harinaId,
        delta: { amount: -2, unit: 'kg' },
        reason: 'consumed',
        timestamp: T1.toISOString(),
      },
      {
        materialId: aguaId,
        delta: { amount: -1, unit: 'l' },
        reason: 'consumed',
        timestamp: T1.toISOString(),
      },
      {
        materialId: masaId,
        delta: { amount: -2, unit: 'kg' },
        reason: 'consumed',
        timestamp: T2.toISOString(),
      },
    ]);

    // --- Trazabilidad hacia atrás desde el producto final (raíz del árbol) ---
    const back = await request(server)
      .get(`/trace/${panBatchId}`)
      .set('Authorization', auditor)
      .expect(200);
    const backRoot = back.body as TraceNodeBody;
    expect(backRoot.batch.id).toBe(panBatchId);
    expect(backRoot.batch.materialId).toBe(panId);
    expect(backRoot.event?.id).toBe(transform2EventId);

    // Nivel intermedio: la masa, producida por la transformación 1 (con observación).
    expect(backRoot.children).toHaveLength(1);
    const masaNode = backRoot.children[0];
    expect(masaNode.batch.id).toBe(masaBatchId);
    expect(masaNode.batch.materialId).toBe(masaId);
    expect(masaNode.event).toMatchObject({
      id: transform1EventId,
      machineId,
      workerId,
      observation: 'mezclado',
      timestamp: T1.toISOString(),
    });

    // Hojas: los dos suministros (harina y agua), sin evento que los origine.
    expect(masaNode.children).toHaveLength(2);
    const leaves = masaNode.children.map((node) => node.batch.id).sort();
    expect(leaves).toEqual([harinaBatchId, aguaBatchId].sort());
    for (const leaf of masaNode.children) {
      expect(leaf.event).toBeUndefined();
      expect(leaf.children).toEqual([]);
      expect(leaf.batch.status).toBe('stored');
    }
    expect(backRoot.cycleDetected).toBeUndefined();

    // El lote raíz de la *orden* (`StartProduction`) es distinto del producto
    // final: no tiene origen de producción, así que su árbol es un único nodo.
    const order = await request(server)
      .get(`/trace/${rootBatchId}`)
      .set('Authorization', auditor)
      .expect(200);
    const orderRoot = order.body as TraceNodeBody;
    expect(orderRoot.batch.id).toBe(rootBatchId);
    expect(orderRoot.batch.status).toBe('completed');
    expect(orderRoot.event).toBeUndefined();
    expect(orderRoot.children).toEqual([]);

    // --- Trazabilidad hacia adelante (recall) desde un suministro ---
    const forward = await request(server)
      .get(`/trace/${harinaBatchId}/forward`)
      .set('Authorization', auditor)
      .expect(200);
    const forwardRoot = forward.body as ForwardNodeBody;
    expect(forwardRoot.batch?.id).toBe(harinaBatchId);
    expect(collectForwardBatchIds(forwardRoot)).toEqual(
      expect.arrayContaining([harinaBatchId, masaBatchId, panBatchId]),
    );
    expect(collectForwardEventIds(forwardRoot)).toEqual([transform1EventId, transform2EventId]);
    // La orden de producción no desciende del suministro (no tiene origen).
    expect(collectForwardBatchIds(forwardRoot)).not.toContain(rootBatchId);

    // --- Listado de eventos filtrado por máquina (auditoría) ---
    const events = await request(server)
      .get(`/batch-events?machineId=${machineId}`)
      .set('Authorization', auditor)
      .expect(200);
    expect((events.body as EventBody[]).map((e) => e.id)).toEqual([
      transform1EventId,
      transform2EventId,
    ]);
    expect((events.body as EventBody[]).map((e) => e.observation)).toEqual(['mezclado', undefined]);
  });
});
