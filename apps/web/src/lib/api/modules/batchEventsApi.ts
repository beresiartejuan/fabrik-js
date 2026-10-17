import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { BatchEventWire } from '../types';

/**
 * Endpoints de eventos de transformación
 * (`apps/api/src/batch-events/batch-events.controller.ts`).
 *
 * `GET /batch-events` es A/Au: devuelve los eventos que cumplen los filtros
 * (máquina, worker, material y rango `from`/`to`) en orden cronológico ascendente.
 * Fase 0b lo usa en el dashboard del auditor (recorte en cliente) y en el helper
 * de "lotes recientes". La Fase 6 amplía con la pantalla `/eventos`.
 */

export interface ListBatchEventsParams {
  readonly machineId?: string;
  readonly workerId?: string;
  readonly materialId?: string;
  /** ISO 8601 inclusivo. */
  readonly from?: string;
  /** ISO 8601 inclusivo. */
  readonly to?: string;
}

export interface BatchEventsApi {
  list(params?: ListBatchEventsParams): Promise<BatchEventWire[]>;
}

export function createBatchEventsApi(client: AxiosInstance = apiClient): BatchEventsApi {
  return {
    async list(params) {
      const query: Record<string, string> = {};
      if (params?.machineId) {
        query.machineId = params.machineId;
      }
      if (params?.workerId) {
        query.workerId = params.workerId;
      }
      if (params?.materialId) {
        query.materialId = params.materialId;
      }
      if (params?.from) {
        query.from = params.from;
      }
      if (params?.to) {
        query.to = params.to;
      }
      const response = await client.get<BatchEventWire[]>('/batch-events', {
        params: Object.keys(query).length > 0 ? query : undefined,
      });
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const batchEventsApi: BatchEventsApi = createBatchEventsApi();
