import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StockScreen } from '@/components/stock/stock-screen';
import { ApiError } from '@/lib/api/errors';
import { makeLocation, makeMaterial, makeStockEntry, makeStockMovement } from '../helpers/fixtures';
import { selectOptionAsync } from '../helpers/select';
import { renderWithSession, seedSessionRole } from '../helpers/session';

/**
 * Pantalla 13 — `/stock` (docs/10-plan-de-web.md §13, Fase 5): stock por lugar
 * con cantidades con signo/color, drawer de movimientos (A/Au) con motivos en
 * español y degradación del worker (ID manual de lugar, ids de material y sin
 * movimientos: la API le da 403 en ese endpoint).
 */

const { mocks } = vi.hoisted(() => ({
  mocks: {
    stockApi: { byLocation: vi.fn(), movements: vi.fn() },
    locationsApi: { list: vi.fn() },
    materialsApi: { list: vi.fn() },
  },
}));

vi.mock('@/lib/api/modules/stockApi', () => ({ stockApi: mocks.stockApi }));
vi.mock('@/lib/api/modules/locationsApi', () => ({ locationsApi: mocks.locationsApi }));
vi.mock('@/lib/api/modules/materialsApi', () => ({ materialsApi: mocks.materialsApi }));

const LOCATIONS = [
  makeLocation({ id: 'loc-alma', name: 'Depósito central', kind: 'storage' }),
  makeLocation({ id: 'loc-planta', name: 'Planta norte', kind: 'production' }),
];

const MATERIALS = [
  makeMaterial({
    id: 'm-harina',
    name: 'Harina 000',
    kind: 'supply',
    physicalState: 'solid',
    unitOfMeasure: 'kg',
  }),
  makeMaterial({
    id: 'm-pan',
    name: 'Pan francés',
    kind: 'product',
    physicalState: 'solid',
    unitOfMeasure: 'unit',
  }),
];

const STOCK = [
  makeStockEntry({ materialId: 'm-harina', amount: 25, unit: 'kg' }),
  makeStockEntry({ materialId: 'm-pan', amount: -3.5, unit: 'unit' }),
];

const MOVEMENTS = [
  makeStockMovement({
    id: 'mv-1',
    locationId: 'loc-alma',
    materialId: 'm-harina',
    delta: { amount: 50, unit: 'kg' },
    reason: 'supply_in',
    timestamp: '2026-03-01T10:00:00.000Z',
  }),
  makeStockMovement({
    id: 'mv-2',
    locationId: 'loc-alma',
    materialId: 'm-harina',
    delta: { amount: -25, unit: 'kg' },
    reason: 'consumed',
    batchEventId: 'evento-1234',
    timestamp: '2026-03-02T10:00:00.000Z',
  }),
];

function resetMocks(role: 'admin' | 'worker' | 'auditor' = 'admin'): void {
  window.sessionStorage.clear();
  seedSessionRole(role);
  for (const mock of Object.values(mocks).flatMap((api) => Object.values(api))) {
    mock.mockReset();
  }
  mocks.locationsApi.list.mockResolvedValue(LOCATIONS);
  mocks.materialsApi.list.mockResolvedValue(MATERIALS);
  mocks.stockApi.byLocation.mockResolvedValue(STOCK);
  mocks.stockApi.movements.mockResolvedValue(MOVEMENTS);
}

beforeEach(() => resetMocks());

