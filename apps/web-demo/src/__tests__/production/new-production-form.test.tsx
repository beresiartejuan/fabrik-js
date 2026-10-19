import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewProductionForm } from '@/components/production/new-production-form';
import { ApiError } from '@/lib/api/errors';

import { makeBatch, makeMaterial, makeRecipe, makeRecipeStep } from '../helpers/fixtures';
import { selectOptionAsync } from '../helpers/select';

/**
 * Pantalla 10 — `/produccion/nueva` (docs/pantallas.md §10, Fase 4): select
 * de receta con vista previa de pasos → `POST /production/start { recipeId }` →
 * redirect a `/produccion`. Errores mapeados (404 de receta inexistente).
 */

const { toastMocks, mocks } = vi.hoisted(() => ({
  toastMocks: { success: vi.fn(), error: vi.fn() },
  mocks: {
    recipesApi: { list: vi.fn(), get: vi.fn() },
    materialsApi: { list: vi.fn() },
    productionApi: { start: vi.fn() },
    push: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: toastMocks }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }) }));
vi.mock('@/lib/api/modules/recipesApi', () => ({ recipesApi: mocks.recipesApi }));
vi.mock('@/lib/api/modules/materialsApi', () => ({ materialsApi: mocks.materialsApi }));
vi.mock('@/lib/api/modules/productionApi', () => ({ productionApi: mocks.productionApi }));

const FLOUR = makeMaterial({
  id: 'm-harina',
  name: 'Harina 000',
  kind: 'supply',
  physicalState: 'solid',
  unitOfMeasure: 'kg',
});

const BREAD = makeMaterial({
  id: 'm-pan',
  name: 'Pan francés',
  kind: 'product',
  physicalState: 'solid',
  unitOfMeasure: 'unit',
});

const RECIPE = makeRecipe({
  id: 'r1',
  name: 'Panes franceses',
  outputProductId: 'm-pan',
  outputQuantity: { amount: 8, unit: 'unit' },
  steps: [
    makeRecipeStep({
      id: 's1',
      position: 1,
      machineType: 'mixer',
      inputs: [{ materialId: 'm-harina', quantity: { amount: 2, unit: 'kg' } }],
      outputProductId: 'm-pan',
      outputQuantity: { amount: 4, unit: 'unit' },
    }),
    makeRecipeStep({
      id: 's2',
      position: 2,
      machineType: 'oven',
      inputs: [],
      outputProductId: 'm-pan',
      outputQuantity: { amount: 4, unit: 'unit' },
    }),
  ],
});

const ROOT_BATCH = makeBatch({
  id: 'b-root',
  materialId: 'm-pan',
  quantity: { amount: 8, unit: 'unit' },
  recipeId: 'r1',
  status: 'in_progress',
});

beforeEach(() => {
  window.sessionStorage.clear();
  for (const mock of [
    toastMocks.success,
    toastMocks.error,
    mocks.push,
    mocks.recipesApi.list,
    mocks.recipesApi.get,
    mocks.materialsApi.list,
    mocks.productionApi.start,
  ]) {
    mock.mockReset();
  }
  mocks.recipesApi.list.mockResolvedValue([RECIPE]);
  mocks.materialsApi.list.mockResolvedValue([FLOUR, BREAD]);
  mocks.productionApi.start.mockResolvedValue(ROOT_BATCH);
});

describe('NewProductionForm', () => {
  it('lista recetas y muestra la vista previa de pasos al elegir', async () => {
    render(<NewProductionForm />);

    await selectOptionAsync('Receta', 'Panes franceses');

    const previewTitle = await screen.findByText(/Vista previa/);
    const preview = previewTitle.closest('section');
    expect(preview).not.toBeNull();
    expect(preview).toHaveTextContent('Pan francés');
    expect(preview).toHaveTextContent('8 u');
    expect(preview).toHaveTextContent(/Paso 1 · mixer/);
    expect(preview).toHaveTextContent(/Paso 2 · oven/);
  });

  it('inicia la producción con el recipeId y redirige a /produccion', async () => {
    render(<NewProductionForm />);

    await selectOptionAsync('Receta', 'Panes franceses');
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar producción' }));

    await waitFor(() => expect(mocks.productionApi.start).toHaveBeenCalledWith({ recipeId: 'r1' }));
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith(expect.stringMatching(/Producción iniciada/)),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/produccion'));
  });

  it('sin recetas muestra el estado vacío', async () => {
    mocks.recipesApi.list.mockResolvedValue([]);
    render(<NewProductionForm />);

    expect(await screen.findByText('Todavía no hay recetas')).toBeInTheDocument();
    expect(screen.queryByLabelText('Receta')).not.toBeInTheDocument();
  });

  it('mapea el error del servidor (receta inexistente → 404)', async () => {
    mocks.productionApi.start.mockRejectedValue(
      new ApiError({ statusCode: 404, error: 'NotFoundError', message: 'Recipe no encontrada' }),
    );
    render(<NewProductionForm />);

    await selectOptionAsync('Receta', 'Panes franceses');
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar producción' }));

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith('No se encontró el recurso.'),
    );
    // Vuelve a habilitar el botón para reintentar.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Iniciar producción' })).toBeEnabled(),
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
