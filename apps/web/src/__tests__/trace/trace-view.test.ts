import { describe, expect, it } from 'vitest';
import {
  countTraceNodes,
  deriveRecentBatchIds,
  normalizeForwardNode,
  normalizeTraceNode,
} from '@/components/trace/trace-view';
import type { BatchEventWire, BatchForwardNodeWire, BatchTraceNodeWire } from '@/lib/api/types';

/**
 * Normalización pura de los árboles de trazabilidad (Fase 6): el wire **omite**
 * los campos ausentes (`event`, `cycleDetected`); la vista los normaliza a
 * `boolean` para simplificar el componente recursivo.
 */

const BATCH = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  materialId: 'material-pan',
  quantity: { amount: 8, unit: 'unit' as const },
  status: 'in_progress' as const,
};

function event(id: string, outputs: string[] = [], inputs: string[] = []): BatchEventWire {
  return {
    id,
    machineId: 'machine-1',
    workerId: 'worker-1',
    locationId: 'location-1',
    inputs: inputs.map((batchId) => ({
      batchId,
      materialId: 'material-harina',
      quantity: { amount: 5, unit: 'kg' as const },
    })),
    outputs: outputs.map((batchId) => ({
      batchId,
      materialId: 'material-pan',
      quantity: { amount: 8, unit: 'unit' as const },
    })),
    timestamp: `2026-10-01T10:0${id.length % 10}:00.000Z`,
  };
}

describe('normalizeTraceNode (hacia atrás)', () => {
  it('preserva lote + evento y normaliza cycleDetected a false', () => {
    const wire = {
      batch: BATCH,
      event: event('event-1'),
      children: [],
    } satisfies BatchTraceNodeWire;
    const node = normalizeTraceNode(wire);
    expect(node.batch).toEqual(BATCH);
    expect(node.event).toEqual(wire.event);
    expect(node.cycleDetected).toBe(false);
    expect(node.children).toEqual([]);
  });

  it('las hojas (sin evento) quedan con event undefined', () => {
    const wire: BatchTraceNodeWire = { batch: BATCH, children: [] };
    const node = normalizeTraceNode(wire);
    expect(node.event).toBeUndefined();
    expect(node.cycleDetected).toBe(false);
  });

  it('recorre los hijos en profundidad y conserva cycleDetected (true solo en la rama cortada)', () => {
    const child: BatchTraceNodeWire = { batch: BATCH, children: [], cycleDetected: true };
    const grandChild: BatchTraceNodeWire = { batch: BATCH, event: event('event-3'), children: [] };
    const root: BatchTraceNodeWire = {
      batch: BATCH,
      event: event('event-2'),
      children: [child, grandChild],
    };

    const node = normalizeTraceNode(root);
    expect(countTraceNodes(node)).toBe(3);
    expect(node.children[0]?.cycleDetected).toBe(true);
    expect(node.children[1]?.cycleDetected).toBe(false);
  });
});

describe('normalizeForwardNode (recall)', () => {
  it('un nodo es lote o evento, nunca ambos (XOR del wire)', () => {
    const eventNode: BatchForwardNodeWire = { event: event('event-1'), children: [] };
    const batchNode: BatchForwardNodeWire = { batch: BATCH, children: [eventNode] };

    const root = normalizeForwardNode(batchNode);
    expect(root.batch).toEqual(BATCH);
    expect(root.event).toBeUndefined();
    expect(root.children[0]?.event).toEqual(event('event-1'));
    expect(root.children[0]?.batch).toBeUndefined();
  });

  it('cycleDetected se normaliza en todos los niveles del árbol', () => {
    const wire: BatchForwardNodeWire = {
      batch: BATCH,
      children: [{ event: event('event-1'), children: [], cycleDetected: true }],
    };
    const node = normalizeForwardNode(wire);
    expect(node.cycleDetected).toBe(false);
    expect(node.children[0]?.cycleDetected).toBe(true);
    expect(node.children[0]?.children).toEqual([]);
  });
});

describe('deriveRecentBatchIds (lotes recientes)', () => {
  it('recorre los eventos de más nuevo a más viejo: primero salidas, luego entradas', () => {
    const older = event('ev-old', ['batch-old-out'], ['batch-old-in']);
    const newer = event('ev-new', ['batch-new-out'], []);

    const ids = deriveRecentBatchIds([older, newer], 10);
    expect(ids).toEqual(['batch-new-out', 'batch-old-out', 'batch-old-in']);
  });

  it('deduplica lotes repetidos entre eventos', () => {
    const first = event('ev-1', ['batch-shared', 'batch-a'], []);
    const second = event('ev-2', [], ['batch-shared']);

    const ids = deriveRecentBatchIds([first, second], 10);
    expect(ids).toEqual(['batch-shared', 'batch-a']);
  });

  it('respeta el límite y omite insumos sin batchId', () => {
    const withOrphan: BatchEventWire = {
      ...event('ev-1', ['batch-out']),
      inputs: [{ materialId: 'material-otro', quantity: { amount: 3, unit: 'kg' } }],
    };
    const ids = deriveRecentBatchIds([withOrphan], 1);
    expect(ids).toEqual(['batch-out']);
  });

  it('devuelve vacío sin eventos', () => {
    expect(deriveRecentBatchIds([], 6)).toEqual([]);
  });
});
