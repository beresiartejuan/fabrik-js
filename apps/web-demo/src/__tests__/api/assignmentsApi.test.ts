import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ACCESS_TOKEN_PREFIX, DEMO_REFRESH_TOKEN_PREFIX } from '@/lib/api/demo/auth';
import { resetDb } from '@/lib/api/demo/db';
import { DEMO_SEED_IDS } from '@/lib/api/demo/seed';
import { ApiError } from '@/lib/api/errors';
import { createAssignmentsApi } from '@/lib/api/modules/assignmentsApi';
import { createWorkersApi } from '@/lib/api/modules/workersApi';
import type { TimeSlotWire } from '@/lib/api/types';
import { writeTokens } from '@/lib/session/session-store';

/**
 * Asignaciones y agendas sobre el **runtime demo** (docs/11-plan-demo.md §4):
 * los mismos casos de uso que inyectan `AssignmentsController`/
 * `ScheduleController`, con `TimeSlot.create` revalidando la franja (422) e **I1**
 * en el caso de uso (`OverlappingScheduleError` → 409, `InactiveWorkerError`
 * → 409).
 *
 * - La agenda sembrada (`asg-operario-mezcladora-1`, jornada completa) es la
 *   referencia de las formas de wire exactas.
 * - Gates de rol: assign/unassign y agenda de máquinas son A (o A/Au para leer
 *   máquinas); un `worker` solo lee **su propia** agenda (`workerSchedule`),
 *   igual que el `ScheduleController` real.
 */

function sessionTokens(userId: string): { accessToken: string; refreshToken: string } {
  return {
    accessToken: `${DEMO_ACCESS_TOKEN_PREFIX}${userId}`,
    refreshToken: `${DEMO_REFRESH_TOKEN_PREFIX}${userId}`,
  };
}

const TOKENS = {
  admin: sessionTokens(DEMO_SEED_IDS.admin),
  operario: sessionTokens(DEMO_SEED_IDS.operario),
  auditor: sessionTokens(DEMO_SEED_IDS.auditor),
};

/** Extrae el rechazo y lo normaliza a la `ApiError` final del kit. */
async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  const cause = await promise.catch((reason: unknown) => reason);
  expect(cause).toBeInstanceOf(ApiError);
  if (!(cause instanceof ApiError)) {
    throw new Error('el fallo debía ser ApiError');
  }
  return cause;
}

/** Franja sembrada: jornada completa los 7 días (activeNow siempre true). */
const FULL_DAY_SLOT: TimeSlotWire = {
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  start: '00:00',
  end: '24:00',
};

const SEEDED_ASSIGNMENT = {
  id: DEMO_SEED_IDS.asignacionOperario,
  workerId: DEMO_SEED_IDS.operario,
  machineId: DEMO_SEED_IDS.mezcladora,
  slot: FULL_DAY_SLOT,
};

beforeEach(() => {
  window.sessionStorage.clear();
  resetDb();
});

