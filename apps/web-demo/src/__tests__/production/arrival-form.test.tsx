import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ArrivalForm } from '@/components/production/arrival-form';
import { ApiError } from '@/lib/api/errors';
import type { BatchWire, LocationWire, MaterialWire } from '@/lib/api/types';

import { selectOptionAsync } from '../helpers/select';
import { renderWithSession, seedSessionRole } from '../helpers/session';

/**
 * Pantalla 12 — `/suministros/arribo` (docs/pantallas.md §Fase 4):
 * unidad **derivada del material**, payload exacto de `POST /supplies/arrivals`,
 * éxito con lote + «Registrar otro», 422 mapeado y modo manual del worker (los
 * catálogos son A/Au y un operario recibe 403).
 */

const { toastMocks, mocks } = vi.hoisted(() => ({
  toastMocks: { success: vi.fn(), error: vi.fn() },
  mocks: {
    materialsApi: { list: vi.fn() },
    locationsApi: { list: vi.fn() },
    suppliesApi: { arrive: vi.fn() },
  },
}));

vi.mock('sonner', () => ({ toast: toastMocks }));
vi.mock('@/lib/api/modules/materialsApi', () => ({ materialsApi: mocks.materialsApi }));
vi.mock('@/lib/api/modules/locationsApi', () => ({ locationsApi: mocks.locationsApi }));
vi.mock('@/lib/api/modules/suppliesApi', () => ({ suppliesApi: mocks.suppliesApi }));

const SUPPLIES = [
  {
    id: 'm1',
    name: 'Harina 000',
    kind: 'supply' as const,
    physicalState: 'solid' as const,
    unitOfMeasure: 'kg' as const,
    active: true,
  },
  {
    id: 'm2',
    name: 'Levadura',
    kind: 'supply' as const,
    physicalState: 'solid' as const,
    unitOfMeasure: 'g' as const,
    active: true,
  },
] satisfies MaterialWire[];

const STORAGE = [
  { id: 'l1', name: 'Almacén Norte', kind: 'storage' as const },
  { id: 'l2', name: 'Almacén Sur', kind: 'storage' as const },
] satisfies LocationWire[];

const CREATED: BatchWire = {
  id: 'batch-abcd1234-1234',
  materialId: 'm1',
  quantity: { amount: 250, unit: 'kg' },
  status: 'stored',
};

function resetMocks(role: 'admin' | 'worker' = 'admin'): void {
  window.sessionStorage.clear();
  seedSessionRole(role);
  for (const mock of [
    toastMocks.success,
    toastMocks.error,
    ...Object.values(mocks).flatMap((api) => Object.values(api)),
  ]) {
    mock.mockReset();
  }
  mocks.materialsApi.list.mockResolvedValue(SUPPLIES);
  mocks.locationsApi.list.mockResolvedValue(STORAGE);
  mocks.suppliesApi.arrive.mockResolvedValue(CREATED);
}

beforeEach(() => {
  resetMocks();
});

async function fillCatalogMode(): Promise<void> {
  await selectOptionAsync('Material (suministro)', 'Harina 000');
  fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '250' } });
  await selectOptionAsync('Lugar de almacenamiento', 'Almacén Norte');
  fireEvent.click(screen.getByRole('button', { name: 'Registrar arribo' }));
}

