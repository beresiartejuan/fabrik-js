import {
  type AxiosAdapter,
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type TokenStorage } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { AuthTokensWire } from '@/lib/api/types';

function memoryStorage(
  initial: { accessToken: string; refreshToken: string } | null = null,
): TokenStorage & { save: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> } {
  let current = initial;
  return {
    read: () => current,
    save: vi.fn((tokens: { accessToken: string; refreshToken: string }) => {
      current = tokens;
    }),
    clear: vi.fn(() => {
      current = null;
    }),
  };
}

function ok<T>(data: T, config: InternalAxiosRequestConfig): AxiosResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {}, config };
}

function unauthorized(config: InternalAxiosRequestConfig): never {
  throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
    data: { statusCode: 401, error: 'UnauthorizedError', message: 'no autorizado' },
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config,
  });
}

function header(config: InternalAxiosRequestConfig, name: string): string | undefined {
  const headers = config.headers as unknown as { get?: (key: string) => unknown };
  const value = typeof headers.get === 'function' ? headers.get(name) : undefined;
  return typeof value === 'string' ? value : undefined;
}

const NEW_TOKENS: AuthTokensWire = {
  accessToken: 'new-access',
  refreshToken: 'new-refresh',
  tokenType: 'Bearer',
  expiresIn: 900,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('request interceptor', () => {
  it('inyecta el Bearer del access token de la sesión', async () => {
    const storage = memoryStorage({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    let seen: string | undefined;
    const adapter: AxiosAdapter = async (config) => {
      seen = header(config, 'Authorization');
      return ok({ ok: true }, config);
    };

    const client = createApiClient({ storage, refresh: vi.fn(), adapter });
    await client.get('/materials');

    expect(seen).toBe('Bearer access-1');
  });

  it('no añade Authorization si no hay tokens', async () => {
    const storage = memoryStorage(null);
    let seen: string | undefined;
    const adapter: AxiosAdapter = async (config) => {
      seen = header(config, 'Authorization');
      return ok({ ok: true }, config);
    };

    const client = createApiClient({ storage, refresh: vi.fn(), adapter });
    await client.get('/materials');

    expect(seen).toBeUndefined();
  });
});

describe('response interceptor: refresh single-flight', () => {
  it('dos 401 concurrentes comparten UN refresh y se reintentan con el token nuevo', async () => {
    const storage = memoryStorage({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    const refresh = vi.fn(async () => NEW_TOKENS);
    let retriedWithNewToken = 0;

    const adapter: AxiosAdapter = async (config) => {
      if (header(config, 'Authorization') === 'Bearer new-access') {
        retriedWithNewToken += 1;
        return ok({ ok: true }, config);
      }
      return unauthorized(config);
    };

    const client = createApiClient({ storage, refresh, adapter });
    const [first, second] = await Promise.all([client.get('/materials'), client.get('/workers')]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('old-refresh');
    expect(retriedWithNewToken).toBe(2);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.save).toHaveBeenCalledWith({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
  });

  it('un 401 posterior al refresh vuelve a refrescar (el single-flight se libera)', async () => {
    const storage = memoryStorage({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    const refresh = vi.fn(async () => NEW_TOKENS);
    // Siempre 401: obliga a un refresh por petición y comprueba que la promesa
    // compartida se libera al terminar (el reintento lleva `_retry`).
    const adapter: AxiosAdapter = async (config) => unauthorized(config);

    const client = createApiClient({ storage, refresh, adapter, onRefreshFailure: vi.fn() });
    await expect(client.get('/materials')).rejects.toBeInstanceOf(ApiError);
    await expect(client.get('/workers')).rejects.toBeInstanceOf(ApiError);

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('si el refresh falla limpia la sesión y redirige a /login', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });

    const storage = memoryStorage({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    const refresh = vi.fn(async () => {
      throw new AxiosError('refresh expirado', 'ERR_BAD_REQUEST');
    });
    const adapter: AxiosAdapter = async (config) => unauthorized(config);

    const client = createApiClient({ storage, refresh, adapter });

    await expect(client.get('/materials')).rejects.toBeInstanceOf(ApiError);
    await expect(client.get('/workers')).rejects.toBeInstanceOf(ApiError);

    expect(storage.clear).toHaveBeenCalledTimes(2);
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('si no hay refresh token no intenta refrescar y falla la sesión', async () => {
    const onRefreshFailure = vi.fn();
    const storage = memoryStorage({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    // Simula un refresh token ausente justo al recibir el 401.
    storage.read = () => ({ accessToken: 'old-access', refreshToken: '' });
    const refresh = vi.fn(async () => NEW_TOKENS);
    const adapter: AxiosAdapter = async (config) => unauthorized(config);

    const client = createApiClient({ storage, refresh, adapter, onRefreshFailure });

    await expect(client.get('/materials')).rejects.toBeInstanceOf(ApiError);
    expect(refresh).not.toHaveBeenCalled();
    expect(onRefreshFailure).toHaveBeenCalledTimes(1);
  });
});

describe('response interceptor: no reintenta endpoints de auth', () => {
  it('un 401 en /auth/login no dispara refresh', async () => {
    const storage = memoryStorage({ accessToken: 'a', refreshToken: 'r' });
    const refresh = vi.fn();
    const onRefreshFailure = vi.fn();
    const adapter: AxiosAdapter = async (config) => unauthorized(config);

    const client = createApiClient({ storage, refresh, adapter, onRefreshFailure });
    await expect(client.post('/auth/login', { name: 'x', password: 'y' })).rejects.toBeInstanceOf(
      ApiError,
    );

    expect(refresh).not.toHaveBeenCalled();
    expect(onRefreshFailure).not.toHaveBeenCalled();
  });

  it('un 401 en /auth/refresh no dispara otro refresh ni logout', async () => {
    const storage = memoryStorage({ accessToken: 'a', refreshToken: 'r' });
    const refresh = vi.fn();
    const onRefreshFailure = vi.fn();
    const adapter: AxiosAdapter = async (config) => unauthorized(config);

    const client = createApiClient({ storage, refresh, adapter, onRefreshFailure });
    await expect(client.post('/auth/refresh', { refreshToken: 'r' })).rejects.toBeInstanceOf(
      ApiError,
    );

    expect(refresh).not.toHaveBeenCalled();
    expect(onRefreshFailure).not.toHaveBeenCalled();
  });
});

describe('response interceptor: normalización', () => {
  it('normaliza errores no-401 a ApiError con el cuerpo del servidor', async () => {
    const refresh = vi.fn();
    const adapter: AxiosAdapter = async (config) => {
      throw new AxiosError('Forbidden', 'ERR_BAD_REQUEST', config, undefined, {
        data: { statusCode: 403, error: 'UnauthorizedRoleError', message: 'sin permisos' },
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config,
      });
    };

    const client = createApiClient({ storage: memoryStorage(), refresh, adapter });
    const error = await client.get('/materials').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ statusCode: 403, error: 'UnauthorizedRoleError' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('normaliza errores de red (sin response) marcándolos como NetworkError', async () => {
    const adapter: AxiosAdapter = async () => {
      throw new AxiosError('Network Error', 'ERR_NETWORK');
    };

    const client = createApiClient({ storage: memoryStorage(), refresh: vi.fn(), adapter });
    const error = await client.get('/materials').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ statusCode: 0, error: 'NetworkError', isNetworkError: true });
  });
});
