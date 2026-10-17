import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createE2EApp, type E2EContext } from '../support/e2e-app.js';

/**
 * E2E del recurso `stock` (Fase 5, docs/09): stock agregado por lugar, historial
 * de movimientos (orden + filtro por material) y RBAC. Se apoya en un flujo HTTP
 * mínimo (arribo + transformación) para generar movimientos reales.
 *
 * RBAC: `GET /stock/:id` es A/Au/**W**; `GET /stock/:id/movements` es A/Au (un
 * `worker` recibe 403).
 */

interface StockEntryBody {
  materialId: string;
  amount: number;
  unit: string;
}

interface MovementBody {
  id: string;
  materialId: string;
  delta: { amount: number; unit: string };
  reason: string;
  timestamp: string;
}

const T1 = new Date(2026, 4, 13, 10, 0, 0);

describe('Stock (e2e)', () => {
  let ctx: E2EContext;
  let storageLocationId: string;
  let productionLocationId: string;
  let flourId: string;
  let doughId: string;
  let machineId: string;

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
    machineId = await create('/machines', {
      name: 'Amasadora',
      type: 'mixer',
      locationId: productionLocationId,
    });

    const me = await request(server)
      .get('/auth/me')
      .set('Authorization', ctx.auth('worker'))
      .expect(200);
    await create('/assignments', {
      workerId: (me.body as { workerId: string }).workerId,
      machineId,
      slot: { daysOfWeek: [T1.getDay()], start: '09:00', end: '11:00' },
    });

    // Dos arribos (proveedor) + una transformación (consumo en máquina).
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
      return (response.body as { id: string }).id;
    };
    const firstBatchId = await arrival(2);
    await arrival(3);

    await request(server)
      .post('/production/transform')
      .set('Authorization', ctx.auth('worker'))
      .send({
        machineId,
        inputs: [{ batchId: firstBatchId, quantity: { amount: 2, unit: 'kg' } }],
        outputs: [{ materialId: doughId, quantity: { amount: 2, unit: 'kg' } }],
        timestamp: T1.toISOString(),
      })
      .expect(201);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('GET /stock/:locationId: agrega las entradas de almacén (5 kg de harina)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get(`/stock/${storageLocationId}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect(response.body).toEqual([{ materialId: flourId, amount: 5, unit: 'kg' }]);
  });

  it('GET /stock/:locationId: el lugar de la máquina muestra el consumo (delta negativo)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get(`/stock/${productionLocationId}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect(response.body).toEqual([
      { materialId: flourId, amount: -2, unit: 'kg' },
    ] satisfies StockEntryBody[]);
  });

  it('GET /stock/:locationId/movements: orden cronológico ascendente', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get(`/stock/${storageLocationId}/movements`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    const movements = response.body as MovementBody[];
    expect(movements).toHaveLength(2);
    expect(movements.map((m) => m.reason)).toEqual(['supply_in', 'supply_in']);
    const timestamps = movements.map((m) => new Date(m.timestamp).getTime());
    expect(timestamps[0]).toBeLessThanOrEqual(timestamps[1]);
  });

  it('GET /stock/:locationId/movements?materialId=: filtra por material (y vacío si no hay)', async () => {
    const filtered = await request(ctx.app.getHttpServer())
      .get(`/stock/${storageLocationId}/movements?materialId=${flourId}`)
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);
    expect(filtered.body).toHaveLength(2);

    const none = await request(ctx.app.getHttpServer())
      .get(`/stock/${storageLocationId}/movements?materialId=${doughId}`)
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);
    expect(none.body).toEqual([]);
  });

  it('un lugar sin movimientos devuelve stock vacío', async () => {
    const server = ctx.app.getHttpServer();
    const empty = await request(server)
      .post('/locations')
      .set('Authorization', ctx.auth('admin'))
      .send({ name: 'Almacén vacío', kind: 'storage' })
      .expect(201);
    const response = await request(server)
      .get(`/stock/${(empty.body as { id: string }).id}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect(response.body).toEqual([]);
  });

  it('un lugar inexistente → 404 (stock y movimientos)', async () => {
    await request(ctx.app.getHttpServer())
      .get('/stock/no-existe')
      .set('Authorization', ctx.auth('admin'))
      .expect(404);
    await request(ctx.app.getHttpServer())
      .get('/stock/no-existe/movements')
      .set('Authorization', ctx.auth('admin'))
      .expect(404);
  });

  it('un worker puede leer stock pero no el historial de movimientos', async () => {
    await request(ctx.app.getHttpServer())
      .get(`/stock/${storageLocationId}`)
      .set('Authorization', ctx.auth('worker'))
      .expect(200);

    const response = await request(ctx.app.getHttpServer())
      .get(`/stock/${storageLocationId}/movements`)
      .set('Authorization', ctx.auth('worker'))
      .expect(403);
    expect(response.body).toMatchObject({ statusCode: 403, error: 'UnauthorizedRoleError' });
  });
});
