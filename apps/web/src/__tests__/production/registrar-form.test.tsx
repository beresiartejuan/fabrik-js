import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RegistrarForm } from '@/components/production/registrar-form';
import { ApiError } from '@/lib/api/errors';
import type { BatchWire, RecipeWire } from '@/lib/api/types';
import {
  makeBatch,
  makeLocation,
  makeMaterial,
  makeMeScheduleItem,
  makeRecipe,
  makeRecipeStep,
  makeTransformation,
} from '../helpers/fixtures';
import { selectOptionAsync } from '../helpers/select';
import { renderWithSession, seedSessionRole } from '../helpers/session';

/**
 * Pantalla 11 — `/produccion/registrar` (docs/10-plan-de-web.md §11, Fase 4):
 * máquinas filtradas por `activeNow` + fuera de mantenimiento, payload exacto de
 * `POST /production/transform` (sin `workerId`/`timestamp`), contador de
 * observación, panel de output batches tras el 201 y seguimientos
 * `store`/`complete`. En modo worker las salidas y el lugar del `store` van
 * manuales (los catálogos son A/Au → 403).
 */

const { toastMocks, mocks } = vi.hoisted(() => ({
  toastMocks: { success: vi.fn(), error: vi.fn() },
  mocks: {
    meApi: { schedule: vi.fn() },
    batchesApi: { list: vi.fn(), get: vi.fn() },
    materialsApi: { list: vi.fn() },
    locationsApi: { list: vi.fn() },
    recipesApi: { get: vi.fn(), list: vi.fn() },
    productionApi: { transform: vi.fn(), store: vi.fn(), complete: vi.fn(), start: vi.fn() },
  },
}));

vi.mock('sonner', () => ({ toast: toastMocks }));
vi.mock('@/lib/api/modules/meApi', () => ({ meApi: mocks.meApi }));
vi.mock('@/lib/api/modules/batchesApi', () => ({ batchesApi: mocks.batchesApi }));
vi.mock('@/lib/api/modules/materialsApi', () => ({ materialsApi: mocks.materialsApi }));
vi.mock('@/lib/api/modules/locationsApi', () => ({ locationsApi: mocks.locationsApi }));
vi.mock('@/lib/api/modules/recipesApi', () => ({ recipesApi: mocks.recipesApi }));
vi.mock('@/lib/api/modules/productionApi', () => ({ productionApi: mocks.productionApi }));

const SLOT = { daysOfWeek: [1] as const, start: '08:00', end: '16:00' };

function machineItem(
  id: string,
  name: string,
  type: string,
  status: 'idle' | 'running' | 'maintenance',
  activeNow: boolean,
) {
  return makeMeScheduleItem({
    workerId: 'w1',
    machineId: id,
    slot: { ...SLOT, daysOfWeek: [...SLOT.daysOfWeek] },
    machine: { id, name, type, locationId: 'l-planta', status },
    activeNow,
  });
}

const HARINA = makeBatch({
  id: '11111111-1111-1111-1111-111111111111',
  materialId: 'm-harina',
  quantity: { amount: 100, unit: 'kg' },
  status: 'stored',
});

const ROOT = makeBatch({
  id: '22222222-2222-2222-2222-222222222222',
  materialId: 'm-harina',
  quantity: { amount: 10, unit: 'unit' },
  recipeId: 'r1',
  status: 'in_progress',
});

const OUTPUT_BATCH = makeBatch({
  id: '99999999-9999-9999-9999-999999999999',
  materialId: 'm-masa',
  quantity: { amount: 5, unit: 'unit' },
  originBatchEventId: 'ev-1',
  status: 'in_progress',
});

const RESPONSE_TRANSFORM = makeTransformation({
  event: {
    id: 'ev-1',
    machineId: 'm-mixer',
    workerId: 'w1',
    locationId: 'l-planta',
    inputs: [],
    outputs: [],
    timestamp: '2026-10-17T10:00:00.000Z',
  },
  outputBatches: [OUTPUT_BATCH],
});

const MASA = makeMaterial({
  id: 'm-masa',
  name: 'Masa',
  kind: 'product',
  physicalState: 'solid',
  unitOfMeasure: 'unit',
});

const ALMACEN = makeLocation({ id: 'l-almacen', name: 'Almacén Norte', kind: 'storage' });

