import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TraceScreen } from '@/components/trace/trace-screen';
import { ApiError } from '@/lib/api/errors';
import type {
  BatchEventWire,
  BatchForwardNodeWire,
  BatchTraceNodeWire,
  BatchWire,
  MachineWire,
  MaterialWire,
  WorkerWire,
} from '@/lib/api/types';

/**
 * Pantalla 14 — `/trazabilidad` (Fase 6): buscador por ID de lote, «lotes
 * recientes» derivados de `GET /batch-events`, tabs Genealogía (hacia atrás) /
 * Recall (hacia adelante) y 404 amigable de un lote desconocido. El deep-link
 * `?batch=` (lo enlaza `/produccion`) autocarga la trazabilidad.
 */

const { mocks, searchParamsValue } = vi.hoisted(() => ({
  mocks: {
    traceApi: { backward: vi.fn(), forward: vi.fn() },
    batchEventsApi: { list: vi.fn() },
    materialsApi: { list: vi.fn() },
    machinesApi: { list: vi.fn() },
    workersApi: { list: vi.fn() },
  },
  searchParamsValue: { current: '' },
}));

vi.mock('@/lib/api/modules/traceApi', () => ({ traceApi: mocks.traceApi }));
vi.mock('@/lib/api/modules/batchEventsApi', () => ({ batchEventsApi: mocks.batchEventsApi }));
vi.mock('@/lib/api/modules/materialsApi', () => ({ materialsApi: mocks.materialsApi }));
vi.mock('@/lib/api/modules/machinesApi', () => ({ machinesApi: mocks.machinesApi }));
vi.mock('@/lib/api/modules/workersApi', () => ({ workersApi: mocks.workersApi }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsValue.current),
}));

const BATCH_ID = 'rootaaaa-0000-0000-0000-000000000000';
const SUPPLY_ID = 'leafbbbb-0000-0000-0000-000000000000';

const ROOT_BATCH: BatchTraceNodeWire['batch'] = {
  id: BATCH_ID,
  materialId: 'm-pan',
  quantity: { amount: 8, unit: 'unit' },
  status: 'in_progress',
};

const SUPPLY: BatchWire = {
  id: SUPPLY_ID,
  materialId: 'm-harina',
  quantity: { amount: 5, unit: 'kg' },
  status: 'stored',
};

const EVENT: BatchEventWire = {
  id: 'eventcc0-0000-0000-0000-000000000000',
  machineId: 'maq-1',
  workerId: 'w-1',
  locationId: 'loc-1',
  inputs: [{ batchId: SUPPLY_ID, materialId: 'm-harina', quantity: { amount: 5, unit: 'kg' } }],
  outputs: [{ batchId: BATCH_ID, materialId: 'm-pan', quantity: { amount: 8, unit: 'unit' } }],
  observation: 'Se removió dos veces',
  timestamp: '2026-10-01T10:30:00.000Z',
};

const BACKWARD: BatchTraceNodeWire = {
  batch: ROOT_BATCH,
  event: EVENT,
  children: [{ batch: SUPPLY, children: [] }],
};

const FORWARD: BatchForwardNodeWire = {
  batch: ROOT_BATCH,
  children: [{ event: EVENT, children: [{ batch: SUPPLY, children: [] }] }],
};

const MATERIALS: MaterialWire[] = [
  {
    id: 'm-pan',
    name: 'Pan francés',
    kind: 'product',
    physicalState: 'solid',
    unitOfMeasure: 'unit',
    active: true,
  },
  {
    id: 'm-harina',
    name: 'Harina 000',
    kind: 'supply',
    physicalState: 'solid',
    unitOfMeasure: 'kg',
    active: true,
  },
];

const MACHINES: MachineWire[] = [
  { id: 'maq-1', name: 'Amasadora', type: 'amasadora', locationId: 'loc-1', status: 'idle' },
];

const WORKERS: WorkerWire[] = [{ id: 'w-1', name: 'Ada', role: 'worker', active: true }];

/** Un evento reciente cuyo output es el lote raíz (alimenta «lotes recientes»). */
const PAST_EVENT: BatchEventWire = EVENT;

function resetMocks(): void {
  window.sessionStorage.clear();
  searchParamsValue.current = '';
  for (const api of Object.values(mocks)) {
    for (const mock of Object.values(api)) {
      mock.mockReset();
    }
  }
  mocks.traceApi.backward.mockResolvedValue(BACKWARD);
  mocks.traceApi.forward.mockResolvedValue(FORWARD);
  mocks.batchEventsApi.list.mockResolvedValue([PAST_EVENT]);
  mocks.materialsApi.list.mockResolvedValue(MATERIALS);
  mocks.machinesApi.list.mockResolvedValue(MACHINES);
  mocks.workersApi.list.mockResolvedValue(WORKERS);
}

