import type { DayOfWeek } from '@fabrik/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ACCESS_TOKEN_PREFIX, DEMO_REFRESH_TOKEN_PREFIX } from '@/lib/api/demo/auth';
import { loadDb, resetDb, saveDb } from '@/lib/api/demo/db';
import { DEMO_SEED_IDS } from '@/lib/api/demo/seed';
import { ApiError } from '@/lib/api/errors';
import { createAssignmentsApi } from '@/lib/api/modules/assignmentsApi';
import { createMeApi } from '@/lib/api/modules/meApi';
import type { TimeSlotWire } from '@/lib/api/types';
import { writeTokens } from '@/lib/session/session-store';

/**
 * `GET /me/schedule` sobre el **runtime demo** (docs/demo.md §4):
 * **lectura de apoyo** sin caso de uso propio — el módulo replica el armado del
 * `MeController` real con las piezas de `ctx`:
 *
 * - agenda propia vía `ListWorkerSchedule` (cualquier rol autenticado);
 * - máquina enriquecida con **una sola** lectura del repositorio de máquinas
 *   (`machine: null` si el dato estuviera huérfano — el contrato lo admite);
 * - `activeNow = slot.contains(now)` con **un solo** `ctx.clock()` para todos
 *   los ítems (en la API es el reloj del servidor, fuente de verdad de I3).
 *
 * La determinidad de las franjas frente al reloj real: la jornada completa
 * sembrada deja `activeNow: true` siempre; el caso `false` usa un día que
 * **no** es el de hoy (`getDay()` del propio test), así que no depende de la
 * hora local de la corrida.
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

beforeEach(() => {
  window.sessionStorage.clear();
  resetDb();
});

describe('meApi (demo) — schedule', () => {
  it('operario: asignación sembrada + máquina enriquecida + activeNow true (jornada completa)', async () => {
    writeTokens(TOKENS.operario);
    const schedule = await createMeApi().schedule();

    expect(schedule).toStrictEqual([
      {
        id: DEMO_SEED_IDS.asignacionOperario,
        workerId: DEMO_SEED_IDS.operario,
        machineId: DEMO_SEED_IDS.mezcladora,
        slot: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '24:00' },
        // La máquina sale del catálogo (una sola lectura, igual que el controlador).
        machine: {
          id: DEMO_SEED_IDS.mezcladora,
          name: 'Mezcladora',
          type: 'mixer',
          locationId: DEMO_SEED_IDS.produccion,
          status: 'idle',
        },
        // Franja 00:00–24:00 los 7 días: cubre el reloj local a cualquier hora.
        activeNow: true,
      },
    ]);
  });

  it('un rol sin agenda devuelve vacía (el contrato es uniforme para todos los roles)', async () => {
    writeTokens(TOKENS.admin);
    await expect(createMeApi().schedule()).resolves.toStrictEqual([]);
  });

  it('sin sesión → 401 (la única vía de fallo del endpoint real)', async () => {
    const failure = await expectApiError(createMeApi().schedule());
    expect(failure.statusCode).toBe(401);
    expect(failure.error).toBe('Unauthorized');
  });

  it('máquina huérfana (dato manipulado) → machine: null, como admite el contrato', async () => {
    writeTokens(TOKENS.auditor);
    const data = loadDb();
    const orphanSlot: TimeSlotWire = {
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      start: '00:00',
      end: '24:00',
    };
    saveDb({
      ...data,
      assignments: [
        ...data.assignments,
        { id: 'asg-orfan', workerId: DEMO_SEED_IDS.auditor, machineId: 'maq-no', slot: orphanSlot },
      ],
    });

    const schedule = await createMeApi().schedule();
    expect(schedule).toStrictEqual([
      {
        id: 'asg-orfan',
        workerId: DEMO_SEED_IDS.auditor,
        machineId: 'maq-no',
        slot: orphanSlot,
        machine: null,
        activeNow: true,
      },
    ]);
  });

  it('activeNow false cuando la franja no cubre el día de hoy (contraste determinista)', async () => {
    // El auditor tiene login del seed (users.id === workers.id): se le asigna
    // una franja del día siguiente y su agenda consulta por SU sesión.
    writeTokens(TOKENS.admin);
    const tomorrow = ((new Date().getDay() + 1) % 7) as DayOfWeek;
    const slot: TimeSlotWire = { daysOfWeek: [tomorrow], start: '00:00', end: '24:00' };
    const created = await createAssignmentsApi().assign({
      workerId: DEMO_SEED_IDS.auditor,
      machineId: DEMO_SEED_IDS.mezcladora,
      slot,
    });

    writeTokens(TOKENS.auditor);
    const me = createMeApi();
    const item = (await me.schedule()).find((candidate) => candidate.id === created.id);
    expect(item).toStrictEqual({
      ...created,
      machine: {
        id: DEMO_SEED_IDS.mezcladora,
        name: 'Mezcladora',
        type: 'mixer',
        locationId: DEMO_SEED_IDS.produccion,
        status: 'idle',
      },
      activeNow: false,
    });

    // Contraste con el seed: la jornada completa del operario sigue `true`
    // ante el mismo reloj del runtime (mismo `now` por llamada, como el
    // `MeController`; su agenda vive bajo la sesión del operario).
    writeTokens(TOKENS.operario);
    const operarioItem = (await me.schedule()).find(
      (candidate) => candidate.id === DEMO_SEED_IDS.asignacionOperario,
    );
    expect(operarioItem?.activeNow).toBe(true);
  });
});
