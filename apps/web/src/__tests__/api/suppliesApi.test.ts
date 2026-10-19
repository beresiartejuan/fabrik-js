import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@/lib/api/client';
import { createSuppliesApi } from '@/lib/api/modules/suppliesApi';

/**
 * Contrato de `suppliesApi` contra `apps/api/src/supplies/supplies.controller.ts`
 * (docs/pantallas.md §Fase 4): `POST /supplies/arrivals` con
 * `{ materialId, quantity: { amount, unit }, locationId }` y respuesta 201 con el
 * lote `stored` creado.
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
      data: { id: 'batch-1', status: 'stored' },
      status: 201,
      statusText: 'Created',
      headers: {},
      config: config as InternalAxiosRequestConfig,
    };
    return response;
  };
  const client = createApiClient({ adapter, refresh: vi.fn() });
  return { calls, client };
}

describe('supplies: contrato de API', () => {
  it('arrive envía el body exacto y devuelve el lote creado', async () => {
    const { calls, client } = setup();
    const api = createSuppliesApi(client);

    const batch = await api.arrive({
      materialId: 'm-harina',
      quantity: { amount: 250, unit: 'kg' },
      locationId: 'l-almacen',
    });

    expect(calls).toEqual([
      {
        method: 'post',
        url: '/supplies/arrivals',
        params: undefined,
        body: {
          materialId: 'm-harina',
          quantity: { amount: 250, unit: 'kg' },
          locationId: 'l-almacen',
        },
      },
    ]);
    expect(batch).toMatchObject({ id: 'batch-1', status: 'stored' });
  });
});
