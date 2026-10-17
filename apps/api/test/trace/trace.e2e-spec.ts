import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createE2EApp, type E2EContext } from '../support/e2e-app.js';

/**
 * E2E de trazabilidad (Fase 6, docs/09) — el criterio de salida.
 *
 * Reconstruye la misma cadena de producción de la Fase 5 (arribo ×2 → start →
 * transform paso 1 → store → transform paso 2 → complete) y a partir de ella
 * ejerce los tres endpoints: genealogía hacia atrás, genealogía hacia adelante
 * (recall) y búsqueda de eventos con filtros. Cierra con RBAC (worker 403 en los
 * tres; auditor 200) y el 404 de un lote desconocido.
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
  inputs: { batchId?: string; materialId: string }[];
  outputs: { batchId?: string; materialId: string }[];
  observation?: string;
  timestamp: string;
}

interface TransformationBody {
  event: EventBody;
  outputBatches: BatchBody[];
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

// Instantes locales deterministas (mismo patrón que la Fase 5): la franja del
// worker los cubre (I3) y el orden cronológico de los eventos queda fijado.
const T1 = new Date(2026, 4, 13, 10, 0, 0);
const T2 = new Date(2026, 4, 13, 10, 30, 0);

/** Recolecta recursivamente los ids de lote del árbol hacia adelante. */
function collectForwardBatchIds(node: ForwardNodeBody): string[] {
  return [
    ...(node.batch ? [node.batch.id] : []),
    ...node.children.flatMap(collectForwardBatchIds),
  ];
}

/** Recolecta recursivamente los ids de evento del árbol hacia adelante. */
function collectForwardEventIds(node: ForwardNodeBody): string[] {
  return [
    ...(node.event ? [node.event.id] : []),
    ...node.children.flatMap(collectForwardEventIds),
  ];
}

const iso = (date: Date): string => encodeURIComponent(date.toISOString());

