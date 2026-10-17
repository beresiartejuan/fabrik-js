import type { MachineStatus, MachineType } from '@fabrik/domain';
import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { MachineWire } from '../types';

/**
 * Endpoints de máquinas (`apps/api/src/machines/machines.controller.ts`).
 *
 * - `GET /machines` (filtros `locationId`, `status`, `type`) — A/Au.
 * - `GET /machines/:id` — A/Au.
 * - `POST /machines` — admin.
 * - `PATCH /machines/:id` (nombre y/o tipo; el lugar **no** va por aquí) — admin.
 * - `POST /machines/:id/move` (cambio de lugar; valida I2: destino `production`) —
 *   admin. Tiene su propio endpoint/evento (`machine.moved`), por eso no se usa
 *   `PATCH` para mover.
 */

export interface ListMachinesParams {
  readonly locationId?: string;
  readonly status?: MachineStatus;
  readonly type?: string;
}

export interface CreateMachineInput {
  readonly name: string;
  readonly type: MachineType;
  readonly locationId: string;
}

export interface UpdateMachineInput {
  readonly name?: string;
  readonly type?: MachineType;
}

export interface MoveMachineInput {
  readonly locationId: string;
}

export interface MachinesApi {
  list(params?: ListMachinesParams): Promise<MachineWire[]>;
  get(id: string): Promise<MachineWire>;
  create(input: CreateMachineInput): Promise<MachineWire>;
  update(id: string, input: UpdateMachineInput): Promise<MachineWire>;
  move(id: string, input: MoveMachineInput): Promise<MachineWire>;
}

function listQuery(params?: ListMachinesParams): Record<string, string> | undefined {
  const query: Record<string, string> = {};
  if (params?.locationId !== undefined) {
    query.locationId = params.locationId;
  }
  if (params?.status !== undefined) {
    query.status = params.status;
  }
  if (params?.type !== undefined) {
    query.type = params.type;
  }
  return Object.keys(query).length > 0 ? query : undefined;
}

export function createMachinesApi(client: AxiosInstance = apiClient): MachinesApi {
  return {
    async list(params) {
      const response = await client.get<MachineWire[]>('/machines', {
        params: listQuery(params),
      });
      return response.data;
    },

    async get(id) {
      const response = await client.get<MachineWire>(`/machines/${id}`);
      return response.data;
    },

    async create(input) {
      const response = await client.post<MachineWire>('/machines', input);
      return response.data;
    },

    async update(id, input) {
      const response = await client.patch<MachineWire>(`/machines/${id}`, input);
      return response.data;
    },

    async move(id, input) {
      const response = await client.post<MachineWire>(`/machines/${id}/move`, input);
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const machinesApi: MachinesApi = createMachinesApi();
