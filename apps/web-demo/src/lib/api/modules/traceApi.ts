import { type Actor, type BatchForwardNode, BatchId, type BatchTraceNode } from '@fabrik/domain';

import { readTokens } from '@/lib/session/session-store';

import { batchEventToWire, batchToWire } from '../demo/mappers';
import {
  type DemoContext,
  ensureDemoContext,
  getDemoContext,
  toApiError,
} from '../demo/module-kit';
import type { BatchForwardNodeWire, BatchTraceNodeWire } from '../types';

/**
 * Trazabilidad (`apps/api/src/trace/trace.controller.ts`, Fase 6, docs/09)
 * sobre el runtime DEMO (docs/11-plan-demo.md §T4b): la fábrica ejecuta los
 * casos de uso reales `TraceBatch`/`TraceForward` del registro
 * (`demo/registry.ts`) en lugar de las rutas HTTP; la interfaz, el actor por
 * llamada y el wire de respuesta quedan idénticos al módulo axios.
 *
 * - `backward` — genealogía **hacia atrás**: cada nodo lleva el lote y, si lo
 *   tiene, el evento que lo produjo (`batch` siempre presente, `event` omitido
 *   en las hojas —suministros y raíces sin origen—). Roles **A/Au** (un
 *   `worker` recibe `ApiError` 403); un id desconocido → `ApiError` 404.
 * - `forward` — genealogía **hacia adelante** para *recall*: nodos de lote
 *   (`batch`) y de evento (`event`) alternos — el nodo es lote XOR evento, los
 *   eventos cuelgan del lote que consumen. Roles **A/Au**.
 *
 * Ambos árboles traen `cycleDetected: true` **solo** en la rama cortada por
 * datos corruptos — la serialización replica `apps/api/src/trace/trace.dto.ts`:
 * los `undefined` se omiten (nunca `null` ni `false` en el wire).
 *
 * Convención del kit (cabecera de `demo/module-kit.ts`): operaciones `async`,
 * context singleton por operación (`ensureDemoContext`), token leído **por
 * llamada** de la sesión y `try/catch → toApiError`.
 */

/** Serializa un nodo del árbol hacia atrás (`BatchTraceNodeResponse`). */
function serializeBatchTraceNode(node: BatchTraceNode): BatchTraceNodeWire {
  return {
    batch: batchToWire(node.batch),
    ...(node.event !== undefined ? { event: batchEventToWire(node.event) } : {}),
    children: node.children.map(serializeBatchTraceNode),
    ...(node.cycleDetected === true ? { cycleDetected: true } : {}),
  };
}

/** Serializa un nodo del árbol hacia adelante / recall (`BatchForwardNode`). */
function serializeBatchForwardNode(node: BatchForwardNode): BatchForwardNodeWire {
  return {
    ...(node.batch !== undefined ? { batch: batchToWire(node.batch) } : {}),
    ...(node.event !== undefined ? { event: batchEventToWire(node.event) } : {}),
    children: node.children.map(serializeBatchForwardNode),
    ...(node.cycleDetected === true ? { cycleDetected: true } : {}),
  };
}

export interface TraceApi {
  /** Genealogía hacia atrás del lote (insumos → material final). */
  backward(batchId: string): Promise<BatchTraceNodeWire>;
  /** Genealogía hacia adelante (recall): eventos y lotes producidos a partir del lote. */
  forward(batchId: string): Promise<BatchForwardNodeWire>;
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

export function createTraceApi(ctx: DemoContext = getDemoContext()): TraceApi {
  return {
    async backward(batchId) {
      try {
        const actor = await requireActorForCall(ctx);
        const node = await ctx.registry.useCases.traceability.TraceBatch.execute(actor, {
          batchId: BatchId.from(batchId),
        });
        return serializeBatchTraceNode(node);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async forward(batchId) {
      try {
        const actor = await requireActorForCall(ctx);
        const node = await ctx.registry.useCases.traceability.TraceForward.execute(actor, {
          batchId: BatchId.from(batchId),
        });
        return serializeBatchForwardNode(node);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

/** Instancia por defecto que usa la app. */
export const traceApi: TraceApi = createTraceApi();
