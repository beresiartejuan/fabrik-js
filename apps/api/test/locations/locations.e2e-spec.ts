import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createE2EApp, type E2EContext } from '../support/e2e-app.js';

/** E2E del recurso `locations` (Fase 4, docs/09): CRUD + RBAC. */
describe('Locations (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await createE2EApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('CRUD: create → list (filtro por kind) → get → rename', async () => {
    const server = ctx.app.getHttpServer();

    const created = await request(server)
      .post('/locations')
      .set('Authorization', ctx.auth('admin'))
      .send({ name: 'Planta 1', kind: 'production' })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({ name: 'Planta 1', kind: 'production' });

    const list = await request(server)
      .get('/locations?kind=production')
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect((list.body as { id: string }[]).map((l) => l.id)).toContain(id);

    const filteredOut = await request(server)
      .get('/locations?kind=storage')
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect((filteredOut.body as { id: string }[]).map((l) => l.id)).not.toContain(id);

    const fetched = await request(server)
      .get(`/locations/${id}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect(fetched.body).toMatchObject({ id, name: 'Planta 1' });

    const renamed = await request(server)
      .patch(`/locations/${id}`)
      .set('Authorization', ctx.auth('admin'))
      .send({ name: 'Planta Norte' })
      .expect(200);
    expect(renamed.body).toMatchObject({ id, name: 'Planta Norte', kind: 'production' });
  });

  it('un worker no puede crear lugares → 403', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/locations')
      .set('Authorization', ctx.auth('worker'))
      .send({ name: 'Intruso', kind: 'production' })
      .expect(403);
    expect(response.body).toMatchObject({ statusCode: 403, error: 'UnauthorizedRoleError' });
  });

  it('un auditor puede leer lugares → 200', async () => {
    await request(ctx.app.getHttpServer())
      .get('/locations')
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);
  });
});