describe('assignmentsApi (demo) — agendas', () => {
  it('workerSchedule devuelve la agenda sembrada con la forma exacta del wire', async () => {
    writeTokens(TOKENS.admin);
    expect(await createAssignmentsApi().workerSchedule(DEMO_SEED_IDS.operario)).toStrictEqual([
      SEEDED_ASSIGNMENT,
    ]);
  });

  it('machineSchedule devuelve la agenda de la máquina', async () => {
    writeTokens(TOKENS.admin);
    expect(await createAssignmentsApi().machineSchedule(DEMO_SEED_IDS.mezcladora)).toStrictEqual([
      SEEDED_ASSIGNMENT,
    ]);
  });

  it('worker/máquina inexistentes → 404 con el contexto del filter', async () => {
    writeTokens(TOKENS.admin);
    const api = createAssignmentsApi();

    const workerFailure = await expectApiError(api.workerSchedule('wrk-no'));
    expect(workerFailure.statusCode).toBe(404);
    expect(workerFailure.error).toBe('NotFoundError');
    expect(workerFailure.context).toStrictEqual({ entity: 'Worker', id: 'wrk-no' });

    const machineFailure = await expectApiError(api.machineSchedule('maq-no'));
    expect(machineFailure.statusCode).toBe(404);
    expect(machineFailure.context).toStrictEqual({ entity: 'Machine', id: 'maq-no' });
  });

  it('el worker lee SU propia agenda (A/Au/W) — parity del guard de agenda propia', async () => {
    writeTokens(TOKENS.operario);
    expect(await createAssignmentsApi().workerSchedule(DEMO_SEED_IDS.operario)).toStrictEqual([
      SEEDED_ASSIGNMENT,
    ]);
  });

  it('el worker NO lee agendas ajenas ni la de máquinas (403 del caso de uso)', async () => {
    writeTokens(TOKENS.operario);
    const api = createAssignmentsApi();

    const otherFailure = await expectApiError(api.workerSchedule(DEMO_SEED_IDS.auditor));
    expect(otherFailure.statusCode).toBe(403);
    expect(otherFailure.error).toBe('UnauthorizedRoleError');
    expect(otherFailure.context).toStrictEqual({ role: 'worker', useCase: 'ListWorkerSchedule' });

    const machineFailure = await expectApiError(api.machineSchedule(DEMO_SEED_IDS.mezcladora));
    expect(machineFailure.statusCode).toBe(403);
    expect(machineFailure.context).toStrictEqual({
      role: 'worker',
      useCase: 'ListMachineSchedule',
    });
  });
});

