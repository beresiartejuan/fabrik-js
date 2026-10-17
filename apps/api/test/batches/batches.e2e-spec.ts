import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createE2EApp, type E2EContext } from '../support/e2e-app.js';

/**
 * E2E del recurso `batches` (post-plan, hueco del plan de web).
 *
 * Reconstruye una cadena de producción de dos pasos (arribos ×2 → start →
 * transform → store → transform → complete) para dejar lotes en los tres estados
 * (`stored`, `in_progress`, `completed`) y con/sin `recipeId`, y luego ejerce:
 * listado completo, filtros `status`/`materialId`, `GET /batches/:id`, el `404` de
 * un lote desconocido y el RBAC (worker y auditor 200: la pantalla `/produccion`
 * la consume el operario; no existe endpoint de escritura).
 */

interface BatchBody {
  id: string;
  materialId: string;
  quantity: { amount: number; unit: string };
  recipeId?: string;
  originBatchEventId?: string;
  status: 'in_progress' | 'stored' | 'completed';
}

interface TransformationBody {
  event: { id: string };
  outputBatches: BatchBody[];
}

const sortedIds = (batches: BatchBody[]): string[] => batches.map((batch) => batch.id).sort();

// Instantes locales deterministas dentro de la franja del worker (I3).
const T1 = new Date(2026, 4, 13, 10, 0, 0);
const T2 = new Date(2026, 4, 13, 10, 30, 0);

describe('Batches (e2e)', () => {
  let ctx: E2EContext;

  let flourId: string;
  let doughId: string;
  let breadId: string;
  let recipeId: string;

  let flourBatch1Id: string;
  let flourBatch2Id: string;
  let rootBatchId: string;
  let doughBatchId: string;
  let breadBatchId: string;

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

    const storageLocationId = await create('/locations', { name: 'Almacén', kind: 'storage' });
    const productionLocationId = await create('/locations', { name: 'Planta', kind: 'production' });

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
      unitOfMeasure: 'kg',
    });

    const machineId = await create('/machines', {
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
        outputQuantity: { amount: 1, unit: 'kg' },
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
            outputQuantity: { amount: 1, unit: 'kg' },
          },
        ],
      })
      .expect(201);
    recipeId = (recipe.body as { id: string }).id;
    const step1Id = (recipe.body as { steps: { id: string }[] }).steps[0].id;

    const me = await request(server)
      .get('/auth/me')
      .set('Authorization', ctx.auth('worker'))
      .expect(200);
    const workerId = (me.body as { workerId: string }).workerId;
    await create('/assignments', {
      workerId,
      machineId,
      slot: { daysOfWeek: [T1.getDay()], start: '09:00', end: '11:00' },
    });

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
    flourBatch2Id = await arrival(3);

    const start = await request(server)
      .post('/production/start')
      .set('Authorization', admin)
      .send({ recipeId })
      .expect(201);
    rootBatchId = (start.body as BatchBody).id;

    const transform1 = await request(server)
      .post('/production/transform')
      .set('Authorization', ctx.auth('worker'))
      .send({
        machineId,
        recipeStepId: step1Id,
        inputs: [{ batchId: flourBatch1Id, quantity: { amount: 2, unit: 'kg' } }],
        outputs: [{ materialId: doughId, quantity: { amount: 2, unit: 'kg' } }],
        timestamp: T1.toISOString(),
      })
      .expect(201);
    doughBatchId = (transform1.body as TransformationBody).outputBatches[0].id;

    await request(server)
      .post('/production/store')
      .set('Authorization', ctx.auth('worker'))
      .send({ batchId: doughBatchId, locationId: storageLocationId })
      .expect(200);

    const transform2 = await request(server)
      .post('/production/transform')
      .set('Authorization', ctx.auth('worker'))
      .send({
        machineId,
        recipeStepId: (recipe.body as { steps: { id: string }[] }).steps[1].id,
        inputs: [{ batchId: doughBatchId, quantity: { amount: 2, unit: 'kg' } }],
        outputs: [{ materialId: breadId, quantity: { amount: 1, unit: 'kg' } }],
        timestamp: T2.toISOString(),
      })
      .expect(201);
    breadBatchId = (transform2.body as TransformationBody).outputBatches[0].id;

    await request(server)
      .post('/production/complete')
      .set('Authorization', ctx.auth('worker'))
      .send({ batchId: rootBatchId })
      .expect(200);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('GET /batches devuelve todos los lotes', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/batches')
      .set('Authorization', ctx.auth('admin'))
      .expect(200);

    expect(sortedIds(response.body as BatchBody[])).toEqual(
      [flourBatch1Id, flourBatch2Id, rootBatchId, doughBatchId, breadBatchId].sort(),
    );
  });

  it('GET /batches?status= filtra por estado', async () => {
    const stored = await request(ctx.app.getHttpServer())
      .get('/batches?status=stored')
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);
    expect(sortedIds(stored.body as BatchBody[])).toEqual(
      [flourBatch1Id, flourBatch2Id, doughBatchId].sort(),
    );

    const inProgress = await request(ctx.app.getHttpServer())
      .get('/batches?status=in_progress')
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);
    expect(sortedIds(inProgress.body as BatchBody[])).toEqual([breadBatchId]);
  });

  it('GET /batches?materialId= filtra por material y ?recipeId= por receta', async () => {
    const server = ctx.app.getHttpServer();
    const auth = ctx.auth('auditor');

    const flour = await request(server)
      .get(`/batches?materialId=${flourId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(sortedIds(flour.body as BatchBody[])).toEqual([flourBatch1Id, flourBatch2Id].sort());

    const byRecipe = await request(server)
      .get(`/batches?recipeId=${recipeId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(sortedIds(byRecipe.body as BatchBody[])).toEqual([rootBatchId]);
  });

  it('un status inválido → 400 (validación zod)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/batches?status=nope')
      .set('Authorization', ctx.auth('admin'))
      .expect(400);
    expect(response.body).toMatchObject({ error: 'ValidationError' });
  });

  it('GET /batches/:id devuelve el lote con su forma serializada', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get(`/batches/${doughBatchId}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);

    expect(response.body).toMatchObject({
      id: doughBatchId,
      materialId: doughId,
      quantity: { amount: 2, unit: 'kg' },
      status: 'stored',
    });
    expect((response.body as BatchBody).originBatchEventId).toBeDefined();
  });

  it('GET /batches/:id con un id desconocido → 404', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/batches/no-existe')
      .set('Authorization', ctx.auth('admin'))
      .expect(404);
    expect(response.body).toMatchObject({ statusCode: 404, error: 'NotFoundError' });
  });

  it('un worker puede listar y leer lotes (pantalla /produccion) → 200', async () => {
    const server = ctx.app.getHttpServer();
    const worker = ctx.auth('worker');

    await request(server).get('/batches').set('Authorization', worker).expect(200);
    await request(server).get(`/batches/${breadBatchId}`).set('Authorization', worker).expect(200);
  });

  it('un auditor y un admin pueden listar y leer lotes → 200', async () => {
    const server = ctx.app.getHttpServer();

    for (const role of ['auditor', 'admin'] as const) {
      await request(server).get('/batches').set('Authorization', ctx.auth(role)).expect(200);
      await request(server)
        .get(`/batches/${flourBatch1Id}`)
        .set('Authorization', ctx.auth(role))
        .expect(200);
    }
  });
});
