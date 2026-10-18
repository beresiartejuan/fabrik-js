import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { StockByLocationEntryWire, StockMovementWire } from '../types';

/**
 * Inventario (`apps/api/src/stock/stock.controller.ts`, Fase 5):
 *
 * - `GET /stock/:locationId` — roles **A/Au/W**: existencias agregadas por
 *   material de un lugar. El dominio omite las entradas con delta neto 0 y las
 *   cantidades pueden ser **negativas** en lugares de producción (consumos sin
 *   entrada previa): la UI lo muestra con signo y color.
 * - `GET /stock/:locationId/movements?materialId=` — roles **A/Au**: historial
 *   de movimientos del lugar (ascendente por `timestamp`); el filtro por
 *   material es opcional. Un `worker` recibe 403, así que la UI no le ofrece
 *   el drawer de movimientos.
 *
 * Es un recurso de **solo lectura**: los movimientos se generan con arribos,
 * producción, transferencias y ajustes; no hay endpoints de escritura.
 */
export interface StockApi {
  /** Stock agregado de un lugar: `{ materialId, amount, unit }[]`. */
  byLocation(locationId: string): Promise<StockByLocationEntryWire[]>;

  /** Movimientos del lugar, opcionalmente filtrados por material. */
  movements(locationId: string, materialId?: string): Promise<StockMovementWire[]>;
}

export function createStockApi(client: AxiosInstance = apiClient): StockApi {
  return {
    async byLocation(locationId) {
      const response = await client.get<StockByLocationEntryWire[]>(`/stock/${locationId}`);
      return response.data;
    },

    async movements(locationId, materialId) {
      const response = await client.get<StockMovementWire[]>(`/stock/${locationId}/movements`, {
        params: materialId !== undefined ? { materialId } : undefined,
      });
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const stockApi: StockApi = createStockApi();
