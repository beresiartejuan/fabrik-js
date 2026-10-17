import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createE2EApp, type E2EContext } from '../support/e2e-app.js';

/** E2E del recurso `materials` (Fase 4, docs/09): CRUD + RBAC. */
describe('Materials (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await createE2EApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('CRUD: create → list → get → update → deactivate', async () => {
    const server = ctx.app.getHttpServer();

    const created = await request(server)
      .post('/materials')
      .set('Authorization', ctx.auth('admin'))
      .send({
        name: 'Harina 000',
        description: 'Harina de trigo',
        kind: 'supply',
        physicalState: 'solid',
        unitOfMeasure: 'kg',
      })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({
      name: 'Harina 000',
      description: 'Harina de trigo',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
      active: true,
    });

    const list = await request(server)
      .get('/materials')
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect((list.body as { id: string }[]).map((m) => m.id)).toContain(id);

    const fetched = await request(server)
      .get(`/materials/${id}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect(fetched.body).toMatchObject({ id, name: 'Harina 000' });

    const updated = await request(server)
      .patch(`/materials/${id}`)
      .set('Authorization', ctx.auth('admin'))
      .send({ name: 'Harina 0000' })
      .expect(200);
    expect(updated.body).toMatchObject({ id, name: 'Harina 0000', kind: 'supply' });

    const deactivated = await request(server)
      .post(`/materials/${id}/deactivate`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect(deactivated.body).toMatchObject({ id, active: false });
  });

  it('GET /materials/:id inexistente → 404 (NotFoundError)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/materials/no-existe')
      .set('Authorization', ctx.auth('admin'))
      .expect(404);
    expect(response.body).toMatchObject({ statusCode: 404, error: 'NotFoundError' });
  });

  it('POST /materials con body inválido → 400 con forma ValidationError (zod)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/materials')
      .set('Authorization', ctx.auth('admin'))
      .send({ name: '', kind: 'supply', physicalState: 'solid', unitOfMeasure: 'kg' })
      .expect(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'ValidationError',
      message: 'La petición no es válida',
    });
    expect((response.body as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
  });

  it('create con unidad incoherente con el estado físico → 422', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/materials')
      .set('Authorization', ctx.auth('admin'))
      .send({ name: 'Aceite', kind: 'supply', physicalState: 'solid', unitOfMeasure: 'l' })
      .expect(422);
    expect(response.body).toMatchObject({ statusCode: 422, error: 'IncompatibleUnitError' });
  });

  it('un worker no puede escribir el catálogo → 403', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/materials')
      .set('Authorization', ctx.auth('worker'))
      .send({ name: 'Intruso', kind: 'supply', physicalState: 'solid', unitOfMeasure: 'kg' })
      .expect(403);
    expect(response.body).toMatchObject({ statusCode: 403, error: 'UnauthorizedRoleError' });
  });

  it('un auditor puede leer el catálogo → 200', async () => {
    await request(ctx.app.getHttpServer())
      .get('/materials')
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);
  });
});