beforeEach(resetMocks);

describe('TraceScreen: buscador', () => {
  it('sin lote muestra el estado vacío y no consulta la trazabilidad', () => {
    render(<TraceScreen />);

    expect(screen.getByText('Buscá un lote por su ID')).toBeInTheDocument();
    expect(mocks.traceApi.backward).not.toHaveBeenCalled();
    expect(mocks.traceApi.forward).not.toHaveBeenCalled();
  });

  it('al buscar por ID carga la genealogía hacia atrás y resuelve nombres', async () => {
    render(<TraceScreen />);

    fireEvent.change(screen.getByLabelText('Buscar lote por ID'), { target: { value: BATCH_ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => expect(mocks.traceApi.backward).toHaveBeenCalledWith(BATCH_ID));
    expect(await screen.findByText('Pan francés')).toBeInTheDocument();
    expect(screen.getByText('Harina 000')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Genealogía' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Recall' })).toBeInTheDocument();
  });

  it('un lote desconocido (404) muestra el mensaje amigable sin tabs', async () => {
    mocks.traceApi.backward.mockRejectedValue(
      new ApiError({ statusCode: 404, error: 'NotFoundError', message: 'Batch no encontrado' }),
    );
    render(<TraceScreen />);

    fireEvent.change(screen.getByLabelText('Buscar lote por ID'), { target: { value: 'no-es' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('No se encontró ningún lote con ese ID.')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('otros errores muestran el bloque con Reintentar', async () => {
    mocks.traceApi.backward.mockRejectedValue(
      new ApiError({
        statusCode: 0,
        error: 'NetworkError',
        message: 'down',
        isNetworkError: true,
      }),
    );
    render(<TraceScreen />);

    fireEvent.change(screen.getByLabelText('Buscar lote por ID'), { target: { value: BATCH_ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('No se pudo contactar al servidor.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('TraceScreen: tabs y recall', () => {
  it('la pestaña Recall muestra el árbol hacia adelante (lote y nodos de evento)', async () => {
    render(<TraceScreen />);

    fireEvent.change(screen.getByLabelText('Buscar lote por ID'), { target: { value: BATCH_ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Pan francés');

    fireEvent.click(screen.getByRole('tab', { name: 'Recall' }));

    expect(mocks.traceApi.forward).toHaveBeenCalledWith(BATCH_ID);
    // El panel anterior se desmonta: queda solo el panel activo de recall
    // (los «lotes recientes» de la búsqueda quedan fuera de él).
    const panel = await screen.findByRole('tabpanel');
    expect(within(panel).getAllByText('#rootaaaa…')).toHaveLength(1);
    expect(within(panel).getAllByText('#leafbbbb…')).toHaveLength(1);
    // El nodo del evento que consumió el lote raíz (tarjeta de evento sin lote).
    expect(within(panel).getByText(/evento eventcc0/)).toBeInTheDocument();
  });

  it('un lote de suministro sin consumo muestra el recall vacío', async () => {
    mocks.traceApi.forward.mockResolvedValue({ batch: SUPPLY, children: [] });
    render(<TraceScreen />);

    fireEvent.change(screen.getByLabelText('Buscar lote por ID'), {
      target: { value: SUPPLY_ID },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Harina 000');
    fireEvent.click(screen.getByRole('tab', { name: 'Recall' }));

    expect(
      await screen.findByText(/no hay productos derivados \(recall vacío\)/i),
    ).toBeInTheDocument();
  });
});

describe('TraceScreen: lotes recientes y deep-link', () => {
  it('deriva los lotes recientes del historial de eventos y los carga al hacer clic', async () => {
    render(<TraceScreen />);

    const chip = await screen.findByRole('button', { name: '#rootaaaa…' });
    fireEvent.click(chip);

    await waitFor(() => expect(mocks.traceApi.backward).toHaveBeenCalledWith(BATCH_ID));
    expect(await screen.findByText('Pan francés')).toBeInTheDocument();
    // El buscador refleja el lote elegido.
    expect(screen.getByLabelText('Buscar lote por ID')).toHaveValue(BATCH_ID);
  });

  it('acepta el deep-link ?batch= y autocarga la trazabilidad', () => {
    searchParamsValue.current = `batch=${BATCH_ID}`;
    render(<TraceScreen />);

    expect(screen.getByLabelText('Buscar lote por ID')).toHaveValue(BATCH_ID);
    expect(mocks.traceApi.backward).toHaveBeenCalledWith(BATCH_ID);
    expect(mocks.traceApi.forward).toHaveBeenCalledWith(BATCH_ID);
  });
});