describe('Trace (e2e)', () => {
  let ctx: E2EContext;

  let storageLocationId: string;
  let productionLocationId: string;
  let flourId: string;
  let doughId: string;
  let breadId: string;
  let machineId: string;
  let step1Id: string;
  let step2Id: string;
  let workerId: string;

  let flourBatch1Id: string;
  let rootBatchId: string;
  let doughBatchId: string;
  let breadBatchId: string;
  let transform1EventId: string;
  let transform2EventId: string;

  beforeAll(async () => {
    ctx = await createE2EApp();
    const server = ctx.app.getHttpServer();
    const admin = ctx.auth('admin');

    const create = async (path: string, body: Record<string, unknown>): Promise<string> => {
      const response = await request(server)
        .post(path)
        .set('Authorization', admin)
        .send(body)
        .expect(201);
      return (response.body as { id: string }).id;
    };

    storageLocationId = await create('/locations', { name: 'Almacén', kind: 'storage' });
    productionLocationId = await create('/locations', { name: 'Planta', kind: 'production' });

    flourId = await create('/materials', {
      name: 'Harina',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
    });
    doughId = await create('/materials', {
      name: 'Masa',
      kind: 'product',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
    });
    breadId = await create('/materials', {
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
        outputProductId: breadId,
        outputQuantity: { amount: 1, unit: 'unit' },
        steps: [
          {
            position: 1,
            machineType: 'mixer',
            inputs: [{ materialId: flourId, quantity: { amount: 2, unit: 'kg' } }],
            outputProductId: doughId,
            outputQuantity: { amount: 2, unit: 'kg' },
          },
          {
            position: 2,
            machineType: 'mixer',
            inputs: [{ materialId: doughId, quantity: { amount: 2, unit: 'kg' } }],
            outputProductId: breadId,
            outputQuantity: { amount: 1, unit: 'unit' },
          },
        ],
      })
      .expect(201);
    const steps = (recipe.body as { steps: { id: string }[] }).steps;
    step1Id = steps[0].id;
    step2Id = steps[1].id;

    const me = await request(server)
      .get('/auth/me')
      .set('Authorization', ctx.auth('worker'))
      .expect(200);
    workerId = (me.body as { workerId: string }).workerId;

    await create('/assignments', {
      workerId,
      machineId,
      slot: { daysOfWeek: [T1.getDay()], start: '09:00', end: '11:00' },
    });

    // Dos arribos de harina; solo el primero se consume.
    const arrival = async (amount: number): Promise<string> => {
      const response = await request(server)
        .post('/supplies/arrivals')
        .set('Authorization', ctx.auth('worker'))
        .send({
          materialId: flourId,
          quantity: { amount, unit: 'kg' },
          locationId: storageLocationId,
        })
        .expect(201);
      return (response.body as BatchBody).id;
    };
    flourBatch1Id = await arrival(2);
    await arrival(3);

    const start = await request(server)
      .post('/production/start')
      .set('Authorization', admin)
      .send({ recipeId: (recipe.body as { id: string }).id })
      .expect(201);
    rootBatchId = (start.body as BatchBody).id;

    // Paso 1 (con observación): harina → masa.
    const transform1 = await request(server)
      .post('/production/transform')
      .set('Authorization', ctx.auth('worker'))
      .send({
        machineId,
        recipeStepId: step1Id,
        inputs: [{ batchId: flourBatch1Id, quantity: { amount: 2, unit: 'kg' } }],
        outputs: [{ materialId: doughId, quantity: { amount: 2, unit: 'kg' } }],
        observation: '  mezclado  ',
        timestamp: T1.toISOString(),
      })
      .expect(201);
    const t1 = transform1.body as TransformationBody;
    transform1EventId = t1.event.id;
    doughBatchId = t1.outputBatches[0].id;

    await request(server)
      .post('/production/store')
      .set('Authorization', ctx.auth('worker'))
      .send({ batchId: doughBatchId, locationId: storageLocationId })
      .expect(200);

    // Paso 2 (con merma): masa → pan.
    const transform2 = await request(server)
      .post('/production/transform')
      .set('Authorization', ctx.auth('worker'))
      .send({
        machineId,
        recipeStepId: step2Id,
        inputs: [{ batchId: doughBatchId, quantity: { amount: 2, unit: 'kg' } }],
        outputs: [{ materialId: breadId, quantity: { amount: 1, unit: 'unit' } }],
        timestamp: T2.toISOString(),
      })
      .expect(201);
    const t2 = transform2.body as TransformationBody;
    transform2EventId = t2.event.id;
    breadBatchId = t2.outputBatches[0].id;

    await request(server)
      .post('/production/complete')
      .set('Authorization', ctx.auth('worker'))
      .send({ batchId: rootBatchId })
      .expect(200);
  });

  afterAll(async () => {
    await ctx.close();
  });

  // --- Trazabilidad hacia atrás ---

  it('GET /trace/:batchId reconstruye la genealogía hasta el lote de suministro', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get(`/trace/${breadBatchId}`)
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);

    const root = response.body as TraceNodeBody;
    expect(root.batch.id).toBe(breadBatchId);
    expect(root.batch.materialId).toBe(breadId);
    // Nodo del pan: lo produjo la transformación 2 (sin observación).
    expect(root.event?.id).toBe(transform2EventId);

    // Nivel intermedio: la masa, producida por la transformación 1.
    expect(root.children).toHaveLength(1);
    const dough = root.children[0];
    expect(dough.batch.id).toBe(doughBatchId);
    expect(dough.batch.materialId).toBe(doughId);
    expect(dough.event).toMatchObject({
      id: transform1EventId,
      machineId,
      workerId,
      observation: 'mezclado',
      timestamp: T1.toISOString(),
    });

    // Hoja: el lote de harina, sin evento que lo origine.
    expect(dough.children).toHaveLength(1);
    const leaf = dough.children[0];
    expect(leaf.batch.id).toBe(flourBatch1Id);
    expect(leaf.batch.materialId).toBe(flourId);
    expect(leaf.batch.status).toBe('stored');
    expect(leaf.event).toBeUndefined();
    expect(leaf.children).toEqual([]);
    expect(root.cycleDetected).toBeUndefined();
  });

  // --- Trazabilidad hacia adelante (recall) ---

  it('GET /trace/:batchId/forward alcanza los eventos consumidores y los lotes descendientes', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get(`/trace/${flourBatch1Id}/forward`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);

    const root = response.body as ForwardNodeBody;
    // Raíz = nodo de lote (suministro).
    expect(root.batch?.id).toBe(flourBatch1Id);
    expect(root.event).toBeUndefined();

    // Consumido por la transformación 1, que produjo la masa.
    expect(root.children).toHaveLength(1);
    const consumer1 = root.children[0];
    expect(consumer1.event?.id).toBe(transform1EventId);
    expect(consumer1.event?.machineId).toBe(machineId);
    expect(consumer1.batch).toBeUndefined();
    expect(consumer1.children[0].batch?.id).toBe(doughBatchId);

    // La masa la consumió la transformación 2, que produjo el pan.
    const consumer2 = consumer1.children[0].children[0];
    expect(consumer2.event?.id).toBe(transform2EventId);
    expect(consumer2.children[0].batch?.id).toBe(breadBatchId);

    // El recall alcanza todos los lotes descendientes y los dos eventos.
    expect(collectForwardBatchIds(root)).toEqual(
      expect.arrayContaining([flourBatch1Id, doughBatchId, breadBatchId]),
    );
    expect(collectForwardEventIds(root)).toEqual([transform1EventId, transform2EventId]);
    // El lote raíz de arranque no desciende del suministro (no tiene origen).
    expect(collectForwardBatchIds(root)).not.toContain(rootBatchId);
  });

  // --- Búsqueda de eventos ---

  it('GET /batch-events sin filtros devuelve todos los eventos en orden cronológico', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/batch-events')
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);

    const events = response.body as EventBody[];
    expect(events.map((e) => e.id)).toEqual([transform1EventId, transform2EventId]);
    const timestamps = events.map((e) => new Date(e.timestamp).getTime());
    expect(timestamps[0]).toBeLessThan(timestamps[1]);
  });

  it('GET /batch-events?machineId= devuelve el subconjunto de eventos de esa máquina', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get(`/batch-events?machineId=${machineId}`)
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);
    expect((response.body as EventBody[]).map((e) => e.id)).toEqual([
      transform1EventId,
      transform2EventId,
    ]);
  });

  it('GET /batch-events?workerId= devuelve el subconjunto de eventos de ese worker', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get(`/batch-events?workerId=${workerId}`)
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);
    expect((response.body as EventBody[]).map((e) => e.id)).toEqual([
      transform1EventId,
      transform2EventId,
    ]);
  });

  it('GET /batch-events?materialId= incluye eventos donde el material es input O output', async () => {
    const server = ctx.app.getHttpServer();
    const auth = ctx.auth('auditor');

    // Harina: solo input de la transformación 1.
    const flour = await request(server)
      .get(`/batch-events?materialId=${flourId}`)
      .set('Authorization', auth)
      .expect(200);
    expect((flour.body as EventBody[]).map((e) => e.id)).toEqual([transform1EventId]);

    // Masa: output de la 1 e input de la 2 → ambos eventos.
    const dough = await request(server)
      .get(`/batch-events?materialId=${doughId}`)
      .set('Authorization', auth)
      .expect(200);
    expect((dough.body as EventBody[]).map((e) => e.id)).toEqual([
      transform1EventId,
      transform2EventId,
    ]);

    // Pan: solo output de la transformación 2.
    const bread = await request(server)
      .get(`/batch-events?materialId=${breadId}`)
      .set('Authorization', auth)
      .expect(200);
    expect((bread.body as EventBody[]).map((e) => e.id)).toEqual([transform2EventId]);
  });

  it('GET /batch-events?from=&to= filtra por rango inclusivo de fechas', async () => {
    const server = ctx.app.getHttpServer();
    const auth = ctx.auth('auditor');

    const onlyFirst = await request(server)
      .get(`/batch-events?from=${iso(T1)}&to=${iso(T1)}`)
      .set('Authorization', auth)
      .expect(200);
    expect((onlyFirst.body as EventBody[]).map((e) => e.id)).toEqual([transform1EventId]);

    const onlySecond = await request(server)
      .get(`/batch-events?from=${iso(T2)}&to=${iso(T2)}`)
      .set('Authorization', auth)
      .expect(200);
    expect((onlySecond.body as EventBody[]).map((e) => e.id)).toEqual([transform2EventId]);

    const both = await request(server)
      .get(`/batch-events?from=${iso(T1)}&to=${iso(T2)}`)
      .set('Authorization', auth)
      .expect(200);
    expect((both.body as EventBody[]).map((e) => e.id)).toEqual([
      transform1EventId,
      transform2EventId,
    ]);
  });

  // --- RBAC por rol (el dominio autoriza) ---

  it('un worker recibe 403 en los tres endpoints de trazabilidad', async () => {
    const server = ctx.app.getHttpServer();
    const worker = ctx.auth('worker');

    for (const path of [
      `/trace/${breadBatchId}`,
      `/trace/${breadBatchId}/forward`,
      '/batch-events',
    ]) {
      const response = await request(server).get(path).set('Authorization', worker).expect(403);
      expect(response.body).toMatchObject({ statusCode: 403, error: 'UnauthorizedRoleError' });
    }
  });

  it('un auditor puede leer los tres endpoints de trazabilidad → 200', async () => {
    const server = ctx.app.getHttpServer();
    const auditor = ctx.auth('auditor');

    await request(server).get(`/trace/${breadBatchId}`).set('Authorization', auditor).expect(200);
    await request(server)
      .get(`/trace/${breadBatchId}/forward`)
      .set('Authorization', auditor)
      .expect(200);
    await request(server).get('/batch-events').set('Authorization', auditor).expect(200);
  });

  it('un batchId desconocido → 404 en las dos rutas de trace', async () => {
    const server = ctx.app.getHttpServer();
    const admin = ctx.auth('admin');

    for (const path of ['/trace/no-existe', '/trace/no-existe/forward']) {
      const response = await request(server).get(path).set('Authorization', admin).expect(404);
      expect(response.body).toMatchObject({ statusCode: 404, error: 'NotFoundError' });
    }
  });
});
