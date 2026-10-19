import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@/lib/api/client';
import { createLocationsApi } from '@/lib/api/modules/locationsApi';
import { createMachinesApi } from '@/lib/api/modules/machinesApi';
import { createMaterialsApi } from '@/lib/api/modules/materialsApi';
import { createWorkersApi } from '@/lib/api/modules/workersApi';

/**
 * Contratos de los catálogos contra `apps/api` (docs/pantallas.md §Fase 1):
 * método, ruta, query y body de cada endpoint de escritura/baja/movimiento.
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

describe('catálogos: contratos de API', () => {
  it('materials: list con filtros kind/physicalState', async () => {
    const { calls, client } = setup();
    await createMaterialsApi(client).list({ kind: 'supply', physicalState: 'solid' });
    expect(calls).toEqual([
      {
        method: 'get',
        url: '/materials',
        params: { kind: 'supply', physicalState: 'solid' },
        body: undefined,
      },
    ]);
  });

  it('materials: create, patch y deactivate', async () => {
    const { calls, client } = setup();
    const api = createMaterialsApi(client);
    await api.create({
      name: 'Harina',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'g',
    });
    await api.update('m1', { name: 'Harina 000', unitOfMeasure: 'kg' });
    await api.deactivate('m1');
    expect(calls).toEqual([
      {
        method: 'post',
        url: '/materials',
        params: undefined,
        body: { name: 'Harina', kind: 'supply', physicalState: 'solid', unitOfMeasure: 'g' },
      },
      {
        method: 'patch',
        url: '/materials/m1',
        params: undefined,
        body: { name: 'Harina 000', unitOfMeasure: 'kg' },
      },
      { method: 'post', url: '/materials/m1/deactivate', params: undefined, body: undefined },
    ]);
  });

  it('materials: update envía description vacía explícita para limpiarla', async () => {
    const { calls, client } = setup();
    await createMaterialsApi(client).update('m1', { description: '' });
    expect(calls).toEqual([
      {
        method: 'patch',
        url: '/materials/m1',
        params: undefined,
        body: { description: '' },
      },
    ]);
  });

  it('locations: create y patch solo renombra', async () => {
    const { calls, client } = setup();
    const api = createLocationsApi(client);
    await api.create({ name: 'Planta', kind: 'production' });
    await api.update('l1', { name: 'Planta baja' });
    expect(calls).toEqual([
      {
        method: 'post',
        url: '/locations',
        params: undefined,
        body: { name: 'Planta', kind: 'production' },
      },
      { method: 'patch', url: '/locations/l1', params: undefined, body: { name: 'Planta baja' } },
    ]);
  });

  it('machines: list con filtros y move por endpoint propio', async () => {
    const { calls, client } = setup();
    const api = createMachinesApi(client);
    await api.list({ locationId: 'l1', status: 'idle' });
    await api.move('m1', { locationId: 'l2' });
    expect(calls).toEqual([
      {
        method: 'get',
        url: '/machines',
        params: { locationId: 'l1', status: 'idle' },
        body: undefined,
      },
      { method: 'post', url: '/machines/m1/move', params: undefined, body: { locationId: 'l2' } },
    ]);
  });

  it('workers: list con active y deactivate', async () => {
    const { calls, client } = setup();
    const api = createWorkersApi(client);
    await api.list({ active: true });
    await api.deactivate('w1');
    expect(calls).toEqual([
      { method: 'get', url: '/workers', params: { active: true }, body: undefined },
      { method: 'post', url: '/workers/w1/deactivate', params: undefined, body: undefined },
    ]);
  });
});
