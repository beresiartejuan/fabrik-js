import type {
  BatchEventWire,
  BatchForwardNodeWire,
  BatchTraceNodeWire,
  BatchWire,
} from '@/lib/api/types';

/**
 * Normalización **pura** de los árboles de trazabilidad (Fase 6, pantalla 14).
 *
 * La API emite dos formas distintas:
 * - Hacia atrás (`BatchTraceNodeWire`): un nodo es siempre un lote y, si lo
 *   tiene, **también** el evento que lo produjo (lote + evento juntos).
 * - Hacia adelante (`BatchForwardNodeWire`, recall): un nodo es lote **o**
 *   evento, nunca ambos (lote XOR evento).
 *
 * `TraceViewNode` funde ambas en una única forma para el componente recursivo
 * (`TraceTree`): `batch` y `event` son opcionales según el nodo, los hijos
 * `readonly`, y `cycleDetected` queda normalizado a `boolean` (en el wire se
 * **omite** cuando es falso). Sin React: testeable sin montar componentes.
 */

/** Nodo ya normalizado para render. */
export interface TraceViewNode {
  readonly batch?: BatchWire;
  readonly event?: BatchEventWire;
  readonly children: readonly TraceViewNode[];
  readonly cycleDetected: boolean;
}

/** Normaliza un nodo del árbol hacia atrás (`GET /trace/:batchId`). */
export function normalizeTraceNode(node: BatchTraceNodeWire): TraceViewNode {
  return {
    ...(node.batch !== undefined ? { batch: node.batch } : {}),
    ...(node.event !== undefined ? { event: node.event } : {}),
    children: node.children.map(normalizeTraceNode),
    cycleDetected: node.cycleDetected === true,
  };
}

/** Normaliza un nodo del árbol hacia adelante (`GET /trace/:batchId/forward`). */
export function normalizeForwardNode(node: BatchForwardNodeWire): TraceViewNode {
  return {
    ...(node.batch !== undefined ? { batch: node.batch } : {}),
    ...(node.event !== undefined ? { event: node.event } : {}),
    children: node.children.map(normalizeForwardNode),
    cycleDetected: node.cycleDetected === true,
  };
}

/** Cantidad de nodos del árbol (lotes + eventos); sirve a los tests. */
export function countTraceNodes(node: TraceViewNode): number {
  return 1 + node.children.reduce((total, child) => total + countTraceNodes(child), 0);
}

/**
 * Deriva los **lotes recientes** desde `GET /batch-events` (ascendente por
 * `timestamp`): recorre los eventos de más nuevo a más viejo y toma primero los
 * lotes producidos (`outputs.batchId`) y luego los consumidos
 * (`inputs.batchId`), sin repetir y hasta `limit`. Son candidatos válidos para
 * la trazabilidad tanto lotes actuales como insumos ya consumidos.
 */
export function deriveRecentBatchIds(events: readonly BatchEventWire[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (let index = events.length - 1; index >= 0 && result.length < limit; index--) {
    const event = events[index];
    const candidates = [...event.outputs, ...event.inputs];
    for (const candidate of candidates) {
      if (candidate.batchId === undefined || seen.has(candidate.batchId)) {
        continue;
      }
      seen.add(candidate.batchId);
      result.push(candidate.batchId);
      if (result.length >= limit) {
        break;
      }
    }
  }
  return result;
}