function resetMocks(): void {
  window.sessionStorage.clear();
  seedSessionRole('worker');
  for (const mock of [
    toastMocks.success,
    toastMocks.error,
    ...Object.values(mocks).flatMap((api) => Object.values(api)),
  ]) {
    mock.mockReset();
  }
  // Vigente | fuera de franja | en mantenimiento | máquina huérfana (null).
  mocks.meApi.schedule.mockResolvedValue([
    machineItem('m-mixer', 'Mezcladora', 'mixer', 'running', true),
    machineItem('m-oven', 'Horno', 'oven', 'idle', false),
    machineItem('m-parada', 'Parada', 'mixer', 'maintenance', true),
    { ...machineItem('m-orphan', 'Orfana', 'mixer', 'idle', true), machine: null },
  ]);
  mocks.batchesApi.list.mockResolvedValue([HARINA]);
  mocks.materialsApi.list.mockResolvedValue([MASA]);
  mocks.locationsApi.list.mockResolvedValue([ALMACEN]);
  mocks.recipesApi.get.mockResolvedValue(null as unknown as RecipeWire);
  mocks.productionApi.transform.mockResolvedValue(RESPONSE_TRANSFORM);
  mocks.productionApi.store.mockResolvedValue({ ...OUTPUT_BATCH, status: 'stored' });
  mocks.productionApi.complete.mockResolvedValue({ ...ROOT, status: 'completed' });
}

/** Elige la máquina, agrega un insumo con su lote y completa la cantidad. */
async function fillFormWithInputs(batch: BatchWire): Promise<void> {
  await selectOptionAsync('Máquina (asignada ahora)', /Mezcladora/);
  fireEvent.click(screen.getByRole('button', { name: 'Agregar insumo' }));
  await selectOptionAsync('Insumo 1 · Lote', RegExp(`#${batch.id.slice(0, 8)}`));
  fireEvent.change(screen.getByLabelText('Insumo 1 · Cantidad'), { target: { value: '2' } });
}

/** Agrega una salida en modo manual (worker, sin catálogo). */
async function addManualOutput(materialId = 'm-masa', amount = '5'): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Agregar salida' }));
  fireEvent.change(screen.getByLabelText('Salida 1 · ID del material'), {
    target: { value: materialId },
  });
  await selectOptionAsync('Salida 1 · Unidad', 'u');
  fireEvent.change(screen.getByLabelText('Salida 1 · Cantidad'), { target: { value: amount } });
}

/** Consulta el panel de resultado (hay un `aria-live` del contador: se busca por texto). */
async function resultPanel(): Promise<HTMLElement> {
  const heading = await screen.findByText(/Transformación registrada/);
  const panel = heading.closest('section');
  expect(panel).not.toBeNull();
  return panel as HTMLElement;
}

beforeEach(resetMocks);

