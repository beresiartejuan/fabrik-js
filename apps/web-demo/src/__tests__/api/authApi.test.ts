import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ACCESS_TOKEN_PREFIX, DEMO_REFRESH_TOKEN_PREFIX } from '@/lib/api/demo/auth';
import { loadDb, resetDb, saveDb } from '@/lib/api/demo/db';
import { DEMO_SEED_IDS } from '@/lib/api/demo/seed';
import { ApiError } from '@/lib/api/errors';
import { createAuthApi } from '@/lib/api/modules/authApi';
import { createLocationsApi } from '@/lib/api/modules/locationsApi';
import { createWorkersApi } from '@/lib/api/modules/workersApi';
import { readTokens, writeTokens } from '@/lib/session/session-store';

/**
 * Flujo de auth sobre el **core demo** (`demo/auth.ts`, docs/11-plan-demo.md
 * §5): misma forma de sesión que la API real (`AuthTokensWire` + `ActorWire`),
 * tokens opacos deterministas y **rol fresco en cada llamada** (parity del
 * `ActorGuard`: el rol sale de la fila del worker, no del token).
 *
 * La UI no cambia por el runtime: el 401 llega como `ApiError.hasStatus(401)`
 * (la pantalla de login muestra «Nombre o contraseña incorrectos.») y
 * `logout()` resuelve (204) dejando la limpieza local en el caller.
 */

function tokensFor(userId: string): { accessToken: string; refreshToken: string } {
  return {
    accessToken: `${DEMO_ACCESS_TOKEN_PREFIX}${userId}`,
    refreshToken: `${DEMO_REFRESH_TOKEN_PREFIX}${userId}`,
  };
}

