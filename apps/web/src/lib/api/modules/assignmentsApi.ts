import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { AssignmentWire, TimeSlotWire } from '../types';

/**
 * Endpoints de asignaciones y agendas
 * (`apps/api/src/assignments/{assignments,schedule}.controller.ts`).
 *
 * - `POST /assignments` (admin, 201) — body `{ workerId, machineId, slot }`;
 *   valida I1 y responde `OverlappingScheduleError` → 409 si el worker ya tiene
 *   una franja solapada.
 * - `DELETE /assignments/:id` (admin, 204, sin body) — borrado real.
 * - `GET /workers/:id/schedule` y `GET /machines/:id/schedule` — A/Au (+ el
 *   worker ve su propia agenda).
 *
 * El dashboard del operario usa `GET /me/schedule` (`meApi`) porque resuelve la
 * agenda propia con `activeNow` calculado en el servidor.
 */

export interface AssignWorkerInput {
  readonly workerId: string;
  readonly machineId: string;
  readonly slot: TimeSlotWire;
}

export interface AssignmentsApi {
  assign(input: AssignWorkerInput): Promise<AssignmentWire>;
  unassign(assignmentId: string): Promise<void>;
  workerSchedule(workerId: string): Promise<AssignmentWire[]>;
  machineSchedule(machineId: string): Promise<AssignmentWire[]>;
}

export function createAssignmentsApi(client: AxiosInstance = apiClient): AssignmentsApi {
  return {
    async assign(input) {
      const response = await client.post<AssignmentWire>('/assignments', input);
      return response.data;
    },

    async unassign(assignmentId) {
      await client.delete(`/assignments/${assignmentId}`);
    },

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
