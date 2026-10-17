import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { AssignmentWire } from '../types';

/**
 * Endpoints de asignaciones y agendas
 * (`apps/api/src/assignments/{assignments,schedule}.controller.ts`).
 *
 * Fase 0b solo necesita las **agendas** para calcular "mis máquinas de ahora" en
 * el dashboard del operario. La Fase 3 añade `assign`/`remove` y la grilla semanal
 * sobre este mismo módulo.
 */

export interface AssignmentsApi {
  workerSchedule(workerId: string): Promise<AssignmentWire[]>;
  machineSchedule(machineId: string): Promise<AssignmentWire[]>;
}

export function createAssignmentsApi(client: AxiosInstance = apiClient): AssignmentsApi {
  return {
    async workerSchedule(workerId) {
      const response = await client.get<AssignmentWire[]>(`/workers/${workerId}/schedule`);
      return response.data;
    },

    async machineSchedule(machineId) {
      const response = await client.get<AssignmentWire[]>(`/machines/${machineId}/schedule`);
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const assignmentsApi: AssignmentsApi = createAssignmentsApi();
