import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@/lib/api/client';
import { createAuthApi } from '@/lib/api/modules/authApi';
import type { ActorWire, AuthTokensWire } from '@/lib/api/types';

interface Call {
  method?: string;
  url?: string;
  body: unknown;
}

function ok<T>(data: T, config: InternalAxiosRequestConfig): AxiosResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {}, config };
}

function setup() {
  const calls: Call[] = [];
  const adapter: AxiosAdapter = async (config) => {
    calls.push({
      method: config.method,
      url: config.url,
      body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    });
    if (config.url === '/auth/me') {
      const actor: ActorWire = { workerId: 'w1', role: 'admin' };
      return ok(actor, config);
    }
    if (config.url === '/auth/logout') {
      return { data: undefined, status: 204, statusText: 'No Content', headers: {}, config };
    }
    const tokens: AuthTokensWire = {
      accessToken: 'a',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresIn: 900,
    };
    return ok(tokens, config);
  };

  const client = createApiClient({ adapter, refresh: vi.fn() });
  return { api: createAuthApi(client), calls };
}

describe('authApi', () => {
  it('login hace POST /auth/login con name+password', async () => {
    const { api, calls } = setup();
    await api.login('admin', 'admin123');

    expect(calls).toEqual([
      { method: 'post', url: '/auth/login', body: { name: 'admin', password: 'admin123' } },
    ]);
  });

  it('refresh hace POST /auth/refresh con refreshToken', async () => {
    const { api, calls } = setup();
    await api.refresh('refresh-1');

    expect(calls).toEqual([
      { method: 'post', url: '/auth/refresh', body: { refreshToken: 'refresh-1' } },
    ]);
  });

  it('logout hace POST /auth/logout', async () => {
    const { api, calls } = setup();
    await api.logout();

    expect(calls).toEqual([{ method: 'post', url: '/auth/logout', body: undefined }]);
  });

  it('me hace GET /auth/me y devuelve el actor', async () => {
    const { api, calls } = setup();
    await expect(api.me()).resolves.toEqual({ workerId: 'w1', role: 'admin' });
    expect(calls).toEqual([{ method: 'get', url: '/auth/me', body: undefined }]);
  });
});
