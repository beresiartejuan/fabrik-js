import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@/lib/api/client';
import { createStockApi } from '@/lib/api/modules/stockApi';

/**
 * Contrato de `stockApi` contra `apps/api/src/stock/{stock.controller.ts,stock.dto.ts}`
 * (Fase 5): `GET /stock/:locationId` (A/Au/W, sin query) y
 * `GET /stock/:locationId/movements` (A/Au) con `?materialId=` opcional — la
 * query solo viaja si hay filtro, igual que en `batchesApi`.
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

describe('stock: contrato de API', () => {
  it('byLocation usa GET /stock/:locationId sin query', async () => {
    const { calls, client } = setup();
    await createStockApi(client).byLocation('loc-1');
    expect(calls).toEqual([
      { method: 'get', url: '/stock/loc-1', params: undefined, body: undefined },
    ]);
  });

  it('movements usa GET /stock/:locationId/movements con el filtro de material', async () => {
    const { calls, client } = setup();
    const api = createStockApi(client);

    await api.movements('loc-1', 'mat-1');
    await api.movements('loc-1');

    expect(calls).toEqual([
      {
        method: 'get',
        url: '/stock/loc-1/movements',
        params: { materialId: 'mat-1' },
        body: undefined,
      },
      { method: 'get', url: '/stock/loc-1/movements', params: undefined, body: undefined },
    ]);
  });
});
