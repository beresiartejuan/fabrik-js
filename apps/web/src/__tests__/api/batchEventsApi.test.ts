import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@/lib/api/client';
import { createBatchEventsApi } from '@/lib/api/modules/batchEventsApi';

/**
 * Contrato de `batchEventsApi.list` contra
 * `apps/api/src/batch-events/batch-events.controller.ts` (Fase 6): filtros
 * **opcionales** `?machineId=&workerId=&materialId=&from=&to=` (ISO con offset)
 * — la query solo viaja cuando hay algún filtro. La respuesta llega
 * cronológica ascendente (regla del caso de uso, no del módulo HTTP).
 */

interface Call {
  method?: string;
  url?: string;
  params: unknown;
}

function setup() {
  const calls: Call[] = [];
  const adapter: AxiosAdapter = async (config) => {
    calls.push({ method: config.method, url: config.url, params: config.params });
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

describe('batch-events: contrato de API', () => {
  it('sin filtros hace GET /batch-events sin query params', async () => {
    const { calls, client } = setup();
    await createBatchEventsApi(client).list();
    expect(calls).toEqual([{ method: 'get', url: '/batch-events', params: undefined }]);
  });

  it('envía los filtros que tiene y omite los que faltan', async () => {
    const { calls, client } = setup();
    const api = createBatchEventsApi(client);

    await api.list({ machineId: 'machine-1' });
    await api.list({ materialId: 'material-1', from: '2026-10-01T10:00:00.000Z' });

    expect(calls).toEqual([
      { method: 'get', url: '/batch-events', params: { machineId: 'machine-1' } },
      {
        method: 'get',
        url: '/batch-events',
        params: { materialId: 'material-1', from: '2026-10-01T10:00:00.000Z' },
      },
    ]);
  });

  it('envía los cinco filtros juntos (máquina, operario, material y rango)', async () => {
    const { calls, client } = setup();
    await createBatchEventsApi(client).list({
      machineId: 'machine-1',
      workerId: 'worker-1',
      materialId: 'material-1',
      from: '2026-10-01T10:00:00.000Z',
      to: '2026-10-31T22:00:00.000Z',
    });
    expect(calls).toEqual([
      {
        method: 'get',
        url: '/batch-events',
        params: {
          machineId: 'machine-1',
          workerId: 'worker-1',
          materialId: 'material-1',
          from: '2026-10-01T10:00:00.000Z',
          to: '2026-10-31T22:00:00.000Z',
        },
      },
    ]);
  });
});
