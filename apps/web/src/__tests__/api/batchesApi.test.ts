import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@/lib/api/client';
import { createBatchesApi } from '@/lib/api/modules/batchesApi';

/**
 * Contrato de `batchesApi` contra `apps/api/src/batches/{batches.controller.ts,batches.dto.ts}`
 * (gap del plan ya resuelto; `docs/10-plan-de-web.md` §Fase 4). Listar y leer
 * lotes es A/Au/W; los filtros son opcionales.
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

describe('batches: contrato de API', () => {
  it('list sin filtros no envía params', async () => {
    const { calls, client } = setup();
    await createBatchesApi(client).list();
    expect(calls).toEqual([{ method: 'get', url: '/batches', params: undefined, body: undefined }]);
  });

  it('list envía todos los filtros declarados (status, materialId, recipeId, originBatchEventId)', async () => {
    const { calls, client } = setup();
    const api = createBatchesApi(client);

    await api.list({ status: 'in_progress' });
    await api.list({ materialId: 'm1' });
    await api.list({ recipeId: 'r1', originBatchEventId: 'e1' });

    expect(calls).toEqual([
      { method: 'get', url: '/batches', params: { status: 'in_progress' }, body: undefined },
      { method: 'get', url: '/batches', params: { materialId: 'm1' }, body: undefined },
      {
        method: 'get',
        url: '/batches',
        params: { recipeId: 'r1', originBatchEventId: 'e1' },
        body: undefined,
      },
    ]);
  });

  it('get usa GET /batches/:id', async () => {
    const { calls, client } = setup();
    await createBatchesApi(client).get('b1');
    expect(calls).toEqual([
      { method: 'get', url: '/batches/b1', params: undefined, body: undefined },
    ]);
  });
});
