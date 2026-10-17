import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createE2EApp, type E2EContext } from '../support/e2e-app.js';

/** E2E de asignaciones y agendas (Fase 4, docs/09): assign → schedules → unassign + I1 + RBAC. */
describe('Assignments (e2e)', () => {
  let ctx: E2EContext;
  let workerId: string;
  let machineId: string;
  let assignmentId: string;

  beforeAll(async () => {
    ctx = await createE2EApp();
    const server = ctx.app.getHttpServer();
    const admin = ctx.auth('admin');

    const location = await request(server)
      .post('/locations')
      .set('Authorization', admin)
      .send({ name: 'Planta A', kind: 'production' })
      .expect(201);

    const machine = await request(server)
      .post('/machines')
      .set('Authorization', admin)
      .send({ name: 'Mezcladora', type: 'mixer', locationId: location.body.id as string })
      .expect(201);
    machineId = machine.body.id as string;

    const worker = await request(server)
      .post('/workers')
      .set('Authorization', admin)
      .send({ name: 'Operario A', role: 'worker' })
      .expect(201);
    workerId = worker.body.id as string;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('POST /assignments crea la asignación con el TimeSlot normalizado', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/assignments')
      .set('Authorization', ctx.auth('admin'))
      .send({
        workerId,
        machineId,
        slot: { daysOfWeek: [3, 1, 3], start: '08:00', end: '12:00' },
      })
      .expect(201);
    assignmentId = response.body.id as string;
    expect(response.body).toMatchObject({
      workerId,
      machineId,
      slot: { daysOfWeek: [1, 3], start: '08:00', end: '12:00' },
    });
  });

  it('GET /workers/:id/schedule lista la asignación', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get(`/workers/${workerId}/schedule`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect((response.body as { id: string }[]).map((a) => a.id)).toContain(assignmentId);
  });

  it('GET /machines/:id/schedule lista la asignación', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get(`/machines/${machineId}/schedule`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect((response.body as { id: string }[]).map((a) => a.id)).toContain(assignmentId);
  });

  it('GET /workers/:id/schedule con worker inexistente → 404', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/workers/no-existe/schedule')
      .set('Authorization', ctx.auth('admin'))
      .expect(404);
    expect(response.body).toMatchObject({ statusCode: 404, error: 'NotFoundError' });
  });

  it('GET /machines/:id/schedule con máquina inexistente → 404', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/machines/no-existe/schedule')
      .set('Authorization', ctx.auth('admin'))
      .expect(404);
    expect(response.body).toMatchObject({ statusCode: 404, error: 'NotFoundError' });
  });

  it('una asignación solapada del mismo worker → 409 (I1)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/assignments')
      .set('Authorization', ctx.auth('admin'))
      .send({
        workerId,
        machineId,
        slot: { daysOfWeek: [1], start: '11:00', end: '13:00' },
      })
      .expect(409);
    expect(response.body).toMatchObject({ statusCode: 409, error: 'OverlappingScheduleError' });
  });

  it('DELETE /assignments/:id desasigna (204) y vacía la agenda', async () => {
    await request(ctx.app.getHttpServer())
      .delete(`/assignments/${assignmentId}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(204);

    const schedule = await request(ctx.app.getHttpServer())
      .get(`/workers/${workerId}/schedule`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect(schedule.body).toEqual([]);
  });

  it('un worker no puede asignar → 403', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/assignments')
      .set('Authorization', ctx.auth('worker'))
      .send({
        workerId,
        machineId,
        slot: { daysOfWeek: [2], start: '08:00', end: '10:00' },
      })
      .expect(403);
    expect(response.body).toMatchObject({ statusCode: 403, error: 'UnauthorizedRoleError' });
  });

  it('un auditor puede leer la agenda → 200', async () => {
    await request(ctx.app.getHttpServer())
      .get(`/workers/${workerId}/schedule`)
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);
  });
});
