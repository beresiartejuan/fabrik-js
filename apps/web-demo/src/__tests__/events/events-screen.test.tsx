import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventsScreen } from '@/components/events/events-screen';
import { EVENTS_DISPLAY_LIMIT } from '@/components/events/events-state';
import { ApiError } from '@/lib/api/errors';
import type { BatchEventWire } from '@/lib/api/types';
import { makeBatchEvent, makeMachine, makeMaterial, makeWorker } from '../helpers/fixtures';

/**
 * Pantalla 15 — `/eventos` (Fase 6): filtros (máquina, operario, material,
 * rango `from`/`to` en ISO) → `GET /batch-events`; tabla cronológica ascendente
 * con resúmenes de entradas/salidas y recorte en cliente (gap de paginación:
 * nota «mostrando los últimos N»).
 */

const { mocks } = vi.hoisted(() => ({
  mocks: {
    machinesApi: { list: vi.fn() },
    workersApi: { list: vi.fn() },
    materialsApi: { list: vi.fn() },
    batchEventsApi: { list: vi.fn() },
  },
}));

vi.mock('@/lib/api/modules/machinesApi', () => ({ machinesApi: mocks.machinesApi }));
vi.mock('@/lib/api/modules/workersApi', () => ({ workersApi: mocks.workersApi }));
vi.mock('@/lib/api/modules/materialsApi', () => ({ materialsApi: mocks.materialsApi }));
vi.mock('@/lib/api/modules/batchEventsApi', () => ({ batchEventsApi: mocks.batchEventsApi }));

const MACHINES = [
  makeMachine({ id: 'maq-1', name: 'Amasadora', type: 'amasadora', locationId: 'loc-1' }),
  makeMachine({ id: 'maq-2', name: 'Horno', type: 'horno', locationId: 'loc-1' }),
];

const WORKERS = [makeWorker({ id: 'w-1', name: 'Ada' }), makeWorker({ id: 'w-2', name: 'Bruno' })];

const MATERIALS = [
  makeMaterial({ id: 'm-harina', name: 'Harina 000', kind: 'supply', unitOfMeasure: 'kg' }),
  makeMaterial({
    id: 'm-pan',
    name: 'Pan francés',
    kind: 'product',
    unitOfMeasure: 'unit',
  }),
];

/** Evento con el resumen del listado: 1 · Harina 000 → 1 · Pan francés. */
function event(id: string, overrides: Partial<BatchEventWire> = {}): BatchEventWire {
  return makeBatchEvent({
    id,
    machineId: 'maq-1',
    workerId: 'w-1',
    locationId: 'loc-1',
    inputs: [{ materialId: 'm-harina', quantity: { amount: 5, unit: 'kg' } }],
    outputs: [{ materialId: 'm-pan', quantity: { amount: 8, unit: 'unit' } }],
    observation: 'Sin inconvenientes',
    timestamp: '2026-10-01T10:30:00.000Z',
    ...overrides,
  });
}

function resetMocks(): void {
  for (const api of Object.values(mocks)) {
    for (const mock of Object.values(api)) {
      mock.mockReset();
    }
  }
  mocks.machinesApi.list.mockResolvedValue(MACHINES);
  mocks.workersApi.list.mockResolvedValue(WORKERS);
  mocks.materialsApi.list.mockResolvedValue(MATERIALS);
  mocks.batchEventsApi.list.mockResolvedValue([event('event-2'), event('event-1')]);
}

beforeEach(resetMocks);

