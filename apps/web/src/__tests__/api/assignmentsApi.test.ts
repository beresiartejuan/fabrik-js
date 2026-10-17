import type { DayOfWeek } from '@fabrik/domain';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@/lib/api/client';
import { createAssignmentsApi } from '@/lib/api/modules/assignmentsApi';

/**
 * Contrato de `assignmentsApi` contra `apps/api/src/assignments/{assignments,
 * schedule}.controller.ts` (docs/10-plan-de-web.md §Fase 3): rutas, forma
 * exacta del body de `POST /assignments` (slot con `daysOfWeek`/`start`/`end`)
 * y `DELETE /assignments/:id` sin body (204).
 */

interface Call {
  method?: string;
  url?: string;
  params: unknown;
  body: unknown;
}

const SLOT = { daysOfWeek: [1, 3] as DayOfWeek[], start: '08:00', end: '16:30' };
const ASSIGNMENT = { id: 'a1', workerId: 'w1', machineId: 'm1', slot: SLOT };

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
      data: config.method === 'post' ? { ...ASSIGNMENT } : null,
      status: config.method === 'delete' ? 204 : 201,
      statusText: 'OK',
      headers: {},
      config: config as InternalAxiosRequestConfig,
    };
    return response;
  };
  const client = createApiClient({ adapter, refresh: vi.fn() });
  return { calls, client };
}

describe('assignments: contrato de API', () => {
  it('assign envía POST /assignments con workerId, machineId y slot', async () => {
    const { calls, client } = setup();
    const api = createAssignmentsApi(client);

    const result = await api.assign({ workerId: 'w1', machineId: 'm1', slot: SLOT });

    expect(calls).toEqual([
      {
        method: 'post',
        url: '/assignments',
        params: undefined,
        body: { workerId: 'w1', machineId: 'm1', slot: SLOT },
      },
    ]);
    expect(result).toEqual(ASSIGNMENT);
  });

  it('unassign usa DELETE /assignments/:id sin body', async () => {
    const { calls, client } = setup();
    const api = createAssignmentsApi(client);

    await expect(api.unassign('a1')).resolves.toBeUndefined();

    expect(calls).toEqual([
      { method: 'delete', url: '/assignments/a1', params: undefined, body: undefined },
    ]);
  });

  it('workerSchedule usa GET /workers/:id/schedule', async () => {
    const { calls, client } = setup();
    const api = createAssignmentsApi(client);

    await api.workerSchedule('w1');

    expect(calls).toEqual([
      { method: 'get', url: '/workers/w1/schedule', params: undefined, body: undefined },
    ]);
  });

  it('machineSchedule usa GET /machines/:id/schedule', async () => {
    const { calls, client } = setup();
    const api = createAssignmentsApi(client);

    await api.machineSchedule('m1');

    expect(calls).toEqual([
      { method: 'get', url: '/machines/m1/schedule', params: undefined, body: undefined },
    ]);
  });
});
