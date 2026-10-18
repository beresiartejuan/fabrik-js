import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductionsScreen } from '@/components/production/productions-screen';
import { ApiError } from '@/lib/api/errors';
import type { BatchWire, MaterialWire, RecipeWire } from '@/lib/api/types';

import { renderWithSession, seedSessionRole } from '../helpers/session';

/**
 * Pantalla 9 — `/produccion` (docs/10-plan-de-web.md §9, Fase 4): lista de
 * lotes activos con `GET /batches?status=in_progress`, resolución de nombres de
 * material/receta según el rol (worker → 403 → ids del wire), buscador por ID
 * con 404 amigable y acciones por rol.
 */

const { mocks } = vi.hoisted(() => ({
  mocks: {
    batchesApi: { list: vi.fn(), get: vi.fn() },
    materialsApi: { list: vi.fn() },
    recipesApi: { list: vi.fn(), get: vi.fn() },
  },
}));

vi.mock('@/lib/api/modules/batchesApi', () => ({ batchesApi: mocks.batchesApi }));
vi.mock('@/lib/api/modules/materialsApi', () => ({ materialsApi: mocks.materialsApi }));
vi.mock('@/lib/api/modules/recipesApi', () => ({ recipesApi: mocks.recipesApi }));

const ROOT: BatchWire = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  materialId: 'm-pan',
  quantity: { amount: 8, unit: 'unit' },
  recipeId: 'r1',
  status: 'in_progress',
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
];

const RECIPES: RecipeWire[] = [
  {
    id: 'r1',
    name: 'Pan francés 8u',
    outputProductId: 'm-pan',
    outputQuantity: { amount: 8, unit: 'unit' },
    steps: [],
  },
];

function resetMocks(role: 'admin' | 'worker' = 'admin'): void {
  window.sessionStorage.clear();
  seedSessionRole(role);
  for (const mock of Object.values(mocks).flatMap((api) => Object.values(api))) {
    mock.mockReset();
  }
  mocks.batchesApi.list.mockResolvedValue([ROOT]);
  mocks.batchesApi.get.mockResolvedValue(ROOT);
  mocks.materialsApi.list.mockResolvedValue(MATERIALS);
  mocks.recipesApi.list.mockResolvedValue(RECIPES);
}

beforeEach(() => resetMocks());

describe('ProductionsScreen: listado activo', () => {
  it('carga con GET /batches?status=in_progress y resuelve nombres (rol lector)', async () => {
    renderWithSession(<ProductionsScreen />);

    expect(await screen.findByText('Pan francés')).toBeInTheDocument();
    expect(mocks.batchesApi.list).toHaveBeenCalledWith({ status: 'in_progress' });
    expect(screen.getByText('Pan francés 8u')).toBeInTheDocument();
    expect(screen.getByText('En curso')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nueva producción' })).toBeInTheDocument();
  });

  it('el worker ve los ids del wire y su CTA de registrar', async () => {
    resetMocks('worker');
    renderWithSession(<ProductionsScreen />);

    expect(await screen.findByText(/aaaaaaaa/)).toBeInTheDocument();
    // Sin catálogos legibles para el rol: no se piden, pero las filas usan ids.
    await waitFor(() => expect(mocks.batchesApi.list).toHaveBeenCalled());
    expect(mocks.materialsApi.list).not.toHaveBeenCalled();
    expect(mocks.recipesApi.list).not.toHaveBeenCalled();
    expect(screen.queryByText('Pan francés 8u')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar transformación' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nueva producción' })).not.toBeInTheDocument();
  });

  it('el auditor ve la lista sin CTAs de escritura', async () => {
    window.sessionStorage.clear();
    seedSessionRole('auditor');
    renderWithSession(<ProductionsScreen />);

    expect(await screen.findByText('Pan francés')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nueva producción' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Registrar transformación' }),
    ).not.toBeInTheDocument();
  });

  it('muestra el estado vacío cuando no hay producciones activas', async () => {
    mocks.batchesApi.list.mockResolvedValue([]);
    renderWithSession(<ProductionsScreen />);

    expect(await screen.findByText('No hay producciones activas')).toBeInTheDocument();
  });
});

describe('ProductionsScreen: buscador por ID', () => {
  it('consulta GET /batches/:id y muestra el lote encontrado', async () => {
    renderWithSession(<ProductionsScreen />);

    fireEvent.change(screen.getByLabelText('Buscar lote por ID'), {
      target: { value: ROOT.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => expect(mocks.batchesApi.get).toHaveBeenCalledWith(ROOT.id));
    // El resultado entra como tarjeta aparte (con botón Cerrar).
    const card = await screen.findByText('Pan francés · 8 u');
    expect(card).toBeInTheDocument();
  });

  it('un id desconocido (404) muestra el mensaje amigable', async () => {
    mocks.batchesApi.get.mockRejectedValue(
      new ApiError({ statusCode: 404, error: 'NotFoundError', message: 'Batch no encontrado' }),
    );
    renderWithSession(<ProductionsScreen />);

    fireEvent.change(screen.getByLabelText('Buscar lote por ID'), {
      target: { value: 'no-existe' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('No se encontró ningún lote con ese ID.')).toBeInTheDocument();
  });

  it('otros errores del buscador van por errorToMessage', async () => {
    mocks.batchesApi.get.mockRejectedValue(
      new ApiError({ statusCode: 403, error: 'UnauthorizedRoleError', message: 'Forbidden' }),
    );
    renderWithSession(<ProductionsScreen />);

    fireEvent.change(screen.getByLabelText('Buscar lote por ID'), {
      target: { value: 'algo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('No tenés permisos para esta acción.')).toBeInTheDocument();
  });
});

describe('ProductionsScreen: enlace a trazabilidad (Fase 6)', () => {
  it('el resultado del buscador enlaza a /trazabilidad?batch= para roles A/Au', async () => {
    renderWithSession(<ProductionsScreen />);

    fireEvent.change(screen.getByLabelText('Buscar lote por ID'), {
      target: { value: ROOT.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    const link = await screen.findByRole('link', { name: 'Ver trazabilidad' });
    expect(link.getAttribute('href')).toBe(`/trazabilidad?batch=${ROOT.id}`);
  });

  it('el worker no recibe el enlace (la trazabilidad es A/Au)', async () => {
    resetMocks('worker');
    renderWithSession(<ProductionsScreen />);

    fireEvent.change(screen.getByLabelText('Buscar lote por ID'), {
      target: { value: ROOT.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    // Sin catálogos el resultado usa el id del wire.
    expect(await screen.findByText('m-pan · 8 u')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver trazabilidad' })).not.toBeInTheDocument();
  });
});