describe('ArrivalForm (modo catálogo, admin)', () => {
  it('deriva la unidad del material y envía el payload exacto', async () => {
    renderWithSession(<ArrivalForm />);

    await selectOptionAsync('Material (suministro)', 'Harina 000');
    expect(await screen.findByLabelText('Unidad (del material)')).toHaveValue('kg');

    // Cambiar de material corrige la unidad derivada.
    await selectOptionAsync('Material (suministro)', 'Levadura');
    expect(screen.getByLabelText('Unidad (del material)')).toHaveValue('g');

    await selectOptionAsync('Material (suministro)', 'Harina 000');
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '250' } });
    await selectOptionAsync('Lugar de almacenamiento', 'Almacén Norte');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar arribo' }));

    await waitFor(() =>
      expect(mocks.suppliesApi.arrive).toHaveBeenCalledWith({
        materialId: 'm1',
        quantity: { amount: 250, unit: 'kg' },
        locationId: 'l1',
      }),
    );
  });

  it('materiales y lugares cargan con los filtros kind=supply / kind=storage', async () => {
    renderWithSession(<ArrivalForm />);
    await screen.findByLabelText('Cantidad');
    expect(mocks.materialsApi.list).toHaveBeenCalledWith({ kind: 'supply' });
    expect(mocks.locationsApi.list).toHaveBeenCalledWith({ kind: 'storage' });
  });

  it('éxito: toast con el lote, banner y «Registrar otro» limpia el formulario', async () => {
    renderWithSession(<ArrivalForm />);
    await fillCatalogMode();

    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith('Se registró el arribo · #batch-ab….'),
    );
    expect(screen.getByRole('status')).toHaveTextContent('#batch-ab…');
    expect(screen.getByRole('status')).toHaveTextContent('250 kg');

    // El formulario quedó limpio para el siguiente arribo y el banner se cierra.
    // («Cantidad» es type=number: el valor vacío se reporta como null.)
    expect(screen.getByLabelText('Cantidad')).toHaveValue(null);

    fireEvent.click(screen.getByRole('button', { name: 'Registrar otro' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('la validación bloquea materiales, lugar o cantidad vacíos', async () => {
    renderWithSession(<ArrivalForm />);
    await screen.findByLabelText('Cantidad');

    fireEvent.click(screen.getByRole('button', { name: 'Registrar arribo' }));

    expect(screen.getByText('Elegí un material de tipo suministro.')).toBeInTheDocument();
    expect(screen.getByText('Elegí un lugar de tipo almacén.')).toBeInTheDocument();
    // La cantidad falla en el resumen Y en el campo (2 nodos).
    expect(screen.getAllByText('Ingresá una cantidad mayor a cero.').length).toBeGreaterThan(0);
    expect(mocks.suppliesApi.arrive).not.toHaveBeenCalled();
  });

  it('mapea el 422 (material/lugar de otra clase) al mensaje de dominio', async () => {
    mocks.suppliesApi.arrive.mockRejectedValue(
      new ApiError({
        statusCode: 422,
        error: 'MaterialKindMismatchError',
        message: 'El material es de tipo "product"; se esperaba "supply"',
      }),
    );
    renderWithSession(<ArrivalForm />);
    await fillCatalogMode();

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        'El material es de la clase equivocada (suministro/producto).',
      ),
    );
  });

  it('el 409/404 genérico va al mensaje por status (lugar inexistente)', async () => {
    mocks.suppliesApi.arrive.mockRejectedValue(
      new ApiError({ statusCode: 404, error: 'NotFoundError', message: 'Location no encontrado' }),
    );
    renderWithSession(<ArrivalForm />);
    await fillCatalogMode();

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith('No se encontró el recurso.'),
    );
  });
});

describe('ArrivalForm (modo manual, worker)', () => {
  it('no pide catálogos y arma el arribo con ids + unidad manuales', async () => {
    resetMocks('worker');
    renderWithSession(<ArrivalForm />);

    expect(screen.getByRole('note')).toHaveTextContent('no puede leer los catálogos');
    expect(mocks.materialsApi.list).not.toHaveBeenCalled();
    expect(mocks.locationsApi.list).not.toHaveBeenCalled();

    await selectOptionAsync('Unidad', 'kg');
    fireEvent.change(screen.getByLabelText('ID del material (suministro)'), {
      target: { value: 'm-harina' },
    });
    fireEvent.change(screen.getByLabelText('ID del lugar de almacenamiento'), {
      target: { value: 'l-almacen' },
    });
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar arribo' }));

    await waitFor(() =>
      expect(mocks.suppliesApi.arrive).toHaveBeenCalledWith({
        materialId: 'm-harina',
        quantity: { amount: 10, unit: 'kg' },
        locationId: 'l-almacen',
      }),
    );
    expect(toastMocks.success).toHaveBeenCalled();
  });

  it('el modo catálogo nunca se muestra para el worker', async () => {
    resetMocks('worker');
    renderWithSession(<ArrivalForm />);

    expect(screen.queryByLabelText('Material (suministro)')).not.toBeInTheDocument();
  });
});
