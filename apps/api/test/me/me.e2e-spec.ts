import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createE2EApp, type E2EContext } from '../support/e2e-app.js';

interface ScheduleItem {
  id: string;
  workerId: string;
  machineId: string;
  slot: { daysOfWeek: number[]; start: string; end: string };
  machine: {
    id: string;
    name: string;
    type: string;
    locationId: string;
    status: string;
  } | null;
  activeNow: boolean;
}

/**
 * E2E de `GET /me/schedule` (auditoría MEDIA #2).
 *
 * La API calcula `activeNow` en el **proceso servidor** con
 * `TimeSlot.contains(new Date())`, no en el cliente: el navegador puede estar en
 * otra zona horaria que la fuente de verdad de I3. Los tests no fijan el reloj
 * (no hay flag para eso); construyen una franja que cubre el día actual y otra
 * que no, de modo que `activeNow` es determinista sin depender de la hora.
 */
describe('Me schedule (e2e)', () => {
  let ctx: E2EContext;
  let workerId: string;
  let auditorId: string;
  let machineId: string;
  let activeAssignmentId: string;
  let inactiveAssignmentId: string;
  let auditorAssignmentId: string;
  let today: number;

  beforeAll(async () => {
    ctx = await createE2EApp();
    const server = ctx.app.getHttpServer();
    const admin = ctx.auth('admin');

    const workerMe = await request(server)
      .get('/auth/me')
      .set('Authorization', ctx.auth('worker'))
      .expect(200);
    workerId = (workerMe.body as { workerId: string }).workerId;

    const auditorMe = await request(server)
      .get('/auth/me')
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);
    auditorId = (auditorMe.body as { workerId: string }).workerId;

    const location = await request(server)
      .post('/locations')
      .set('Authorization', admin)
      .send({ name: 'Planta A', kind: 'production' })
      .expect(201);

    const machine = await request(server)
      .post('/machines')
      .set('Authorization', admin)
      .send({
        name: 'Mezcladora',
        type: 'mixer',
        locationId: (location.body as { id: string }).id,
      })
      .expect(201);
    machineId = (machine.body as { id: string }).id;

    today = new Date().getDay();
    const otherDay = (today + 1) % 7;

    const assign = async (worker: string, daysOfWeek: number[]): Promise<string> => {
      const response = await request(server)
        .post('/assignments')
        .set('Authorization', admin)
        .send({
          workerId: worker,
          machineId,
          // Día completo: `end: '24:00'` (soportado por el dominio) evita
          // depender de la hora exacta en que corre el test.
          slot: { daysOfWeek, start: '00:00', end: '24:00' },
        })
        .expect(201);
      return (response.body as { id: string }).id;
    };

    activeAssignmentId = await assign(workerId, [today]);
    inactiveAssignmentId = await assign(workerId, [otherDay]);
    auditorAssignmentId = await assign(auditorId, [today]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('un worker ve SOLO su agenda, con `activeNow` calculado en el servidor', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/me/schedule')
      .set('Authorization', ctx.auth('worker'))
      .expect(200);

    const items = response.body as ScheduleItem[];
    expect(items.map((item) => item.id).sort()).toEqual(
      [activeAssignmentId, inactiveAssignmentId].sort(),
    );
    expect(items.every((item) => item.workerId === workerId)).toBe(true);

    const active = items.find((item) => item.id === activeAssignmentId);
    const inactive = items.find((item) => item.id === inactiveAssignmentId);
    expect(active?.activeNow).toBe(true);
    expect(inactive?.activeNow).toBe(false);

    // Enriquecimiento con la máquina y la franja en formato wire.
    expect(active).toMatchObject({
      machineId,
      slot: { daysOfWeek: [today], start: '00:00', end: '24:00' },
      machine: { id: machineId, name: 'Mezcladora', type: 'mixer', status: 'idle' },
    });
  });

  it('un auditor también consulta su propia agenda', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/me/schedule')
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);

    const items = response.body as ScheduleItem[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: auditorAssignmentId,
      workerId: auditorId,
      activeNow: true,
      machine: { id: machineId },
    });
  });

  it('un admin sin asignaciones obtiene una agenda vacía (no 403)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/me/schedule')
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect(response.body).toEqual([]);
  });

  it('sin token → 401', async () => {
    await request(ctx.app.getHttpServer()).get('/me/schedule').expect(401);
  });

  it('un worker no puede leer la agenda de otro por `/workers/:id/schedule` → 403', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get(`/workers/${auditorId}/schedule`)
      .set('Authorization', ctx.auth('worker'))
      .expect(403);
    expect(response.body).toMatchObject({
      statusCode: 403,
      error: 'UnauthorizedRoleError',
    });
  });
});
