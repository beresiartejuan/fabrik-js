import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { AssignmentWire } from '../types';

/**
 * Endpoints de asignaciones y agendas
 * (`apps/api/src/assignments/{assignments,schedule}.controller.ts`).
 *
 * El dashboard del operario usa `GET /me/schedule` (`meApi`) porque resuelve la
 * agenda propia y calcula `activeNow` en el servidor. Estas rutas quedan para la
 * Fase 3 (grilla semanal / gestión de asignaciones), que además añade
 * `assign`/`remove` sobre este mismo módulo.
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