describe('StockScreen: tabla de stock', () => {
  it('carga el stock del lugar elegido y resuelve los nombres (rol lector)', async () => {
    renderWithSession(<StockScreen />);

    await selectOptionAsync('Lugar', 'Depósito central — Almacén');

    expect(await screen.findByText('Harina 000')).toBeInTheDocument();
    expect(mocks.stockApi.byLocation).toHaveBeenCalledWith('loc-alma');
    expect(screen.getByText('25 kg')).toBeInTheDocument();
    expect(screen.getByText('Pan francés')).toBeInTheDocument();
    expect(screen.getByText('Stock de Depósito central — Almacén')).toBeInTheDocument();
  });

  it('muestra los consumos con signo y color (amount negativo en lugares de producción)', async () => {
    renderWithSession(<StockScreen />);
    await selectOptionAsync('Lugar', 'Depósito central — Almacén');

    expect(await screen.findByText('-3.5 u')).toHaveClass('text-destructive');
    expect(screen.getByText('25 kg')).toHaveClass('text-emerald-700', 'dark:text-emerald-300');
  });

  it('muestra el estado vacío cuando el lugar no tiene stock', async () => {
    mocks.stockApi.byLocation.mockResolvedValue([]);
    renderWithSession(<StockScreen />);
    await selectOptionAsync('Lugar', 'Planta norte — Producción');

    expect(await screen.findByText('No hay stock registrado en este lugar')).toBeInTheDocument();
    expect(mocks.stockApi.byLocation).toHaveBeenCalledWith('loc-planta');
  });

  it('los errores del stock van a QueryError con reintento', async () => {
    mocks.stockApi.byLocation.mockRejectedValue(
      new ApiError({ statusCode: 404, error: 'NotFoundError', message: 'no existe' }),
    );
    renderWithSession(<StockScreen />);
    await selectOptionAsync('Lugar', 'Depósito central — Almacén');

    expect(await screen.findByText('No se encontró el recurso.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('StockScreen: drawer de movimientos (A/Au)', () => {
  it('abre el drawer, consulta los movimientos con el material y muestra motivos en español', async () => {
    renderWithSession(<StockScreen />);
    await selectOptionAsync('Lugar', 'Depósito central — Almacén');

    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver movimientos' }))[0]);

    expect(await screen.findByText('Movimientos — Harina 000')).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.stockApi.movements).toHaveBeenCalledWith('loc-alma', 'm-harina'),
    );

    // El más reciente primero: el consumo (-25) antes que el ingreso (+50).
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('-25 kg');
    expect(items[0]).toHaveTextContent('Consumo');
    expect(items[0]).toHaveTextContent('Evento evento-1…');
    expect(items[1]).toHaveTextContent('+50 kg');
    expect(items[1]).toHaveTextContent('Ingreso de suministro');
  });

  it('muestra el estado vacío del drawer cuando no hay movimientos', async () => {
    mocks.stockApi.movements.mockResolvedValue([]);
    renderWithSession(<StockScreen />);
    await selectOptionAsync('Lugar', 'Depósito central — Almacén');

    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver movimientos' }))[0]);

    expect(
      await screen.findByText('No hay movimientos para este material en este lugar'),
    ).toBeInTheDocument();
  });
});

describe('StockScreen: worker (degradación)', () => {
  it('no pide catálogos, ingresa el ID del lugar a mano y ve ids de material', async () => {
    resetMocks('worker');
    renderWithSession(<StockScreen />);

    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(mocks.locationsApi.list).not.toHaveBeenCalled();
    expect(mocks.materialsApi.list).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('ID del lugar'), { target: { value: 'loc-alma' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));

    expect(await screen.findByText('m-harina')).toBeInTheDocument();
    expect(mocks.stockApi.byLocation).toHaveBeenCalledWith('loc-alma');
    expect(screen.queryByText('Harina 000')).not.toBeInTheDocument();
    expect(screen.getByText('-3.5 u')).toBeInTheDocument();
  });

  it('el worker no tiene acceso al drawer de movimientos (en la API recibe 403)', async () => {
    resetMocks('worker');
    renderWithSession(<StockScreen />);

    fireEvent.change(screen.getByLabelText('ID del lugar'), { target: { value: 'loc-alma' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    await screen.findByText('m-harina');

    expect(screen.queryByRole('button', { name: 'Ver movimientos' })).not.toBeInTheDocument();
    expect(mocks.stockApi.movements).not.toHaveBeenCalled();
  });
});
