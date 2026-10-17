import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createE2EApp, type E2EContext } from '../support/e2e-app.js';

/** E2E del recurso `workers` (Fase 4, docs/09): CRUD + deactivate + RBAC. */
describe('Workers (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await createE2EApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('CRUD: create → list (filtro por rol) → get → update → deactivate', async () => {
    const server = ctx.app.getHttpServer();

    const created = await request(server)
      .post('/workers')
      .set('Authorization', ctx.auth('admin'))
      .send({ name: 'Operario 1', role: 'worker' })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({ name: 'Operario 1', role: 'worker', active: true });

    const list = await request(server)
      .get('/workers?role=worker&active=true')
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect((list.body as { id: string }[]).map((w) => w.id)).toContain(id);

    const fetched = await request(server)
      .get(`/workers/${id}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect(fetched.body).toMatchObject({ id, name: 'Operario 1' });

    const updated = await request(server)
      .patch(`/workers/${id}`)
      .set('Authorization', ctx.auth('admin'))
      .send({ role: 'auditor' })
      .expect(200);
    expect(updated.body).toMatchObject({ id, name: 'Operario 1', role: 'auditor' });

    const deactivated = await request(server)
      .post(`/workers/${id}/deactivate`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect(deactivated.body).toMatchObject({ id, active: false });
  });

  it('un worker no puede crear trabajadores → 403', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/workers')
      .set('Authorization', ctx.auth('worker'))
      .send({ name: 'Intruso', role: 'worker' })
      .expect(403);
    expect(response.body).toMatchObject({ statusCode: 403, error: 'UnauthorizedRoleError' });
  });

  it('un auditor puede leer trabajadores → 200', async () => {
    await request(ctx.app.getHttpServer())
      .get('/workers')
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);
  });
});
