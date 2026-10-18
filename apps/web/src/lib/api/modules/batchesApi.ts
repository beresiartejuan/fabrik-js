import type { BatchStatus } from '@fabrik/domain';
import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { BatchWire } from '../types';

/**
 * Consulta de lotes (`apps/api/src/batches/batches.controller.ts`), roles A/Au/W
 * (el plan de web la usa en `/produccion` y la pide el operario).
 *
 * - `GET /batches` con los filtros opcionales de `BatchFilter`: `status`,
 *   `materialId`, `recipeId` y `originBatchEventId`. Sin filtros devuelve todos
 *   los lotes.
 * - `GET /batches/:id` → un lote; un id desconocido lanza `NotFoundError` → 404.
 *
 * Es un recurso de **solo lectura**: los lotes se crean por los flujos de
 * `supplies`/`production` y cambian de estado con `store`/`complete`.
 */
export interface ListBatchesParams {
  readonly status?: BatchStatus;
  readonly materialId?: string;
  readonly recipeId?: string;
  readonly originBatchEventId?: string;
}

export interface BatchesApi {
  list(params?: ListBatchesParams): Promise<BatchWire[]>;
  get(id: string): Promise<BatchWire>;
}

export function createBatchesApi(client: AxiosInstance = apiClient): BatchesApi {
  return {
    async list(params) {
      const query: Record<string, string> = {};
      if (params?.status !== undefined) {
        query.status = params.status;
      }
      if (params?.materialId !== undefined) {
        query.materialId = params.materialId;
      }
      if (params?.recipeId !== undefined) {
        query.recipeId = params.recipeId;
      }
      if (params?.originBatchEventId !== undefined) {
        query.originBatchEventId = params.originBatchEventId;
      }
      const response = await client.get<BatchWire[]>('/batches', {
        params: Object.keys(query).length > 0 ? query : undefined,
      });
      return response.data;
    },

    async get(id) {
      const response = await client.get<BatchWire>(`/batches/${id}`);
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const batchesApi: BatchesApi = createBatchesApi();
