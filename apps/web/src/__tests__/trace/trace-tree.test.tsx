import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { type TraceResolvers, TraceTree } from '@/components/trace/trace-tree';
import { normalizeForwardNode, normalizeTraceNode } from '@/components/trace/trace-view';
import type {
  BatchEventWire,
  BatchForwardNodeWire,
  BatchTraceNodeWire,
  BatchWire,
} from '@/lib/api/types';
import { formatDateTime } from '@/lib/format/date';

/**
 * Componente recursivo del árbol de trazabilidad (Fase 6): tarjetas de lote y
 * de evento anidadas (sin librería de grafos), badge destructivo de
 * `cycleDetected` y detalles del evento (máquina, operario, timestamp,
 * observación).
 */

const RESOLVERS: TraceResolvers = {
  materialName: (id) => ({ 'm-pan': 'Pan francés', 'm-harina': 'Harina 000' })[id] ?? id,
  machineName: (id) => (id === 'maq-1' ? 'Amasadora' : id),
  workerName: (id) => (id === 'w-1' ? 'Ada' : id),
};

const ROOT: BatchWire = {
  id: 'rootaaaa-0000-0000-0000-000000000000',
  materialId: 'm-pan',
  quantity: { amount: 8, unit: 'unit' },
  status: 'in_progress',
};

const LEAF: BatchWire = {
  id: 'leafbbbb-0000-0000-0000-000000000000',
  materialId: 'm-harina',
  quantity: { amount: 5, unit: 'kg' },
  status: 'stored',
};

const EVENT = '2026-10-01T10:30:00.000Z';

function event(overrides: Partial<BatchEventWire> = {}): BatchEventWire {
  return {
    id: 'eventcc0-0000-0000-0000-000000000000',
    machineId: 'maq-1',
    workerId: 'w-1',
    locationId: 'loc-1',
    inputs: [{ batchId: LEAF.id, materialId: 'm-harina', quantity: { amount: 5, unit: 'kg' } }],
    outputs: [{ batchId: ROOT.id, materialId: 'm-pan', quantity: { amount: 8, unit: 'unit' } }],
    timestamp: EVENT,
    ...overrides,
  };
}

describe('TraceTree (genealogía hacia atrás)', () => {
  it('renderiza el lote raíz con material resuelto, id corto, cantidad y estado', () => {
    const wire: BatchTraceNodeWire = { batch: ROOT, children: [] };
    render(<TraceTree root={normalizeTraceNode(wire)} resolvers={RESOLVERS} />);

    const idBadge = screen.getByText('#rootaaaa…');
    expect(idBadge).toHaveAttribute('title', ROOT.id);
    expect(screen.getByText('Pan francés')).toBeInTheDocument();
    expect(screen.getByText('8 u')).toBeInTheDocument();
    expect(screen.getByText('En curso')).toBeInTheDocument();
    expect(screen.queryByText('ciclo detectado')).not.toBeInTheDocument();
  });

  it('anida los hijos con la tarjeta del evento del nodo (máquina, operario, fecha, observación)', () => {
    const wire: BatchTraceNodeWire = {
      batch: ROOT,
      event: event({ observation: 'Se removió dos veces' }),
      children: [{ batch: LEAF, children: [] }],
    };
    const { container } = render(
      <TraceTree root={normalizeTraceNode(wire)} resolvers={RESOLVERS} />,
    );

    expect(screen.getByText('Harina 000')).toBeInTheDocument();
    expect(screen.getByText('5 kg')).toBeInTheDocument();
    expect(screen.getByText('Almacenado')).toBeInTheDocument();
    // La hoja (sin evento) no muestra tarjeta de evento.
    expect(screen.getAllByText(/^(Máquina|Operario):/)).toHaveLength(2);
    expect(screen.getByText('Amasadora')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText(formatDateTime(EVENT))).toBeInTheDocument();
    expect(screen.getByText('«Se removió dos veces»')).toBeInTheDocument();

    // Conector simple de indentación: lista anidada dentro del nodo.
    expect(container.querySelector('ul ul')).not.toBeNull();
  });

  it('marca el badge destructivo «ciclo detectado» en la rama cortada', () => {
    const wire: BatchTraceNodeWire = {
      batch: ROOT,
      event: event(),
      children: [{ batch: LEAF, children: [], cycleDetected: true }],
    };
    render(<TraceTree root={normalizeTraceNode(wire)} resolvers={RESOLVERS} />);

    const badge = screen.getByText('ciclo detectado');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('destructive');
  });
});

describe('TraceTree (hacia adelante / recall)', () => {
  it('los nodos de evento muestran solo la tarjeta de evento (lote XOR evento)', () => {
    const wire: BatchForwardNodeWire = {
      batch: ROOT,
      children: [{ event: event(), children: [{ batch: LEAF, children: [] }] }],
    };
    render(<TraceTree root={normalizeForwardNode(wire)} resolvers={RESOLVERS} />);

    // El lote raíz y el descendiente aparecen exacto una vez cada uno.
    expect(screen.getByText('#rootaaaa…')).toBeInTheDocument();
    expect(screen.getByText('#leafbbbb…')).toBeInTheDocument();
    // Dos lotes + un nodo de evento.
    expect(screen.getAllByText(/^(Máquina|Operario):/)).toHaveLength(2);
    expect(screen.getByText(/evento eventcc0/)).toBeInTheDocument();
  });
});
