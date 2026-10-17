import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { MeScheduleItemWire } from '../types';

/**
 * Endpoints del **propio** actor (`apps/api/src/me/me.controller.ts`).
 *
 * - `GET /me/schedule`: agenda del actor autenticado (cualquier rol) con la
 *   máquina enriquecida y `activeNow` calculado en el servidor.
 *
 * `activeNow` es la fuente de verdad de "¿estoy asignado ahora?": usa el reloj y
 * la zona horaria del proceso API, los mismos que aplica `RecordTransformation`
 * (I3). El navegador no debe recalcular `TimeSlot.contains`.
 */

export interface MeApi {
  schedule(): Promise<MeScheduleItemWire[]>;
}

export function createMeApi(client: AxiosInstance = apiClient): MeApi {
  return {
    async schedule() {
      const response = await client.get<MeScheduleItemWire[]>('/me/schedule');
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const meApi: MeApi = createMeApi();