describe('EventsScreen: listado cronológico', () => {
  it('carga el listado completo (sin query params) y resuelve los nombres', async () => {
    render(<EventsScreen />);

    await waitFor(() => expect(mocks.batchEventsApi.list).toHaveBeenCalledWith({}));
    // Dos eventos con la misma máquina/operario: ambos resueltos por nombre.
    expect(await screen.findAllByText('Amasadora')).toHaveLength(2);
    expect(screen.getAllByText('Ada')).toHaveLength(2);
    // Fecha formateada para ambos eventos.
    expect(screen.getAllByText(/1\/10/).length).toBeGreaterThan(0);
  });

  it('muestra el resumen de entradas y salidas (cantidad + materiales) y la observación', async () => {
    render(<EventsScreen />);

    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row')[1];
    expect(within(row).getByText('1 · Harina 000')).toBeInTheDocument();
    expect(within(row).getByText('1 · Pan francés')).toBeInTheDocument();
    expect(within(row).getByText('Sin inconvenientes')).toBeInTheDocument();
  });

  it('sin eventos muestra el estado vacío de los filtros', async () => {
    mocks.batchEventsApi.list.mockResolvedValue([]);
    render(<EventsScreen />);

    expect(await screen.findByText('Sin eventos para estos filtros')).toBeInTheDocument();
  });

  it('los eventos sin observación muestran un guion', async () => {
    mocks.batchEventsApi.list.mockResolvedValue([event('event-1', { observation: undefined })]);
    render(<EventsScreen />);

    expect(await screen.findByText('—')).toBeInTheDocument();
  });
});

describe('EventsScreen: filtros', () => {
  async function selectOption(name: string, option: string): Promise<void> {
    const trigger = screen.getByRole('combobox', { name });
    await waitFor(() => expect(trigger).not.toBeDisabled());
    fireEvent.click(trigger);
    // Base UI guarda la activación por mouse: `pointerdown` antes del click
    // marca el ítem como "mouse-pressed", igual que un click real.
    const optionElement = await screen.findByRole('option', { name: option });
    fireEvent.pointerDown(optionElement, { pointerType: 'mouse', button: 0 });
    fireEvent.click(optionElement);
  }

  it('mapea los filtros del borrador al query de la API al aplicar', async () => {
    render(<EventsScreen />);

    await selectOption('Máquina', 'Horno');

    fireEvent.change(screen.getByLabelText('Desde'), {
      target: { value: '2026-10-01T10:00' },
    });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-31T22:30' } });

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() =>
      expect(mocks.batchEventsApi.list).toHaveBeenCalledWith({
        machineId: 'maq-2',
        from: new Date('2026-10-01T10:00').toISOString(),
        to: new Date('2026-10-31T22:30').toISOString(),
      }),
    );
  });

  it('limpiar vuelve a la consulta sin filtros', async () => {
    render(<EventsScreen />);

    await selectOption('Máquina', 'Amasadora');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() =>
      expect(mocks.batchEventsApi.list).toHaveBeenCalledWith({ machineId: 'maq-1' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));

    await waitFor(() => expect(mocks.batchEventsApi.list).toHaveBeenLastCalledWith({}));
  });

  it('una consulta fallida muestra el bloque de error con Reintentar', async () => {
    mocks.batchEventsApi.list.mockRejectedValue(
      new ApiError({ statusCode: 403, error: 'UnauthorizedRoleError', message: 'Forbidden' }),
    );
    render(<EventsScreen />);

    expect(await screen.findByText('No tenés permisos para esta acción.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('recorta al máximo visible (gap de paginación) con una nota', async () => {
    const events = Array.from({ length: EVENTS_DISPLAY_LIMIT + 3 }, (_, i) =>
      event(`event-${String(i).padStart(4, '0')}`, {
        timestamp: new Date(Date.parse('2026-10-01T10:00:00.000Z') + i * 60_000).toISOString(),
        observation: `Observación ${i}`,
      }),
    );
    mocks.batchEventsApi.list.mockResolvedValue(events);
    render(<EventsScreen />);

    expect(
      await screen.findByText(
        `Mostrando los últimos ${EVENTS_DISPLAY_LIMIT} de ${events.length} eventos (la API no pagina todavía).`,
      ),
    ).toBeInTheDocument();
    // Filas visibles: recorte + cabecera.
    await waitFor(() =>
      expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
        EVENTS_DISPLAY_LIMIT + 1,
      ),
    );
    // Ascendente: el recorte conserva la cola (los eventos más nuevos).
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]?.textContent).toContain('Observación 3');
    expect(rows[rows.length - 1]?.textContent).toContain(`Observación ${EVENTS_DISPLAY_LIMIT + 2}`);
  });
});
