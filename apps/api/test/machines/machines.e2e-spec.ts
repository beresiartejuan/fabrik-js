import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createE2EApp, type E2EContext } from '../support/e2e-app.js';

/** E2E del recurso `machines` (Fase 4, docs/09): CRUD + move (I2) + RBAC. */
describe('Machines (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await createE2EApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function createLocation(name: string, kind: 'production' | 'storage'): Promise<string> {
    const response = await request(ctx.app.getHttpServer())
      .post('/locations')
      .set('Authorization', ctx.auth('admin'))
      .send({ name, kind })
      .expect(201);
    return response.body.id as string;
  }

  it('CRUD: create → list → get → update → move', async () => {
    const server = ctx.app.getHttpServer();
    const plantaA = await createLocation('Planta A', 'production');
    const plantaB = await createLocation('Planta B', 'production');

    const created = await request(server)
      .post('/machines')
      .set('Authorization', ctx.auth('admin'))
      .send({ name: 'Mezcladora', type: 'mixer', locationId: plantaA })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({
      name: 'Mezcladora',
      type: 'mixer',
      locationId: plantaA,
      status: 'idle',
    });

    const list = await request(server)
      .get(`/machines?locationId=${plantaA}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect((list.body as { id: string }[]).map((m) => m.id)).toContain(id);

    const fetched = await request(server)
      .get(`/machines/${id}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect(fetched.body).toMatchObject({ id, name: 'Mezcladora' });

    const updated = await request(server)
      .patch(`/machines/${id}`)
      .set('Authorization', ctx.auth('admin'))
      .send({ name: 'Mezcladora Industrial' })
      .expect(200);
    expect(updated.body).toMatchObject({ id, name: 'Mezcladora Industrial', locationId: plantaA });

    const moved = await request(server)
      .post(`/machines/${id}/move`)
      .set('Authorization', ctx.auth('admin'))
      .send({ locationId: plantaB })
      .expect(200);
    expect(moved.body).toMatchObject({ id, locationId: plantaB });
  });

  it('crear máquina en un lugar inexistente → 404', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/machines')
      .set('Authorization', ctx.auth('admin'))
      .send({ name: 'Huérfana', type: 'mixer', locationId: 'no-existe' })
      .expect(404);
    expect(response.body).toMatchObject({ statusCode: 404, error: 'NotFoundError' });
  });

  it('mover una máquina a un lugar inexistente → 404', async () => {
    const server = ctx.app.getHttpServer();
    const planta = await createLocation('Planta E', 'production');
    const created = await request(server)
      .post('/machines')
      .set('Authorization', ctx.auth('admin'))
      .send({ name: 'Transportadora', type: 'conveyor', locationId: planta })
      .expect(201);

    const response = await request(server)
      .post(`/machines/${created.body.id as string}/move`)
      .set('Authorization', ctx.auth('admin'))
      .send({ locationId: 'no-existe' })
      .expect(404);
    expect(response.body).toMatchObject({ statusCode: 404, error: 'NotFoundError' });
  });

  it('mover una máquina a un lugar de almacenamiento → 422 (I2)', async () => {
    const server = ctx.app.getHttpServer();
    const planta = await createLocation('Planta C', 'production');
    const deposito = await createLocation('Depósito', 'storage');
    const created = await request(server)
      .post('/machines')
      .set('Authorization', ctx.auth('admin'))
      .send({ name: 'Envasadora', type: 'packer', locationId: planta })
      .expect(201);

    const response = await request(server)
      .post(`/machines/${created.body.id as string}/move`)
      .set('Authorization', ctx.auth('admin'))
      .send({ locationId: deposito })
      .expect(422);
    expect(response.body).toMatchObject({ statusCode: 422, error: 'InvalidLocationKindError' });
  });

  it('un worker no puede crear máquinas → 403', async () => {
    const planta = await createLocation('Planta D', 'production');
    const response = await request(ctx.app.getHttpServer())
      .post('/machines')
      .set('Authorization', ctx.auth('worker'))
      .send({ name: 'Intrusa', type: 'mixer', locationId: planta })
      .expect(403);
    expect(response.body).toMatchObject({ statusCode: 403, error: 'UnauthorizedRoleError' });
  });

  it('un auditor puede leer máquinas → 200', async () => {
    await request(ctx.app.getHttpServer())
      .get('/machines')
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);
  });
});
