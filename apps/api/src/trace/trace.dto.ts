import type { BatchForwardNode, BatchTraceNode } from '@fabrik/domain';

import {
  type BatchEventResponse,
  type BatchResponse,
  serializeBatch,
  serializeBatchEvent,
} from '../common/entity-serializers.js';

/**
 * Serialización de los árboles de trazabilidad (Fase 6, docs/09).
 *
 * Los nodos del dominio embeben las **entidades** `Batch`/`BatchEvent`, que ya
 * tienen serializador compartido (`entity-serializers.ts`). Aquí se recorre el
 * árbol recursivamente y se emiten las copias serializadas, conservando la forma
 * exacta de los DTO del dominio (`BatchTraceNode` / `BatchForwardNode`):
 *
 * - `batch`/`event` son mutuamente excluyentes según el nodo: el árbol hacia atrás
 *   lleva siempre `batch` y opcionalmente `event`; el árbol hacia adelante lleva un
 *   nodo de lote (`batch`) o uno de evento (`event`), nunca ambos.
 * - `cycleDetected` se emite **solo** cuando es `true` (los `undefined` se omiten,
 *   como en el resto de serializadores); marca la rama cortada por datos corruptos.
 * - Los `event` embebidos salen con `Date` convertido a ISO 8601 y la observación
 *   normalizada (lo aporta `serializeBatchEvent`).
 */

/** Nodo del árbol de genealogía hacia atrás en el wire. */
export interface BatchTraceNodeResponse {
  readonly batch: BatchResponse;
  readonly event?: BatchEventResponse;
  readonly children: BatchTraceNodeResponse[];
  readonly cycleDetected?: boolean;
}

export function serializeBatchTraceNode(node: BatchTraceNode): BatchTraceNodeResponse {
  return {
    batch: serializeBatch(node.batch),
    ...(node.event !== undefined ? { event: serializeBatchEvent(node.event) } : {}),
    children: node.children.map(serializeBatchTraceNode),
    ...(node.cycleDetected === true ? { cycleDetected: true } : {}),
  };
}

/** Nodo del árbol de genealogía hacia adelante (recall) en el wire. */
export interface BatchForwardNodeResponse {
  readonly batch?: BatchResponse;
  readonly event?: BatchEventResponse;
  readonly children: BatchForwardNodeResponse[];
  readonly cycleDetected?: boolean;
}

export function serializeBatchForwardNode(node: BatchForwardNode): BatchForwardNodeResponse {
  return {
    ...(node.batch !== undefined ? { batch: serializeBatch(node.batch) } : {}),
    ...(node.event !== undefined ? { event: serializeBatchEvent(node.event) } : {}),
    children: node.children.map(serializeBatchForwardNode),
    ...(node.cycleDetected === true ? { cycleDetected: true } : {}),
  };
}