const TOKENS = {
  admin: tokensFor(DEMO_SEED_IDS.admin),
  operario: tokensFor(DEMO_SEED_IDS.operario),
  auditor: tokensFor(DEMO_SEED_IDS.auditor),
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

describe('authApi (demo) — login/refresh', () => {
  it('login con credenciales del seed → AuthTokensWire completo (par opaco determinista)', async () => {
    const tokens = await createAuthApi().login('admin', 'admin');

    expect(tokens).toStrictEqual({
      accessToken: `${DEMO_ACCESS_TOKEN_PREFIX}${DEMO_SEED_IDS.admin}`,
      refreshToken: `${DEMO_REFRESH_TOKEN_PREFIX}${DEMO_SEED_IDS.admin}`,
      tokenType: 'Bearer',
      expiresIn: 900,
    });
  });

  it('login los tres roles del seed autentican (admin/operario/auditor)', async () => {
    const api = createAuthApi();
    await expect(api.login('operario', 'operario')).resolves.toStrictEqual({
      ...TOKENS.operario,
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    await expect(api.login('auditor', 'auditor')).resolves.toStrictEqual({
      ...TOKENS.auditor,
      tokenType: 'Bearer',
      expiresIn: 900,
    });
  });

  it('login credenciales inválidas y usuario desconocido producen el MISMO 401 (sin delatar)', async () => {
    const api = createAuthApi();

    for (const [name, password] of [
      ['admin', 'admin123'],
      ['nadie', 'x'],
    ] as const) {
      const failure = await expectApiError(api.login(name, password));
      expect(failure.statusCode).toBe(401);
      expect(failure.error).toBe('Unauthorized');
      expect(failure.message).toBe('Credenciales inválidas');
      expect(failure.context).toBeUndefined();
      // La pantalla de login decide por status, no por mensaje.
      expect(failure.hasStatus(401)).toBe(true);
    }
  });

  it('login worker inactivo no autentica (users.id === workers.id)', async () => {
    // Dar de baja al operario directo en la base (los módulos exigen una sesión
    // para hacerlo por use case: la baja es manipulación de datos de test).
    const data = loadDb();
    saveDb({
      ...data,
      workers: data.workers.map((worker) =>
        worker.id === DEMO_SEED_IDS.operario ? { ...worker, active: false } : worker,
      ),
    });

    const failure = await expectApiError(createAuthApi().login('operario', 'operario'));
    expect(failure.statusCode).toBe(401);
    expect(failure.error).toBe('Unauthorized');
    expect(failure.message).toBe('El worker está inactivo');
  });

  it('refresh rota el par (tokens válidos) y rechaza formas ajenas o desconocidas', async () => {
    const api = createAuthApi();

    await expect(api.refresh(TOKENS.admin.refreshToken)).resolves.toStrictEqual({
      ...TOKENS.admin,
      tokenType: 'Bearer',
      expiresIn: 900,
    });

    for (const badToken of ['pepe', 'demo-access.usr-admin', 'demo-refresh.']) {
      const failure = await expectApiError(api.refresh(badToken));
      expect(failure.statusCode).toBe(401);
      expect(failure.error).toBe('Unauthorized');
      expect(failure.message).toBe('Refresh token inválido');
    }
  });
});

describe('authApi (demo) — me con rol fresco', () => {
  it('me resuelve el ActorWire de la sesión (guard del backend → actor del token)', async () => {
    writeTokens(TOKENS.admin);
    await expect(createAuthApi().me()).resolves.toStrictEqual({
      workerId: DEMO_SEED_IDS.admin,
      role: 'admin',
    });
  });

  it('sin sesión (token ausente) → 401 con el mensaje del núcleo demo', async () => {
    const failure = await expectApiError(createAuthApi().me());
    expect(failure.statusCode).toBe(401);
    expect(failure.error).toBe('Unauthorized');
    expect(failure.message).toBe('Token de acceso inválido');
  });

  it('rol FRESCO: un UpdateWorker se ve en la próxima me() (parity ActorGuard)', async () => {
    writeTokens(TOKENS.admin);
    const workers = createWorkersApi();
    await workers.update(DEMO_SEED_IDS.operario, { role: 'admin' });

    // El token del operario lleva solo el id: el rol se lee de la fila al llamar.
    writeTokens(TOKENS.operario);
    await expect(createAuthApi().me()).resolves.toStrictEqual({
      workerId: DEMO_SEED_IDS.operario,
      role: 'admin',
    });
  });

  it('worker inactivo después del login → 401 en me() (parity ActorGuard)', async () => {
    writeTokens(TOKENS.admin);
    await createWorkersApi().deactivate(DEMO_SEED_IDS.operario);

    writeTokens(TOKENS.operario);
    const failure = await expectApiError(createAuthApi().me());
    expect(failure.statusCode).toBe(401);
    expect(failure.message).toBe('Worker inexistente o inactivo');
  });
});

describe('authApi (demo) — logout y flujo de sesión', () => {
  it('logout resuelve (204 demo, no-op: no hay storage de revocación)', async () => {
    writeTokens(TOKENS.admin);
    await expect(createAuthApi().logout()).resolves.toBeUndefined();
    // La limpieza local la hace el caller (SessionProvider.signOut), igual que hoy.
    expect(readTokens()).toStrictEqual(TOKENS.admin);
  });

  it('flujo completo: login → sesión → me → lectura de catálogo con el mismo runtime', async () => {
    const api = createAuthApi();
    const tokens = await api.login('admin', 'admin');
    writeTokens(tokens);

    expect(await api.me()).toStrictEqual({ workerId: DEMO_SEED_IDS.admin, role: 'admin' });

    // Un módulo de dominio resuelve el actor del MISMO token (rol fresco) y
    // ejecuta el caso de uso real: A/Au lee los lugares sembrados.
    const locations = await createLocationsApi().list();
    expect(locations.map((location) => location.id)).toStrictEqual([
      DEMO_SEED_IDS.almacen,
      DEMO_SEED_IDS.produccion,
    ]);
  });
});
