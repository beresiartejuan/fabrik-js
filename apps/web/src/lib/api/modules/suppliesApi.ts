import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { BatchWire, QuantityWire } from '../types';

/**
 * Ingreso de suministros (`apps/api/src/supplies/supplies.controller.ts`).
 *
 * `POST /supplies/arrivals` (admin/worker, 201): crea un lote `stored` en el
 * lugar de almacenamiento + el `StockMovement` `supply_in`, y responde el
 * **lote creado** (`BatchResponse`). El material debe ser `kind=supply`, el
 * lugar `kind=storage` y la unidad coincidir con la del material (I6); esas
 * reglas las aplica el dominio (404/422) — el cliente deriva la unidad del
 * catálogo y el resto se muestra mapeado (`MaterialKindMismatchError`,
 * `InvalidLocationKindError`, `IncompatibleUnitError`).
 */
export interface SupplyArrivalInput {
  readonly materialId: string;
  readonly quantity: QuantityWire;
  readonly locationId: string;
}

export interface SuppliesApi {
  arrive(input: SupplyArrivalInput): Promise<BatchWire>;
}

export function createSuppliesApi(client: AxiosInstance = apiClient): SuppliesApi {
  return {
    async arrive(input) {
      const response = await client.post<BatchWire>('/supplies/arrivals', {
        materialId: input.materialId,
        quantity: input.quantity,
        locationId: input.locationId,
      });
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const suppliesApi: SuppliesApi = createSuppliesApi();
