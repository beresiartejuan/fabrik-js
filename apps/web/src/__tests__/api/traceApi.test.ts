import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@/lib/api/client';
import { createTraceApi } from '@/lib/api/modules/traceApi';

/**
 * Contrato de `traceApi` contra `apps/api/src/trace/trace.controller.ts`
 * (Fase 6): `GET /trace/:batchId` (backwards) y `GET /trace/:batchId/forward`
 * (recall), ambos A/Au y sin query params.
 */

interface Call {
  method?: string;
  url?: string;
  params: unknown;
  body: unknown;
}

function setup() {
  const calls: Call[] = [];
  const adapter: AxiosAdapter = async (config) => {
    calls.push({
      method: config.method,
      url: config.url,
      params: config.params,
      body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    });
    const response: AxiosResponse = {
      data: [],
      status: 200,
      statusText: 'OK',
      headers: {},
      config: config as InternalAxiosRequestConfig,
    };
    return response;
  };
  const client = createApiClient({ adapter, refresh: vi.fn() });
  return { calls, client };
}

describe('trace: contrato de API', () => {
  it('backward usa GET /trace/:batchId sin query', async () => {
    const { calls, client } = setup();
    await createTraceApi(client).backward('b-1');
    expect(calls).toEqual([
      { method: 'get', url: '/trace/b-1', params: undefined, body: undefined },
    ]);
  });

  it('forward usa GET /trace/:batchId/forward sin query', async () => {
    const { calls, client } = setup();
    await createTraceApi(client).forward('b-1');
    expect(calls).toEqual([
      { method: 'get', url: '/trace/b-1/forward', params: undefined, body: undefined },
    ]);
  });
});
