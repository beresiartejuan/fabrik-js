import { type Actor, MachineId, MaterialId, WorkerId } from '@fabrik/domain';

import { readTokens } from '@/lib/session/session-store';

import { batchEventToWire } from '../demo/mappers';
import {
  type DemoContext,
  ensureDemoContext,
  getDemoContext,
  toApiError,
} from '../demo/module-kit';
import type { BatchEventWire } from '../types';

/**
 * Endpoints de eventos de transformación
 * (`apps/api/src/batch-events/batch-events.controller.ts`) sobre el runtime
 * DEMO (docs/demo.md §T4b): la fábrica ejecuta el caso de uso real
 * `ListBatchEvents` del registro (`demo/registry.ts`) en lugar de
 * `GET /batch-events`; la interfaz, el actor por llamada y el wire de respuesta
 * quedan idénticos al módulo axios (los componentes no cambian).
 *
 * `list` es A/Au (un `worker` recibe `ApiError` 403 vía
 * `demo/module-kit.toApiError`): devuelve los eventos que cumplen los filtros
 * (máquina, worker, material —presente en inputs **o** outputs— y el rango
 * inclusivo `from`/`to`, que se arma solo cuando alguno de los dos extremos
 * está presente, como en el controlador) en orden cronológico **ascendente**.
 * Sin filtros devuelve todos. Fase 0b lo usa en el dashboard del auditor
 * (recorte en cliente) y en el helper de "lotes recientes"; la Fase 6 amplía
 * con la pantalla `/eventos`.
 *
 * Convención del kit (cabecera de `demo/module-kit.ts`): operaciones `async`,
 * context singleton por operación (`ensureDemoContext`), token leído **por
 * llamada** de la sesión y `try/catch → toApiError`.
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

/**
 * Pasos de arranque de cada operación (kit §Convención): el histórico arranca
 * **una vez por pestaña** (`ensureDemoContext`) y el actor sale del token
 * **leído en la llamada** — nunca se cachea.
 */
async function requireActorForCall(ctx: DemoContext): Promise<Actor> {
  await ensureDemoContext();
  return ctx.requireActor(readTokens()?.accessToken ?? '');
}

export function createBatchEventsApi(ctx: DemoContext = getDemoContext()): BatchEventsApi {
  return {
    async list(params) {
      try {
        const actor = await requireActorForCall(ctx);
        // Rango inclusivo como el controlador: se arma si hay `from` o `to`
        // (cualquiera de los dos extremos puede faltar) y los ISO del cliente
        // se convierten a `Date`, como el transform del schema de zod.
        const dateRange =
          params?.from !== undefined || params?.to !== undefined
            ? {
                from: params.from !== undefined ? new Date(params.from) : undefined,
                to: params.to !== undefined ? new Date(params.to) : undefined,
              }
            : undefined;
        const events = await ctx.registry.useCases.traceability.ListBatchEvents.execute(actor, {
          machineId: params?.machineId ? MachineId.from(params.machineId) : undefined,
          workerId: params?.workerId ? WorkerId.from(params.workerId) : undefined,
          materialId: params?.materialId ? MaterialId.from(params.materialId) : undefined,
          dateRange,
        });
        return events.map(batchEventToWire);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

/** Instancia por defecto que usa la app. */
export const batchEventsApi: BatchEventsApi = createBatchEventsApi();
