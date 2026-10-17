import type { WorkerRole } from '@fabrik/domain';
import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { WorkerWire } from '../types';

/**
 * Endpoints de trabajadores (`apps/api/src/workers/workers.controller.ts`).
 *
 * - `GET /workers` (filtros `role`, `active`) — A/Au.
 * - `GET /workers/:id` — A/Au.
 * - `POST /workers` — admin.
 * - `PATCH /workers/:id` (nombre y/o rol) — admin.
 * - `POST /workers/:id/deactivate` (baja lógica) — admin.
 *
 * **Deuda de API:** no hay endpoint de reactivación (el dominio tiene
 * `Worker.activate()` pero no un caso de uso expuesto), por eso no se ofrece
 * `reactivate` (docs/10-plan-de-web.md §Gaps).
 */

export interface ListWorkersParams {
  readonly role?: WorkerRole;
  readonly active?: boolean;
}

export interface CreateWorkerInput {
  readonly name: string;
  readonly role: WorkerRole;
}

export interface UpdateWorkerInput {
  readonly name?: string;
  readonly role?: WorkerRole;
}

export interface WorkersApi {
  list(params?: ListWorkersParams): Promise<WorkerWire[]>;
  get(id: string): Promise<WorkerWire>;
  create(input: CreateWorkerInput): Promise<WorkerWire>;
  update(id: string, input: UpdateWorkerInput): Promise<WorkerWire>;
  deactivate(id: string): Promise<WorkerWire>;
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

    async create(input) {
      const response = await client.post<WorkerWire>('/workers', input);
      return response.data;
    },

    async update(id, input) {
      const response = await client.patch<WorkerWire>(`/workers/${id}`, input);
      return response.data;
    },

    async deactivate(id) {
      const response = await client.post<WorkerWire>(`/workers/${id}/deactivate`);
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const workersApi: WorkersApi = createWorkersApi();
