import type { WorkerRole } from '@fabrik/domain';
import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { WorkerWire } from '../types';

/**
 * Endpoints de trabajadores (`apps/api/src/workers/workers.controller.ts`).
 *
 * Fase 0b usa `list()` para los contadores del dashboard (y el filtro `active`
 * para los activos). La Fase 1 añade `create`/`update`/`deactivate`.
 */

export interface ListWorkersParams {
  readonly role?: WorkerRole;
  readonly active?: boolean;
}

export interface WorkersApi {
  list(params?: ListWorkersParams): Promise<WorkerWire[]>;
  get(id: string): Promise<WorkerWire>;
}

export function createWorkersApi(client: AxiosInstance = apiClient): WorkersApi {
  return {
    async list(params) {
      const query: { role?: WorkerRole; active?: boolean } = {};
      if (params?.role !== undefined) {
        query.role = params.role;
      }
      if (params?.active !== undefined) {
        query.active = params.active;
      }
      const response = await client.get<WorkerWire[]>('/workers', {
        params: Object.keys(query).length > 0 ? query : undefined,
      });
      return response.data;
    },

    async get(id) {
      const response = await client.get<WorkerWire>(`/workers/${id}`);
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const workersApi: WorkersApi = createWorkersApi();
