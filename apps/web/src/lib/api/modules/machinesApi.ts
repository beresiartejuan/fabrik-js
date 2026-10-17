import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { MachineWire } from '../types';

/**
 * Endpoints de máquinas (`apps/api/src/machines/machines.controller.ts`).
 *
 * Fase 0b usa `list()` para el dashboard y para resolver "mis máquinas de ahora"
 * del operario. La Fase 1 añade `create`/`update`/`move` y la Fase 3 la agenda.
 */

export interface MachinesApi {
  list(): Promise<MachineWire[]>;
  get(id: string): Promise<MachineWire>;
}

export function createMachinesApi(client: AxiosInstance = apiClient): MachinesApi {
  return {
    async list() {
      const response = await client.get<MachineWire[]>('/machines');
      return response.data;
    },

    async get(id) {
      const response = await client.get<MachineWire>(`/machines/${id}`);
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const machinesApi: MachinesApi = createMachinesApi();
