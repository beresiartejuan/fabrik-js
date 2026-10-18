import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { BatchForwardNodeWire, BatchTraceNodeWire } from '../types';

/**
 * Trazabilidad (`apps/api/src/trace/trace.controller.ts`, Fase 6, docs/09).
 *
 * - `GET /trace/:batchId` — genealogía **hacia atrás**: cada nodo lleva el lote
 *   y, si lo tiene, el evento que lo produjo (`batch` siempre presente, `event`
 *   omitido en las hojas —suministros y raíces sin origen—). Roles **A/Au**;
 *   un id desconocido responde 404 (`NotFoundError`).
 * - `GET /trace/:batchId/forward` — genealogía **hacia adelante** para *recall*:
 *   nodos de lote (`batch`) y de evento (`event`) alternos — el nodo es lote
 *   XOR evento, los eventos cuelgan del lote que consumen. Roles **A/Au**.
 *
 * Ambos árboles traen `cycleDetected: true` **solo** en la rama cortada por
 * datos corruptos (los `undefined` se omiten en el wire).
 */
export interface TraceApi {
  /** Genealogía hacia atrás del lote (insumos → material final). */
  backward(batchId: string): Promise<BatchTraceNodeWire>;
  /** Genealogía hacia adelante (recall): eventos y lotes producidos a partir del lote. */
  forward(batchId: string): Promise<BatchForwardNodeWire>;
}

export function createTraceApi(client: AxiosInstance = apiClient): TraceApi {
  return {
    async backward(batchId) {
      const response = await client.get<BatchTraceNodeWire>(`/trace/${batchId}`);
      return response.data;
    },

    async forward(batchId) {
      const response = await client.get<BatchForwardNodeWire>(`/trace/${batchId}/forward`);
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const traceApi: TraceApi = createTraceApi();