describe('RegistrarForm: máquinas', () => {
  it('ofrece solo las activas ahora y fuera de mantenimiento (de /me/schedule)', async () => {
    renderWithSession(<RegistrarForm />);

    // Abre el popup sin seleccionar para inspeccionar las opciones.
    await screen.findByLabelText('Máquina (asignada ahora)');
    const trigger = await screen.findByLabelText('Máquina (asignada ahora)');
    await waitFor(() => expect(trigger.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(trigger);

    const options = await screen.findAllByRole('option');
    const labels = options.map((option) => option.textContent ?? '');
    expect(labels.some((label) => /Mezcladora \(mixer\)/.test(label))).toBe(true);
    expect(labels.some((label) => /Horno/.test(label))).toBe(false);
    expect(labels.some((label) => /Parada/.test(label))).toBe(false);
    expect(labels.some((label) => /Orfana/.test(label))).toBe(false);
  });

  it('sin máquinas vigentes muestra el aviso y oculta el formulario', async () => {
    mocks.meApi.schedule.mockResolvedValue([machineItem('m-oven', 'Horno', 'oven', 'idle', false)]);
    renderWithSession(<RegistrarForm />);

    expect(await screen.findByText(/No tenés máquinas activas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar insumo' })).not.toBeInTheDocument();
  });

  it('el worker no pide catálogos (materials): las salidas van manuales', async () => {
    renderWithSession(<RegistrarForm />);

    await fillFormWithInputs(HARINA);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar salida' }));
    // Modo manual: sin select de material (solo id + unidad).
    expect(screen.queryByLabelText('Salida 1 · Material')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Salida 1 · ID del material')).toBeInTheDocument();
    expect(mocks.materialsApi.list).not.toHaveBeenCalled();
  });
});

describe('RegistrarForm: envío de la transformación', () => {
  it('envía el payload exacto (unidad derivada del lote) y sin worker/timestamp', async () => {
    renderWithSession(<RegistrarForm />);

    await fillFormWithInputs(HARINA);
    await addManualOutput();
    fireEvent.change(screen.getByLabelText('Observación (opcional)'), {
      target: { value: ' hornada 1 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar transformación' }));

    await waitFor(() => expect(mocks.productionApi.transform).toHaveBeenCalledTimes(1));
    expect(mocks.productionApi.transform).toHaveBeenCalledWith({
      machineId: 'm-mixer',
      inputs: [{ batchId: HARINA.id, quantity: { amount: 2, unit: 'kg' } }],
      outputs: [{ materialId: 'm-masa', quantity: { amount: 5, unit: 'unit' } }],
      observation: 'hornada 1',
    });
    const body = mocks.productionApi.transform.mock.calls[0][0] as Record<string, unknown>;
    expect('timestamp' in body).toBe(false);
    expect('workerId' in body).toBe(false);
  });

  it('muestra el contador de observación (n/500)', async () => {
    renderWithSession(<RegistrarForm />);

    fireEvent.change(await screen.findByLabelText('Observación (opcional)'), {
      target: { value: 'hola' },
    });
    expect(screen.getByText('4/500')).toBeInTheDocument();
  });

  it('tras el 201 muestra output batches, limpiar el formulario y refrescar lotes', async () => {
    renderWithSession(<RegistrarForm />);

    await fillFormWithInputs(HARINA);
    await addManualOutput();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar transformación' }));

    const panel = await resultPanel();
    expect(within(panel).getByText('5 u')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Almacenar lote' })).toBeInTheDocument();

    // El formulario quedó limpio (se conservó la máquina elegida).
    expect(screen.queryByLabelText('Insumo 1 · Cantidad')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Salida 1 · Cantidad')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.batchesApi.list).toHaveBeenCalledTimes(2));
  });

  it('valida en cliente y no envía con el formulario incompleto', async () => {
    renderWithSession(<RegistrarForm />);

    await selectOptionAsync('Máquina (asignada ahora)', /Mezcladora/);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar insumo' }));
    // Sin lote ni cantidad: el resumen de issues aparece con el submit.
    fireEvent.click(screen.getByRole('button', { name: 'Registrar transformación' }));

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Completá el lote del insumo 1.').length).toBeGreaterThan(0);
    expect(mocks.productionApi.transform).not.toHaveBeenCalled();
  });

  it('mapea el 409 del servidor (worker no asignado)', async () => {
    mocks.productionApi.transform.mockRejectedValue(
      new ApiError({
        statusCode: 409,
        error: 'WorkerNotAssignedError',
        message: 'No estás asignado a esa máquina en este horario.',
      }),
    );
    renderWithSession(<RegistrarForm />);

    await fillFormWithInputs(HARINA);
    await addManualOutput();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar transformación' }));

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        'No estás asignado a esa máquina en este horario.',
      ),
    );
    expect(screen.queryByText(/Transformación registrada/)).not.toBeInTheDocument();
  });
});

describe('RegistrarForm: pasos de receta', () => {
  it('deriva los pasos de la receta del primer input, filtrados por tipo de máquina', async () => {
    mocks.batchesApi.list.mockResolvedValue([HARINA, ROOT]);
    mocks.recipesApi.get.mockResolvedValue(
      makeRecipe({
        id: 'r1',
        name: 'Panes',
        outputProductId: 'p1',
        outputQuantity: { amount: 8, unit: 'unit' },
        steps: [
          makeRecipeStep({
            id: 'step-mixer',
            position: 1,
            machineType: 'mixer',
            outputProductId: 'p1',
            outputQuantity: { amount: 8, unit: 'unit' },
          }),
          makeRecipeStep({
            id: 'step-oven',
            position: 2,
            machineType: 'oven',
            outputProductId: 'p1',
            outputQuantity: { amount: 8, unit: 'unit' },
          }),
        ],
      }),
    );
    renderWithSession(<RegistrarForm />);

    await fillFormWithInputs(ROOT); // input con recipeId → contexto de receta
    fireEvent.click(await screen.findByLabelText('Paso de receta (opcional)'));

    const options = await screen.findAllByRole('option');
    const labels = options.map((option) => option.textContent ?? '');
    expect(labels.some((label) => /Paso 1 · mixer/.test(label))).toBe(true);
    expect(labels.some((label) => /Ad-hoc/.test(label))).toBe(true);
    expect(labels.some((label) => /oven/.test(label))).toBe(false);
  });

  it('sin receta legible (worker → 403) la transformación queda ad-hoc', async () => {
    mocks.batchesApi.list.mockResolvedValue([HARINA, ROOT]);
    mocks.recipesApi.get.mockRejectedValue(
      new ApiError({ statusCode: 403, error: 'UnauthorizedRoleError', message: 'Forbidden' }),
    );
    renderWithSession(<RegistrarForm />);

    await fillFormWithInputs(ROOT);
    expect(await screen.findByText(/La receta no está disponible para tu rol/)).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Paso de receta (opcional)' }),
    ).not.toBeInTheDocument();
  });
});

describe('RegistrarForm: seguimientos (store/complete)', () => {
  it('Almacenar pide el lugar (manual para worker) y llama a store', async () => {
    renderWithSession(<RegistrarForm />);

    await fillFormWithInputs(HARINA);
    await addManualOutput();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar transformación' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Almacenar lote' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /Almacenar lote/ })).toBeInTheDocument();
    // El worker no puede listar lugares (403): modo manual.
    expect(within(dialog).getByLabelText('ID del lugar de almacenamiento')).toBeInTheDocument();
    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('ID del lugar de almacenamiento'), {
      target: { value: 'l-almacen' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Almacenar lote' }));

    await waitFor(() =>
      expect(mocks.productionApi.store).toHaveBeenCalledWith({
        batchId: OUTPUT_BATCH.id,
        locationId: 'l-almacen',
      }),
    );
    expect(toastMocks.success).toHaveBeenCalledWith('Lote #99999999… almacenado.');
    // El lote del panel pasa a «Almacenado».
    expect(await resultPanel()).toHaveTextContent('Almacenado');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('con catálogo legible (rol lector) el store usa el select de almacenes', async () => {
    window.sessionStorage.clear();
    seedSessionRole('admin');
    renderWithSession(<RegistrarForm />);

    await fillFormWithInputs(HARINA);
    // Modo catálogo: la salida usa el select de productos (unidad derivada).
    fireEvent.click(screen.getByRole('button', { name: 'Agregar salida' }));
    await selectOptionAsync('Salida 1 · Material', 'Masa');
    fireEvent.change(screen.getByLabelText('Salida 1 · Cantidad'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar transformación' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Almacenar lote' }));

    const dialog = await screen.findByRole('dialog');
    await selectOptionAsync('Lugar de almacenamiento', 'Almacén Norte', dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Almacenar lote' }));

    await waitFor(() =>
      expect(mocks.productionApi.store).toHaveBeenCalledWith({
        batchId: OUTPUT_BATCH.id,
        locationId: 'l-almacen',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('ofrece «Completar producción» para el lote raíz cuando el input trae receta', async () => {
    mocks.batchesApi.list.mockResolvedValue([HARINA, ROOT]);
    renderWithSession(<RegistrarForm />);

    await fillFormWithInputs(ROOT);
    await addManualOutput();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar transformación' }));

    const panel = await resultPanel();
    expect(within(panel).getByText(/Orden de producción/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Completar producción' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Completar producción' }),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Completar producción' }));

    await waitFor(() =>
      expect(mocks.productionApi.complete).toHaveBeenCalledWith({ batchId: ROOT.id }),
    );
    expect(toastMocks.success).toHaveBeenCalledWith('Producción completada.');
  });

  it('el error al almacenar se mapea y el diálogo queda abierto', async () => {
    mocks.productionApi.store.mockRejectedValue(
      new ApiError({
        statusCode: 409,
        error: 'InvalidStateTransitionError',
        message: 'El lote ya está almacenado.',
      }),
    );
    renderWithSession(<RegistrarForm />);

    await fillFormWithInputs(HARINA);
    await addManualOutput();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar transformación' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Almacenar lote' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('ID del lugar de almacenamiento'), {
      target: { value: 'l-almacen' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Almacenar lote' }));

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith('El lote no admite esa transición de estado.'),
    );
    expect(screen.queryByRole('dialog')).toBeInTheDocument();
  });

  it('el error al completar se mapea; el ConfirmDialog queda abierto', async () => {
    mocks.batchesApi.list.mockResolvedValue([HARINA, ROOT]);
    mocks.productionApi.complete.mockRejectedValue(
      new ApiError({
        statusCode: 409,
        error: 'InvalidStateTransitionError',
        message: 'El lote ya está completado.',
      }),
    );
    renderWithSession(<RegistrarForm />);

    await fillFormWithInputs(ROOT);
    await addManualOutput();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar transformación' }));
    const panel = await resultPanel();
    fireEvent.click(within(panel).getByRole('button', { name: 'Completar producción' }));

    fireEvent.click(
      await within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Completar producción',
      }),
    );

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith('El lote no admite esa transición de estado.'),
    );
    expect(screen.queryByRole('dialog')).toBeInTheDocument();
  });
});