describe('assignmentsApi (demo) — assign/unassign', () => {
  it('assign persiste y devuelve el wire (id generado); agenda del worker lo muestra', async () => {
    writeTokens(TOKENS.admin);
    const workersApi = createWorkersApi();
    const api = createAssignmentsApi();
    const lucia = (await workersApi.create({ name: 'Lucía', role: 'worker' })).id;

    const slot: TimeSlotWire = { daysOfWeek: [1, 3], start: '08:00', end: '16:30' };
    const created = await api.assign({
      workerId: lucia,
      machineId: DEMO_SEED_IDS.mezcladora,
      slot,
    });
    expect(created).toStrictEqual({
      id: expect.any(String),
      workerId: lucia,
      machineId: DEMO_SEED_IDS.mezcladora,
      slot,
    });

    expect((await api.workerSchedule(lucia)).map((assignment) => assignment.id)).toEqual([
      created.id,
    ]);
    // La máquina acumula ambas agendas (la sembrada + la nueva).
    expect(await api.machineSchedule(DEMO_SEED_IDS.mezcladora)).toHaveLength(2);
  });

  it('I1: solapado con la franja sembrada → 409 con el id de la asignación en conflicto', async () => {
    writeTokens(TOKENS.admin);
    const failure = await expectApiError(
      createAssignmentsApi().assign({
        workerId: DEMO_SEED_IDS.operario,
        machineId: DEMO_SEED_IDS.mezcladora,
        slot: { daysOfWeek: [5], start: '09:00', end: '12:00' },
      }),
    );

    expect(failure.statusCode).toBe(409);
    expect(failure.error).toBe('OverlappingScheduleError');
    expect(failure.context).toStrictEqual({
      workerId: DEMO_SEED_IDS.operario,
      conflictingAssignmentId: DEMO_SEED_IDS.asignacionOperario,
    });
  });

  it('slot inválido → 422 InvalidTimeSlotError (sustituye al 400 de zod)', async () => {
    writeTokens(TOKENS.admin);
    const api = createAssignmentsApi();
    const lucia = (await createWorkersApi().create({ name: 'Lucía', role: 'worker' })).id;

    const inverted = await expectApiError(
      api.assign({
        workerId: lucia,
        machineId: DEMO_SEED_IDS.mezcladora,
        slot: { daysOfWeek: [1], start: '09:00', end: '08:00' },
      }),
    );
    expect(inverted.statusCode).toBe(422);
    expect(inverted.error).toBe('InvalidTimeSlotError');
    expect(inverted.context).toBeUndefined();

    const emptyDays = await expectApiError(
      api.assign({
        workerId: lucia,
        machineId: DEMO_SEED_IDS.mezcladora,
        slot: { daysOfWeek: [], start: '09:00', end: '12:00' },
      }),
    );
    expect(emptyDays.statusCode).toBe(422);
    expect(emptyDays.message).toBe('daysOfWeek no puede estar vacío');
  });

  it('worker inexistente → 404; worker inactivo → 409 InactiveWorkerError', async () => {
    writeTokens(TOKENS.admin);
    const api = createAssignmentsApi();

    const ghost = await expectApiError(
      api.assign({
        workerId: 'wrk-no',
        machineId: DEMO_SEED_IDS.mezcladora,
        slot: { daysOfWeek: [1], start: '09:00', end: '12:00' },
      }),
    );
    expect(ghost.statusCode).toBe(404);
    expect(ghost.context).toStrictEqual({ entity: 'Worker', id: 'wrk-no' });

    const machine404 = await expectApiError(
      api.assign({
        workerId: DEMO_SEED_IDS.operario,
        machineId: 'maq-no',
        slot: { daysOfWeek: [1], start: '09:00', end: '12:00' },
      }),
    );
    expect(machine404.statusCode).toBe(404);
    expect(machine404.context).toStrictEqual({ entity: 'Machine', id: 'maq-no' });

    // El seed solo da un operario con la jornada completa ocupada; para el 409
    // por inactividad se da de baja a un worker NUEVO (con franja libre).
    const lucia = (await createWorkersApi().create({ name: 'Lucía', role: 'worker' })).id;
    await createWorkersApi().deactivate(lucia);
    const inactive = await expectApiError(
      api.assign({
        workerId: lucia,
        machineId: DEMO_SEED_IDS.mezcladora,
        slot: { daysOfWeek: [1], start: '09:00', end: '12:00' },
      }),
    );
    expect(inactive.statusCode).toBe(409);
    expect(inactive.error).toBe('InactiveWorkerError');
    expect(inactive.context).toStrictEqual({ workerId: lucia });
  });

  it('gates: worker no asigna ni desasigna (403 CATALOG_WRITE del caso de uso)', async () => {
    writeTokens(TOKENS.operario);
    const api = createAssignmentsApi();

    const assignFailure = await expectApiError(
      api.assign({
        workerId: DEMO_SEED_IDS.operario,
        machineId: DEMO_SEED_IDS.mezcladora,
        slot: { daysOfWeek: [5], start: '20:00', end: '22:00' },
      }),
    );
    expect(assignFailure.statusCode).toBe(403);
    expect(assignFailure.context).toStrictEqual({
      role: 'worker',
      useCase: 'AssignWorkerToMachine',
    });

    const unassignFailure = await expectApiError(api.unassign(DEMO_SEED_IDS.asignacionOperario));
    expect(unassignFailure.statusCode).toBe(403);
    expect(unassignFailure.context).toStrictEqual({ role: 'worker', useCase: 'UnassignWorker' });
  });

  it('unassign borra de verdad (204) y un id desconocido da 404', async () => {
    writeTokens(TOKENS.admin);
    const api = createAssignmentsApi();

    await expect(api.unassign(DEMO_SEED_IDS.asignacionOperario)).resolves.toBeUndefined();
    expect(await api.workerSchedule(DEMO_SEED_IDS.operario)).toStrictEqual([]);

    const missing = await expectApiError(api.unassign(DEMO_SEED_IDS.asignacionOperario));
    expect(missing.statusCode).toBe(404);
    expect(missing.context).toStrictEqual({
      entity: 'Assignment',
      id: DEMO_SEED_IDS.asignacionOperario,
    });
  });
});
