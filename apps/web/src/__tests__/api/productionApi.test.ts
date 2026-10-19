import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@/lib/api/client';
import { createProductionApi } from '@/lib/api/modules/productionApi';

/**
 * Contrato de `productionApi` contra `apps/api/src/production/{production.controller.ts,production.dto.ts}`
 * (docs/pantallas.md §Fase 4). Dos decisiones de seguridad del body:
 * el `workerId` va **del actor** (nunca en el body) y el `timestamp` del
 * cliente no se envía (en producción la API lo descarta).
 */

interface Call {
  method?: string;
  url?: string;
  params: unknown;
  body: unknown;
}

function setup(data: unknown = {}) {
  const calls: Call[] = [];
  const adapter: AxiosAdapter = async (config) => {
    calls.push({
      method: config.method,
      url: config.url,
      params: config.params,
      body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    });
    const response: AxiosResponse = {
      data,
      status: config.method === 'post' ? 201 : 200,
      statusText: 'OK',
      headers: {},
      config: config as InternalAxiosRequestConfig,
    };
    return response;
  };
  const client = createApiClient({ adapter, refresh: vi.fn() });
  return { calls, client };
}

describe('production: contrato de API', () => {
  it('start envía solo { recipeId }', async () => {
    const { calls, client } = setup();
    await createProductionApi(client).start({ recipeId: 'r1' });
    expect(calls).toEqual([
      { method: 'post', url: '/production/start', params: undefined, body: { recipeId: 'r1' } },
    ]);
  });

  it('transform envía machineId, inputs, outputs y el paso solo si hay; sin workerId ni timestamp', async () => {
    const { calls, client } = setup();

    await createProductionApi(client).transform({
      machineId: 'm1',
      recipeStepId: 'step-1',
      inputs: [{ batchId: 'b1', quantity: { amount: 2, unit: 'kg' } }],
      outputs: [{ materialId: 'p1', quantity: { amount: 4, unit: 'unit' } }],
      observation: ' hornada 1 ',
    });

    expect(calls).toEqual([
      {
        method: 'post',
        url: '/production/transform',
        params: undefined,
        body: {
          machineId: 'm1',
          recipeStepId: 'step-1',
          inputs: [{ batchId: 'b1', quantity: { amount: 2, unit: 'kg' } }],
          outputs: [{ materialId: 'p1', quantity: { amount: 4, unit: 'unit' } }],
          observation: ' hornada 1 ',
        },
      },
    ]);
  });

  it('transform omite recipeStepId y observation vacíos, y nunca manda timestamp/workerId', async () => {
    const { calls, client } = setup();
    await createProductionApi(client).transform({
      machineId: 'm1',
      inputs: [],
      outputs: [],
    });

    expect(calls[0].body).toEqual({ machineId: 'm1', inputs: [], outputs: [] });
    const body = calls[0].body as Record<string, unknown>;
    expect('timestamp' in body).toBe(false);
    expect('workerId' in body).toBe(false);
  });

  it('store envía { batchId, locationId } (200 → lote actualizado)', async () => {
    const { calls, client } = setup({ id: 'b1', status: 'stored' });
    const batch = await createProductionApi(client).store({ batchId: 'b1', locationId: 'l1' });

    expect(calls).toEqual([
      {
        method: 'post',
        url: '/production/store',
        params: undefined,
        body: { batchId: 'b1', locationId: 'l1' },
      },
    ]);
    expect(batch).toMatchObject({ id: 'b1', status: 'stored' });
  });

  it('complete envía { batchId } (200 → lote actualizado)', async () => {
    const { calls, client } = setup({ id: 'b1', status: 'completed' });
    const batch = await createProductionApi(client).complete({ batchId: 'b1' });

    expect(calls).toEqual([
      { method: 'post', url: '/production/complete', params: undefined, body: { batchId: 'b1' } },
    ]);
    expect(batch).toMatchObject({ id: 'b1', status: 'completed' });
  });
});
