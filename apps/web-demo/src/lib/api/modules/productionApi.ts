import {
  type Actor,
  BatchId,
  LocationId,
  MachineId,
  MaterialId,
  Quantity,
  RecipeId,
  RecipeStepId,
} from '@fabrik/domain';

import { readTokens } from '@/lib/session/session-store';

import { batchEventToWire, batchToWire } from '../demo/mappers';
import {
  type DemoContext,
  ensureDemoContext,
  getDemoContext,
  toApiError,
} from '../demo/module-kit';
import type { BatchWire, QuantityWire, TransformationWire } from '../types';

/**
 * Casos de uso de producción (`apps/api/src/production/production.controller.ts`)
 * sobre el runtime DEMO (docs/11-plan-demo.md §T4b): cada fábrica ejecuta los
 * casos de uso reales del registro (`demo/registry.ts`) en lugar de las rutas
 * HTTP; la interfaz, el actor por llamada y el wire de respuesta quedan
 * idénticos al módulo axios (los componentes no cambian).
 *
 * - `start` (solo admin): body `{ recipeId }` → el lote raíz `in_progress` (con
 *   `recipeId`) de la orden.
 * - `transform` (solo worker; el admin recibe 403 como en la API): body
 *   `{ machineId, recipeStepId?, inputs, outputs, observation }`. Dos decisiones
 *   de contrato se replican del controlador real: el `workerId` **no va en el
 *   body** (el comando lo toma del actor autenticado) y el `timestamp` del
 *   cliente no viaja — en producción la API usa el reloj del servidor (MEDIA #3)
 *   y en el demo el dominio sella `new Date()`, el reloj del navegador.
 *   Responde `{ event, outputBatches }`, donde `outputBatches` se resuelve con
 *   la misma **lectura de apoyo** del `ProductionController`
 *   (`batches.list({ originBatchEventId: event.id })`).
 * - `store` (A/W): body `{ batchId, locationId }` → lote actualizado (`stored`).
 * - `complete` (A/W): body `{ batchId }` → exige que el lote tenga `recipeId`
 *   (`NotAProductionOrderError` → 422 si no).
 *
 * Errores 409/422 (`WorkerNotAssignedError`, `InactiveMachineError`,
 * `InvalidStateTransitionError`, `IncompatibleUnitError`,
 * `InvalidTransformationError`, `MachineTypeMismatchError`) y el 403 de rol
 * salen por `demo/module-kit.toApiError` con la tabla del filter del API.
 *
 * Convención del kit (cabecera de `demo/module-kit.ts`): operaciones `async`,
 * context singleton por operación (`ensureDemoContext`), token leído **por
 * llamada** de la sesión y `try/catch → toApiError`.
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

/**
 * Pasos de arranque de cada operación (kit §Convención): el histórico arranca
 * **una vez por pestaña** (`ensureDemoContext`) y el actor sale del token
 * **leído en la llamada** — nunca se cachea.
 */
async function requireActorForCall(ctx: DemoContext): Promise<Actor> {
  await ensureDemoContext();
  return ctx.requireActor(readTokens()?.accessToken ?? '');
}

export function createProductionApi(ctx: DemoContext = getDemoContext()): ProductionApi {
  return {
    async start(input) {
      try {
        const actor = await requireActorForCall(ctx);
        const batch = await ctx.registry.useCases.production.StartProduction.execute(actor, {
          recipeId: RecipeId.from(input.recipeId),
        });
        return batchToWire(batch);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async transform(input) {
      try {
        const actor = await requireActorForCall(ctx);
        // Paridad del controlador real: `workerId` desde el actor (el body no lo
        // lleva) y sin `timestamp` (el dominio sella el reloj del servidor; en
        // el demo, el reloj del navegador).
        const event = await ctx.registry.useCases.production.RecordTransformation.execute(actor, {
          machineId: MachineId.from(input.machineId),
          workerId: actor.workerId,
          ...(input.recipeStepId !== undefined && input.recipeStepId.length > 0
            ? { recipeStepId: RecipeStepId.from(input.recipeStepId) }
            : {}),
          inputs: input.inputs.map((row) => ({
            batchId: BatchId.from(row.batchId),
            quantity: Quantity.create(row.quantity.amount, row.quantity.unit),
          })),
          outputs: input.outputs.map((row) => ({
            materialId: MaterialId.from(row.materialId),
            quantity: Quantity.create(row.quantity.amount, row.quantity.unit),
          })),
          ...(input.observation !== undefined && input.observation.trim().length > 0
            ? { observation: input.observation }
            : {}),
        });
        // Lectura de apoyo con paridad del `ProductionController`: el caso de
        // uso devuelve solo el evento (los ids de los lotes de output no viajan
        // en él), así que se resuelven por `originBatchEventId` para que el
        // cliente pueda encadenar el paso siguiente (p. ej. `store`).
        const outputBatches = await ctx.repos.batches.list({ originBatchEventId: event.id });
        return {
          event: batchEventToWire(event),
          outputBatches: outputBatches.map(batchToWire),
        };
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async store(input) {
      try {
        const actor = await requireActorForCall(ctx);
        const batch = await ctx.registry.useCases.production.StoreBatch.execute(actor, {
          batchId: BatchId.from(input.batchId),
          locationId: LocationId.from(input.locationId),
        });
        return batchToWire(batch);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async complete(input) {
      try {
        const actor = await requireActorForCall(ctx);
        const batch = await ctx.registry.useCases.production.CompleteProduction.execute(actor, {
          batchId: BatchId.from(input.batchId),
        });
        return batchToWire(batch);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

/** Instancia por defecto que usa la app. */
export const productionApi: ProductionApi = createProductionApi();
