import {
  Batch,
  BatchEvent,
  BatchEventId,
  type BatchForwardNode,
  BatchId,
  type BatchTraceNode,
  LocationId,
  MachineId,
  MaterialId,
  Quantity,
  WorkerId,
} from '@fabrik/domain';
import { describe, expect, it } from 'vitest';

import { serializeBatchForwardNode, serializeBatchTraceNode } from './trace.dto.js';

/**
 * Los serializadores de trazabilidad recorren el árbol recursivamente y se apoyan
 * en `serializeBatch`/`serializeBatchEvent`. Este test fija el contrato del wire:
 * forma de los nodos, `Date` → ISO, y `cycleDetected` solo cuando es `true`.
 */

function supplyBatch(): Batch {
  return Batch.create({
    materialId: MaterialId.from('flour'),
    quantity: Quantity.create(2, 'kg'),
    status: 'stored',
  });
}

function event(observation?: string): BatchEvent {
  return BatchEvent.create({
    machineId: MachineId.from('machine-1'),
    workerId: WorkerId.from('worker-1'),
    locationId: LocationId.from('loc-1'),
    inputs: [
      {
        batchId: BatchId.from('in-1'),
        materialId: MaterialId.from('flour'),
        quantity: Quantity.create(2, 'kg'),
      },
    ],
    outputs: [{ materialId: MaterialId.from('dough'), quantity: Quantity.create(2, 'kg') }],
    ...(observation !== undefined ? { observation } : {}),
    timestamp: new Date('2026-05-13T10:00:00.000Z'),
  });
}

describe('trace serializers', () => {
  it('serializeBatchTraceNode recorre el árbol: hojas sin event, event con ISO y observación', () => {
    const leaf = supplyBatch();
    const root: BatchTraceNode = {
      batch: Batch.create({
        materialId: MaterialId.from('dough'),
        quantity: Quantity.create(2, 'kg'),
        status: 'stored',
        originBatchEventId: BatchEventId.from('ev-1'),
      }),
      event: event('  mezclado  '),
      children: [{ batch: leaf, children: [] }],
    };

    const serialized = serializeBatchTraceNode(root);
    expect(serialized.event?.observation).toBe('mezclado');
    expect(serialized.event?.timestamp).toBe('2026-05-13T10:00:00.000Z');
    expect(serialized.children).toHaveLength(1);
    expect(serialized.children[0].event).toBeUndefined();
    expect(serialized.children[0].batch.materialId).toBe('flour');
    // `cycleDetected` no se emite cuando es `undefined`.
    expect(Object.keys(serialized)).not.toContain('cycleDetected');
  });

  it('serializeBatchTraceNode emite cycleDetected solo cuando la rama se corta', () => {
    const node: BatchTraceNode = {
      batch: supplyBatch(),
      children: [{ batch: supplyBatch(), children: [], cycleDetected: true }],
    };
    const serialized = serializeBatchTraceNode(node);
    expect(serialized.cycleDetected).toBeUndefined();
    expect(serialized.children[0].cycleDetected).toBe(true);
  });

  it('serializeBatchForwardNode distingue nodos de lote (batch) y de evento (event)', () => {
    const root: BatchForwardNode = {
      batch: supplyBatch(),
      children: [
        {
          event: event(),
          children: [{ batch: supplyBatch(), children: [] }],
        },
      ],
    };
    const serialized = serializeBatchForwardNode(root);
    expect(serialized.batch?.materialId).toBe('flour');
    expect(serialized.event).toBeUndefined();
    expect(serialized.children[0].event?.machineId).toBe('machine-1');
    expect(serialized.children[0].batch).toBeUndefined();
    expect(serialized.children[0].children[0].batch?.materialId).toBe('flour');
    expect(serialized.children[0].children[0].event).toBeUndefined();
  });
});
