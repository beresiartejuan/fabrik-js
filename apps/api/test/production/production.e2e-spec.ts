import {
  BatchId,
  type BatchRepository,
  type BatchTransformed,
  LocationId,
  Machine,
  type MachineRepository,
} from '@fabrik/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryEventBus } from '../../src/domain/in-memory-event-bus.js';
import { BATCH_REPOSITORY, EVENT_BUS, MACHINE_REPOSITORY } from '../../src/domain/tokens.js';
import { createE2EApp, type E2EContext } from '../support/e2e-app.js';

/**
 * E2E del flujo de producción (Fase 5, docs/09) — el criterio de salida.
 *
 * Recorre arribo → start → transformación (con merma) → store → complete,
 * encadenando las respuestas HTTP (el transform devuelve los lotes de output) y
 * afirmando: estados de lote, matemática de stock por lugar, orden de movimientos
 * y eventos de dominio (vía `InMemoryEventBus`, porque el endpoint de eventos es
 * Fase 6). Además cubre RBAC por rol y los errores de dominio del camino.
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
  inputs: {
    batchId?: string;
    materialId: string;
    quantity: { amount: number; unit: string };
  }[];
  outputs: {
    batchId?: string;
    materialId: string;
    quantity: { amount: number; unit: string };
  }[];
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

// Instantes **locales** deterministas: la franja del worker los cubre (I3) y el
// timestamp inyectado hace reproducible el orden de los movimientos y el chequeo
// de la ventana horaria. `new Date(y, m, d, h, min)` usa hora local, así que
// `getHours()`/`getDay()` coinciden con la franja construida a partir de ellos.
const T1 = new Date(2026, 4, 13, 10, 0, 0);
const T2 = new Date(2026, 4, 13, 10, 30, 0);
const T_OUTSIDE = new Date(2026, 4, 13, 12, 0, 0);

describe('Production (e2e)', () => {
  let ctx: E2EContext;
  let bus: InMemoryEventBus;
  let batches: BatchRepository;

  let storageLocationId: string;
  let productionLocationId: string;
  let flourId: string;
  let doughId: string;
  let breadId: string;
  let machineId: string;
  let maintenanceMachineId: string;
  let recipeId: string;
  let step1Id: string;
  let step2Id: string;
  let workerId: string;
  let assignmentId: string;

  let flourBatch1Id: string;
  let rootBatchId: string;
  let doughBatchId: string;

  beforeAll(async () => {
    ctx = await createE2EApp();
    bus = ctx.module.get<InMemoryEventBus>(EVENT_BUS);
    batches = ctx.module.get<BatchRepository>(BATCH_REPOSITORY);

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

    storageLocationId = await create('/locations', {
      name: 'Almacén',
      kind: 'storage',
    });
    productionLocationId = await create('/locations', {
      name: 'Planta',
      kind: 'production',
    });

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

    const machinery = ctx.module.get<MachineRepository>(MACHINE_REPOSITORY);
    const maintenance = Machine.create({
      name: 'Mezcladora en reparación',
      type: 'mixer',
      locationId: LocationId.from(productionLocationId),
      status: 'maintenance',
    });
    await machinery.save(maintenance);
    maintenanceMachineId = maintenance.id;

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
    recipeId = (recipe.body as { id: string }).id;
    const steps = (recipe.body as { steps: { id: string }[] }).steps;
    step1Id = steps[0].id;
    step2Id = steps[1].id;

    const me = await request(server)
      .get('/auth/me')
      .set('Authorization', ctx.auth('worker'))
      .expect(200);
    workerId = (me.body as { workerId: string }).workerId;

    assignmentId = await create('/assignments', {
      workerId,
      machineId,
      slot: { daysOfWeek: [T1.getDay()], start: '09:00', end: '11:00' },
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('POST /supplies/arrivals: un worker registra arribos (201, lote stored) y suma stock', async () => {
    const first = await request(ctx.app.getHttpServer())
      .post('/supplies/arrivals')
      .set('Authorization', ctx.auth('worker'))
      .send({
        materialId: flourId,
        quantity: { amount: 2, unit: 'kg' },
        locationId: storageLocationId,
      })
      .expect(201);
    expect(first.body).toMatchObject({
      materialId: flourId,
      quantity: { amount: 2, unit: 'kg' },
      status: 'stored',
    });
    flourBatch1Id = (first.body as BatchBody).id;

    const second = await request(ctx.app.getHttpServer())
      .post('/supplies/arrivals')
      .set('Authorization', ctx.auth('worker'))
      .send({
        materialId: flourId,
        quantity: { amount: 3, unit: 'kg' },
        locationId: storageLocationId,
      })
      .expect(201);
    expect(second.body).toMatchObject({
      quantity: { amount: 3, unit: 'kg' },
      status: 'stored',
    });

    const stock = await request(ctx.app.getHttpServer())
      .get(`/stock/${storageLocationId}`)
      .set('Authorization', ctx.auth('worker'))
      .expect(200);
    expect(stock.body).toEqual([{ materialId: flourId, amount: 5, unit: 'kg' }]);
  });

  it('POST /production/start: el admin crea el lote raíz in_progress con la cantidad planificada', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/production/start')
      .set('Authorization', ctx.auth('admin'))
      .send({ recipeId })
      .expect(201);
    rootBatchId = (response.body as BatchBody).id;
    expect(response.body).toMatchObject({
      materialId: breadId,
      quantity: { amount: 1, unit: 'unit' },
      recipeId,
      status: 'in_progress',
    });
  });

  it('POST /production/transform (paso 1): consume stock, crea el lote intermedio y devuelve el evento', async () => {
    const response = await request(ctx.app.getHttpServer())
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

    const { event, outputBatches } = response.body as TransformationBody;
    expect(event).toMatchObject({
      machineId,
      workerId,
      locationId: productionLocationId,
      recipeStepId: step1Id,
      observation: 'mezclado',
      timestamp: T1.toISOString(),
      inputs: [{ batchId: flourBatch1Id, materialId: flourId }],
      outputs: [{ materialId: doughId }],
    });
    // El id de output lo resuelve el controlador y es el que referencia el evento.
    expect(outputBatches).toHaveLength(1);
    expect(outputBatches[0]).toMatchObject({
      materialId: doughId,
      quantity: { amount: 2, unit: 'kg' },
      status: 'in_progress',
      originBatchEventId: event.id,
    });
    doughBatchId = outputBatches[0].id;
  });

  it('POST /production/store: guarda el lote intermedio y acredita stock produced', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/production/store')
      .set('Authorization', ctx.auth('worker'))
      .send({ batchId: doughBatchId, locationId: storageLocationId })
      .expect(200);
    expect(response.body).toMatchObject({ id: doughBatchId, status: 'stored' });

    const stock = await request(ctx.app.getHttpServer())
      .get(`/stock/${storageLocationId}`)
      .set('Authorization', ctx.auth('worker'))
      .expect(200);
    expect(stock.body).toEqual([
      { materialId: flourId, amount: 5, unit: 'kg' },
      { materialId: doughId, amount: 2, unit: 'kg' },
    ]);
  });

  it('POST /production/transform (paso 2 con merma): 2 kg de masa → 1 unit de pan', async () => {
    const response = await request(ctx.app.getHttpServer())
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

    const { event, outputBatches } = response.body as TransformationBody;
    expect(event.inputs).toEqual([
      {
        batchId: doughBatchId,
        materialId: doughId,
        quantity: { amount: 2, unit: 'kg' },
      },
    ]);
    expect(outputBatches[0]).toMatchObject({
      materialId: breadId,
      quantity: { amount: 1, unit: 'unit' },
      status: 'in_progress',
    });
  });

  it('POST /production/complete: cierra la orden (completed)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/production/complete')
      .set('Authorization', ctx.auth('worker'))
      .send({ batchId: rootBatchId })
      .expect(200);
    expect(response.body).toMatchObject({
      id: rootBatchId,
      status: 'completed',
    });
  });

  it('el stock del lugar de producción refleja los consumos (deltas negativos)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get(`/stock/${productionLocationId}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect(response.body).toEqual([
      { materialId: flourId, amount: -2, unit: 'kg' },
      { materialId: doughId, amount: -2, unit: 'kg' },
    ]);
  });

  it('GET /stock/:id/movements devuelve los movimientos en orden cronológico y filtra por material', async () => {
    const all = await request(ctx.app.getHttpServer())
      .get(`/stock/${storageLocationId}/movements`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    const reasons = (all.body as MovementBody[]).map((m) => m.reason);
    expect(reasons).toEqual(['supply_in', 'supply_in', 'produced']);

    const filtered = await request(ctx.app.getHttpServer())
      .get(`/stock/${storageLocationId}/movements?materialId=${flourId}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect((filtered.body as MovementBody[]).map((m) => m.id)).toHaveLength(2);

    // En la máquina los dos consumos salieron con timestamp inyectado T1 < T2.
    const machineMovements = await request(ctx.app.getHttpServer())
      .get(`/stock/${productionLocationId}/movements`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect(machineMovements.body).toMatchObject([
      {
        materialId: flourId,
        delta: { amount: -2, unit: 'kg' },
        reason: 'consumed',
        timestamp: T1.toISOString(),
      },
      {
        materialId: doughId,
        delta: { amount: -2, unit: 'kg' },
        reason: 'consumed',
        timestamp: T2.toISOString(),
      },
    ]);
  });

  it('emite supply.arrived ×2, batch.created, batch.transformed ×2, batch.stored y production.completed', () => {
    const names = bus.published.map((event) => event.name);
    const count = (name: string): number => names.filter((n) => n === name).length;
    expect(count('supply.arrived')).toBe(2);
    expect(count('batch.created')).toBe(1);
    expect(count('batch.transformed')).toBe(2);
    expect(count('batch.stored')).toBe(1);
    expect(count('production.completed')).toBe(1);

    const transformed = bus.published.filter(
      (event): event is BatchTransformed => event.name === 'batch.transformed',
    );
    const outputs = transformed[1].payload.outputs;
    expect(outputs[0].batchId).toBeTypeOf('string');
  });

  // --- RBAC por rol (el dominio autoriza) ---

  it('un worker no puede iniciar producción → 403', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/production/start')
      .set('Authorization', ctx.auth('worker'))
      .send({ recipeId })
      .expect(403);
    expect(response.body).toMatchObject({
      statusCode: 403,
      error: 'UnauthorizedRoleError',
    });
  });

  it('un auditor no puede transformar → 403', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/production/transform')
      .set('Authorization', ctx.auth('auditor'))
      .send({
        machineId,
        inputs: [],
        outputs: [{ materialId: doughId, quantity: { amount: 1, unit: 'kg' } }],
        timestamp: T1.toISOString(),
      })
      .expect(403);
    expect(response.body).toMatchObject({
      statusCode: 403,
      error: 'UnauthorizedRoleError',
    });
  });

  it('un worker puede leer el stock por lugar → 200', async () => {
    await request(ctx.app.getHttpServer())
      .get(`/stock/${storageLocationId}`)
      .set('Authorization', ctx.auth('worker'))
      .expect(200);
  });

  // --- Errores de dominio del camino de producción ---

  it('transformar en una máquina en mantenimiento → 409', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/production/transform')
      .set('Authorization', ctx.auth('worker'))
      .send({
        machineId: maintenanceMachineId,
        inputs: [{ batchId: flourBatch1Id, quantity: { amount: 1, unit: 'kg' } }],
        outputs: [],
        timestamp: T1.toISOString(),
      })
      .expect(409);
    expect(response.body).toMatchObject({
      statusCode: 409,
      error: 'InactiveMachineError',
    });
  });

  it('transformar fuera de la franja asignada (I3, ventana horaria) → 409', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/production/transform')
      .set('Authorization', ctx.auth('worker'))
      .send({
        machineId,
        inputs: [{ batchId: flourBatch1Id, quantity: { amount: 1, unit: 'kg' } }],
        outputs: [],
        timestamp: T_OUTSIDE.toISOString(),
      })
      .expect(409);
    expect(response.body).toMatchObject({
      statusCode: 409,
      error: 'WorkerNotAssignedError',
    });
  });

  it('transformar con un lote de input inexistente → 404', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/production/transform')
      .set('Authorization', ctx.auth('worker'))
      .send({
        machineId,
        inputs: [{ batchId: 'no-existe', quantity: { amount: 1, unit: 'kg' } }],
        outputs: [],
        timestamp: T1.toISOString(),
      })
      .expect(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'NotFoundError',
    });
  });

  it('transformar con un output en unidad incompatible → 422 (I6)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/production/transform')
      .set('Authorization', ctx.auth('worker'))
      .send({
        machineId,
        inputs: [],
        outputs: [{ materialId: breadId, quantity: { amount: 1, unit: 'kg' } }],
        timestamp: T1.toISOString(),
      })
      .expect(422);
    expect(response.body).toMatchObject({
      statusCode: 422,
      error: 'IncompatibleUnitError',
    });
  });

  it('sin asignación a la máquina tras desasignar → 409', async () => {
    await request(ctx.app.getHttpServer())
      .delete(`/assignments/${assignmentId}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(204);

    const response = await request(ctx.app.getHttpServer())
      .post('/production/transform')
      .set('Authorization', ctx.auth('worker'))
      .send({
        machineId,
        inputs: [{ batchId: flourBatch1Id, quantity: { amount: 1, unit: 'kg' } }],
        outputs: [],
        timestamp: T1.toISOString(),
      })
      .expect(409);
    expect(response.body).toMatchObject({
      statusCode: 409,
      error: 'WorkerNotAssignedError',
    });
  });

  it('el lote raíz completado persiste como completed (vía repositorio)', async () => {
    const root = await batches.findById(BatchId.from(rootBatchId));
    expect(root?.status).toBe('completed');
  });
});
