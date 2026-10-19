import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEMO_ACCESS_TOKEN_PREFIX,
  DEMO_ACCESS_TTL_SECONDS,
  DEMO_REFRESH_TOKEN_PREFIX,
  DemoUnauthorizedError,
  login,
  me,
  refresh,
} from '@/lib/api/demo/auth';
import { loadDb, saveDb } from '@/lib/api/demo/db';
import { DEMO_SEED_IDS, DEMO_SEED_USERS } from '@/lib/api/demo/seed';

/**
 * Auth del runtime DEMO (login/refresh/me sobre la base de `sessionStorage`):
 * paridad de comportamiento con `apps/api/src/auth` — credenciales planas,
 * tokens opacos del demo, rotación de refresh y **rol fresco** en `me`
 * (el guard del backend recarga el worker en cada request).
 */

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('login', () => {
  it('acepta las contraseñas en claro de los 3 usuarios del seed', async () => {
    for (const user of DEMO_SEED_USERS) {
      await expect(login(user.name, user.password)).resolves.toEqual({
        accessToken: `${DEMO_ACCESS_TOKEN_PREFIX}${user.id}`,
        refreshToken: `${DEMO_REFRESH_TOKEN_PREFIX}${user.id}`,
        tokenType: 'Bearer',
        expiresIn: DEMO_ACCESS_TTL_SECONDS,
      });
    }
  });

  it('los tokens tienen la forma opaca del demo (prefijos exportados)', async () => {
    const tokens = await login('admin', 'admin');
    expect(DEMO_ACCESS_TOKEN_PREFIX).toBe('demo-access.');
    expect(DEMO_REFRESH_TOKEN_PREFIX).toBe('demo-refresh.');
    expect(tokens.accessToken.startsWith(DEMO_ACCESS_TOKEN_PREFIX)).toBe(true);
    expect(tokens.refreshToken.startsWith(DEMO_REFRESH_TOKEN_PREFIX)).toBe(true);
    // Vida nominal igual al default real (15 minutos).
    expect(tokens.expiresIn).toBe(900);
  });

  it('contraseña incorrecta → DemoUnauthorizedError con el mensaje genérico', async () => {
    await expect(login('admin', 'otra-clave')).rejects.toStrictEqual(
      new DemoUnauthorizedError('Credenciales inválidas'),
    );
    await expect(login('operario', '')).rejects.toBeInstanceOf(DemoUnauthorizedError);
  });

  it('usuario desconocido → el mismo error (no se delata si existe)', async () => {
    await expect(login('fantasma', 'fantasma')).rejects.toStrictEqual(
      new DemoUnauthorizedError('Credenciales inválidas'),
    );
  });

  it('worker inactivo → error de auth (paridad del servicio real)', async () => {
    // El admin da de baja al auditor (lo que haría `DeactivateWorker`).
    const data = loadDb();
    saveDb({
      ...data,
      workers: data.workers.map((worker) =>
        worker.id === DEMO_SEED_IDS.auditor ? { ...worker, active: false } : worker,
      ),
    });
    await expect(login('auditor', 'auditor')).rejects.toStrictEqual(
      new DemoUnauthorizedError('El worker está inactivo'),
    );
  });
});

describe('refresh', () => {
  it('rota el par ante un refresh token del demo válido', async () => {
    const loginTokens = await login('operario', 'operario');
    await expect(refresh(loginTokens.refreshToken)).resolves.toEqual({
      accessToken: `${DEMO_ACCESS_TOKEN_PREFIX}${DEMO_SEED_IDS.operario}`,
      refreshToken: `${DEMO_REFRESH_TOKEN_PREFIX}${DEMO_SEED_IDS.operario}`,
      tokenType: 'Bearer',
      expiresIn: DEMO_ACCESS_TTL_SECONDS,
    });
  });

  it('refresh con la forma de access token → rechazado', async () => {
    await expect(
      refresh(`${DEMO_ACCESS_TOKEN_PREFIX}${DEMO_SEED_IDS.admin}`),
    ).rejects.toBeInstanceOf(DemoUnauthorizedError);
  });

  it('forma ajena o usuario desconocido → rechazado', async () => {
    await expect(refresh('')).rejects.toBeInstanceOf(DemoUnauthorizedError);
    await expect(refresh('no-fue-token')).rejects.toBeInstanceOf(DemoUnauthorizedError);
    await expect(refresh(`${DEMO_REFRESH_TOKEN_PREFIX}usr-fantasma`)).rejects.toStrictEqual(
      new DemoUnauthorizedError('Refresh token inválido'),
    );
  });

  it('worker inactivo → rechazado (paridad: el refresh recarga el worker)', async () => {
    const data = loadDb();
    saveDb({
      ...data,
      workers: data.workers.map((worker) =>
        worker.id === DEMO_SEED_IDS.operario ? { ...worker, active: false } : worker,
      ),
    });
    await expect(
      refresh(`${DEMO_REFRESH_TOKEN_PREFIX}${DEMO_SEED_IDS.operario}`),
    ).rejects.toStrictEqual(new DemoUnauthorizedError('El worker está inactivo'));
  });
});

describe('me (rol fresco, paridad del ActorGuard)', () => {
  it('resuelve el actor desde el access token', async () => {
    await expect(me(`${DEMO_ACCESS_TOKEN_PREFIX}${DEMO_SEED_IDS.admin}`)).resolves.toEqual({
      workerId: DEMO_SEED_IDS.admin,
      role: 'admin',
    });
    await expect(me(`${DEMO_ACCESS_TOKEN_PREFIX}${DEMO_SEED_IDS.operario}`)).resolves.toEqual({
      workerId: DEMO_SEED_IDS.operario,
      role: 'worker',
    });
  });

  it('el rol se lee FRESCO de la fila del worker: un cambio de rol se refleja', async () => {
    const token = `${DEMO_ACCESS_TOKEN_PREFIX}${DEMO_SEED_IDS.operario}`;
    await expect(me(token)).resolves.toEqual({
      workerId: DEMO_SEED_IDS.operario,
      role: 'worker',
    });

    // Lo que haría `UpdateWorker` (rol del worker actualizado: la fila "usuario"
    // del seed queda atrás a propósito — la fuente del guard es el worker).
    const data = loadDb();
    saveDb({
      ...data,
      workers: data.workers.map((worker) =>
        worker.id === DEMO_SEED_IDS.operario ? { ...worker, role: 'auditor' } : worker,
      ),
    });
    await expect(me(token)).resolves.toEqual({
      workerId: DEMO_SEED_IDS.operario,
      role: 'auditor',
    });
  });

  it('worker inexistente o inactivo → error de auth (401 en la capa de módulos)', async () => {
    const data = loadDb();
    saveDb({
      ...data,
      workers: data.workers.filter((worker) => worker.id !== DEMO_SEED_IDS.auditor),
    });
    await expect(me(`${DEMO_ACCESS_TOKEN_PREFIX}${DEMO_SEED_IDS.auditor}`)).rejects.toStrictEqual(
      new DemoUnauthorizedError('Worker inexistente o inactivo'),
    );
  });

  it('forma inválida del token → rechazado', async () => {
    await expect(me('')).rejects.toBeInstanceOf(DemoUnauthorizedError);
    await expect(me('garbage')).rejects.toBeInstanceOf(DemoUnauthorizedError);
    // Un refresh token NO sirve como access token (el guard exige access).
    await expect(me(`${DEMO_REFRESH_TOKEN_PREFIX}${DEMO_SEED_IDS.admin}`)).rejects.toBeInstanceOf(
      DemoUnauthorizedError,
    );
  });
});
