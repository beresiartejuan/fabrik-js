import {
  type Actor,
  BatchEventId,
  BatchId,
  type BatchStatus,
  MaterialId,
  RecipeId,
} from '@fabrik/domain';

import { readTokens } from '@/lib/session/session-store';

import { batchToWire } from '../demo/mappers';
import {
  type DemoContext,
  ensureDemoContext,
  getDemoContext,
  toApiError,
} from '../demo/module-kit';
import type { BatchWire } from '../types';

/**
 * Consulta de lotes (`apps/api/src/batches/batches.controller.ts`) sobre el
 * runtime DEMO (docs/demo.md §T4b): la fábrica ejecuta los casos de uso
 * reales `ListBatches`/`GetBatch` del registro (`demo/registry.ts`) en lugar de
 * `GET /batches`; la interfaz, el actor por llamada y el wire de respuesta
 * quedan idénticos al módulo axios (los componentes no cambian).
 *
 * Roles A/Au/W (el operario la consume en `/produccion`):
 *
 * - `list` con los filtros opcionales de `BatchFilter`: `status`, `materialId`,
 *   `recipeId` y `originBatchEventId`. Sin filtros devuelve todos los lotes.
 * - `get` → un lote; un id desconocido lanza `NotFoundError` → `ApiError` 404
 *   vía `demo/module-kit.toApiError` (mismo body del filter del API).
 *
 * Es un recurso de **solo lectura**: los lotes se crean por los flujos de
 * `supplies`/`production` y cambian de estado con `store`/`complete`.
 *
 * Convención del kit (cabecera de `demo/module-kit.ts`): operaciones `async`,
 * context singleton por operación (`ensureDemoContext`), token leído **por
 * llamada** de la sesión y `try/catch → toApiError`.
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

/**
 * Pasos de arranque de cada operación (kit §Convención): el histórico arranca
 * **una vez por pestaña** (`ensureDemoContext`) y el actor sale del token
 * **leído en la llamada** — nunca se cachea.
 */
async function requireActorForCall(ctx: DemoContext): Promise<Actor> {
  await ensureDemoContext();
  return ctx.requireActor(readTokens()?.accessToken ?? '');
}

export function createBatchesApi(ctx: DemoContext = getDemoContext()): BatchesApi {
  return {
    async list(params) {
      try {
        const actor = await requireActorForCall(ctx);
        const batches = await ctx.registry.useCases.traceability.ListBatches.execute(actor, {
          filter: {
            status: params?.status,
            materialId: params?.materialId ? MaterialId.from(params.materialId) : undefined,
            recipeId: params?.recipeId ? RecipeId.from(params.recipeId) : undefined,
            originBatchEventId: params?.originBatchEventId
              ? BatchEventId.from(params.originBatchEventId)
              : undefined,
          },
        });
        return batches.map(batchToWire);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async get(id) {
      try {
        const actor = await requireActorForCall(ctx);
        const batch = await ctx.registry.useCases.traceability.GetBatch.execute(actor, {
          batchId: BatchId.from(id),
        });
        return batchToWire(batch);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

/** Instancia por defecto que usa la app. */
export const batchesApi: BatchesApi = createBatchesApi();
