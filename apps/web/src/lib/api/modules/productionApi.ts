import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { BatchWire, QuantityWire, TransformationWire } from '../types';

/**
 * Casos de uso de producción (`apps/api/src/production/production.controller.ts`).
 *
 * - `POST /production/start` (solo admin, 201): body `{ recipeId }` → el lote
 *   raíz `in_progress` (con `recipeId`) de la orden.
 * - `POST /production/transform` (solo worker, 201): body
 *   `{ machineId, recipeStepId?, inputs, outputs, observation }`. Dos decidisiones
 *   de contrato: el `workerId` **no va en el body** (la API lo toma del actor
 *   autenticado) y el `timestamp` del cliente **no se envía** (en producción la
 *   API lo descarta y usa el reloj del servidor; MEDIA #3). Responde
 *   `{ event, outputBatches }`.
 * - `POST /production/store` (admin/worker, 200): body `{ batchId, locationId }` →
 *   lote actualizado (`stored`).
 * - `POST /production/complete` (admin/worker, 200): body `{ batchId }` → exige
 *   que el lote tenga `recipeId` (`NotAProductionOrderError` → 422 si no).
 *
 * Errores 409/422 (`WorkerNotAssignedError`, `InactiveMachineError`,
 * `InvalidStateTransitionError`, `IncompatibleUnitError`,
 * `InvalidTransformationError`, `MachineTypeMismatchError`) se mapean en
 * `errorToMessage`.
 */

export interface StartProductionInput {
  readonly recipeId: string;
}

/** Fila de input de una transformación: lote consumido + cantidad. */
export interface TransformInputRow {
  readonly batchId: string;
  readonly quantity: QuantityWire;
}

/** Fila de output de una transformación: material producido + cantidad. */
export interface TransformOutputRow {
  readonly materialId: string;
  readonly quantity: QuantityWire;
}

export interface RecordTransformationInput {
  readonly machineId: string;
  readonly recipeStepId?: string;
  readonly inputs: readonly TransformInputRow[];
  readonly outputs: readonly TransformOutputRow[];
  readonly observation?: string;
}

export interface StoreBatchInput {
  readonly batchId: string;
  readonly locationId: string;
}

export interface CompleteProductionInput {
  readonly batchId: string;
}

export interface ProductionApi {
  start(input: StartProductionInput): Promise<BatchWire>;
  transform(input: RecordTransformationInput): Promise<TransformationWire>;
  store(input: StoreBatchInput): Promise<BatchWire>;
  complete(input: CompleteProductionInput): Promise<BatchWire>;
}

export function createProductionApi(client: AxiosInstance = apiClient): ProductionApi {
  return {
    async start(input) {
      const response = await client.post<BatchWire>('/production/start', input);
      return response.data;
    },

    async transform(input) {
      const response = await client.post<TransformationWire>('/production/transform', {
        machineId: input.machineId,
        ...(input.recipeStepId !== undefined && input.recipeStepId.length > 0
          ? { recipeStepId: input.recipeStepId }
          : {}),
        inputs: input.inputs,
        outputs: input.outputs,
        ...(input.observation !== undefined && input.observation.trim().length > 0
          ? { observation: input.observation }
          : {}),
      });
      return response.data;
    },

    async store(input) {
      const response = await client.post<BatchWire>('/production/store', {
        batchId: input.batchId,
        locationId: input.locationId,
      });
      return response.data;
    },

    async complete(input) {
      const response = await client.post<BatchWire>('/production/complete', input);
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const productionApi: ProductionApi = createProductionApi();
