import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@/lib/api/client';
import { createRecipesApi } from '@/lib/api/modules/recipesApi';

/**
 * Contrato de `recipesApi` contra `apps/api/src/recipes/recipes.dto.ts`
 * (docs/10-plan-de-web.md §Fase 2): rutas, filtro y forma exacta del body.
 * `PATCH` con `steps` envía la lista completa (no un merge por posición).
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
      data: {},
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

const STEP = {
  position: 1,
  machineType: 'mixer',
  inputs: [{ materialId: 'm-harina', quantity: { amount: 2, unit: 'kg' as const } }],
  outputProductId: 'm-masa',
  outputQuantity: { amount: 2, unit: 'kg' as const },
};

describe('recipes: contrato de API', () => {
  it('list envía outputProductId solo si se filtra', async () => {
    const { calls, client } = setup();
    const api = createRecipesApi(client);

    await api.list();
    await api.list({ outputProductId: 'm-pan' });

    expect(calls).toEqual([
      { method: 'get', url: '/recipes', params: undefined, body: undefined },
      { method: 'get', url: '/recipes', params: { outputProductId: 'm-pan' }, body: undefined },
    ]);
  });

  it('get usa GET /recipes/:id', async () => {
    const { calls, client } = setup();
    await createRecipesApi(client).get('r1');
    expect(calls).toEqual([
      { method: 'get', url: '/recipes/r1', params: undefined, body: undefined },
    ]);
  });

  it('create envía name, producto, cantidad y steps con inputs anidados', async () => {
    const { calls, client } = setup();
    const body = {
      name: 'Pan artesanal',
      outputProductId: 'm-pan',
      outputQuantity: { amount: 1, unit: 'unit' as const },
      steps: [STEP],
    };

    await createRecipesApi(client).create(body);

    expect(calls).toEqual([{ method: 'post', url: '/recipes', params: undefined, body }]);
  });

  it('update usa PATCH y reemplaza steps (lista completa)', async () => {
    const { calls, client } = setup();
    const body = {
      name: 'Pan integral',
      outputProductId: 'm-pan',
      outputQuantity: { amount: 12, unit: 'unit' as const },
      steps: [STEP, { ...STEP, position: 2, machineType: 'oven', outputProductId: 'm-pan' }],
    };

    await createRecipesApi(client).update('r1', body);

    expect(calls).toEqual([{ method: 'patch', url: '/recipes/r1', params: undefined, body }]);
  });
});
