import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssignmentsScreen } from '@/components/assignments/assignments-screen';
import { ApiError } from '@/lib/api/errors';
import type { AssignmentWire } from '@/lib/api/types';
import { formatTimeSlot } from '@/lib/format/days';

import { selectOptionAsync } from '../helpers/select';

/**
 * Flujos de `/asignaciones` (docs/10-plan-de-web.md §Fase 3): grilla semanal
 * con contraparte resuelta, Asignar (admin) con pre-validación de solapes I1
 * (adyacentes NO cuentan), server 409 mapeado al mensaje amigable,
 * Desasignar con confirmación y auditor en solo lectura.
 */

const { mocks, toastMocks } = vi.hoisted(() => ({
  toastMocks: { success: vi.fn(), error: vi.fn() },
  mocks: {
    assignmentsApi: {
      assign: vi.fn(),
      unassign: vi.fn(),
      workerSchedule: vi.fn(),
      machineSchedule: vi.fn(),
    },
    machinesApi: { list: vi.fn() },
    workersApi: { list: vi.fn() },
  },
}));

vi.mock('sonner', () => ({ toast: toastMocks }));
vi.mock('@/lib/api/modules/assignmentsApi', () => ({ assignmentsApi: mocks.assignmentsApi }));
vi.mock('@/lib/api/modules/machinesApi', () => ({ machinesApi: mocks.machinesApi }));
vi.mock('@/lib/api/modules/workersApi', () => ({ workersApi: mocks.workersApi }));

const MACHINES = [
  { id: 'm1', name: 'Mezcladora', type: 'mixer', locationId: 'l1', status: 'idle' as const },
  { id: 'm2', name: 'Horno', type: 'oven', locationId: 'l1', status: 'idle' as const },
];

const WORKERS = [
  { id: 'w1', name: 'Ada Lovelace', role: 'worker' as const, active: true },
  { id: 'w2', name: 'Alan Turing', role: 'worker' as const, active: false },
];

const ASSIGNMENT_ON_M1: AssignmentWire = {
  id: 'a1',
  workerId: 'w1',
  machineId: 'm1',
  slot: { daysOfWeek: [1, 3], start: '08:00', end: '16:30' },
};

/** Asignación de un solo día para los flujos de Desasignar (una sola tarjeta). */
const ASSIGNMENT_MONDAY: AssignmentWire = {
  id: 'a2',
  workerId: 'w1',
  machineId: 'm1',
  slot: { daysOfWeek: [1], start: '08:00', end: '16:30' },
};

function slotLabel(slot: AssignmentWire['slot']): string {
  return formatTimeSlot(slot);
}

function resetMocks(): void {
  for (const mock of [
    toastMocks.success,
    toastMocks.error,
    ...Object.values(mocks.assignmentsApi),
    ...Object.values(mocks.machinesApi),
    ...Object.values(mocks.workersApi),
  ]) {
    mock.mockReset();
  }
  mocks.machinesApi.list.mockResolvedValue(MACHINES);
  mocks.workersApi.list.mockResolvedValue(WORKERS);
  mocks.assignmentsApi.machineSchedule.mockResolvedValue([]);
  mocks.assignmentsApi.workerSchedule.mockResolvedValue([]);
  mocks.assignmentsApi.assign.mockResolvedValue({
    id: 'a9',
    workerId: 'w1',
    machineId: 'm1',
    slot: { daysOfWeek: [1], start: '08:00', end: '16:00' },
  });
  mocks.assignmentsApi.unassign.mockResolvedValue(undefined);
}

/** Abre el diálogo de asignación y deja worker + máquina elegidos. */
async function openDialogWithSelection(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Asignar' }));
  const dialog = await screen.findByRole('dialog');
  await selectOptionAsync('Trabajador', 'Ada Lovelace', dialog);
  await selectOptionAsync('Máquina', 'Mezcladora', dialog);
  return dialog;
}

beforeEach(resetMocks);

describe('AssignmentsScreen: vista de agenda', () => {
  it('por máquina muestra la grilla semanal con el nombre del worker y vacíos', async () => {
    mocks.assignmentsApi.machineSchedule.mockResolvedValue([ASSIGNMENT_ON_M1]);
    render(<AssignmentsScreen canWrite />);

    await selectOptionAsync('Máquina', 'Mezcladora');

    // El assignment cubre lun y mié: dos tarjetas con la misma franja horaria.
    const cards = await screen.findAllByText('08:00–16:30');
    expect(cards).toHaveLength(2);
    expect(screen.getAllByText('Ada Lovelace')).toHaveLength(2);
    expect(screen.getByText('Lunes')).toBeInTheDocument();
    // Las otras 5 columnas quedan vacías.
    expect(screen.getAllByText('—')).toHaveLength(5);
    expect(mocks.assignmentsApi.machineSchedule).toHaveBeenCalledWith('m1');
  });

  it('por trabajador muestra la grilla con el nombre de la máquina', async () => {
    mocks.assignmentsApi.workerSchedule.mockResolvedValue([ASSIGNMENT_ON_M1]);
    render(<AssignmentsScreen canWrite />);

    fireEvent.click(screen.getByRole('tab', { name: 'Por trabajador' }));
    await selectOptionAsync('Trabajador', 'Ada Lovelace');

    expect(await screen.findAllByText('08:00–16:30')).toHaveLength(2);
    expect(screen.getAllByText('Mezcladora')).toHaveLength(2);
    expect(mocks.assignmentsApi.workerSchedule).toHaveBeenCalledWith('w1');
  });

  it('muestra el estado vacío cuando la agenda de la máquina no tiene asignaciones', async () => {
    render(<AssignmentsScreen canWrite />);

    await selectOptionAsync('Máquina', 'Horno');

    expect(await screen.findByText('Sin asignaciones para esta máquina')).toBeInTheDocument();
  });

  it('sin selección pide elegir una máquina antes de mostrar la grilla', () => {
    render(<AssignmentsScreen canWrite />);

    expect(screen.getByText('Elegí una máquina para ver su agenda semanal.')).toBeInTheDocument();
    expect(screen.queryByText('Lunes')).not.toBeInTheDocument();
  });
});

describe('AssignmentsScreen: solo lectura (auditor)', () => {
  it('no ve Asignar, ni Desasignar, y la agenda es visible', async () => {
    mocks.assignmentsApi.machineSchedule.mockResolvedValue([ASSIGNMENT_ON_M1]);
    render(<AssignmentsScreen canWrite={false} />);

    await selectOptionAsync('Máquina', 'Mezcladora');

    expect(await screen.findAllByText('08:00–16:30')).toHaveLength(2);
    expect(screen.getAllByText('Ada Lovelace')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Asignar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Desasignar/ })).not.toBeInTheDocument();
  });
});

describe('AssignmentsScreen: asignar (admin)', () => {
  it('valida la franja (>= 1 día) y envía el payload completo al asignar', async () => {
    render(<AssignmentsScreen canWrite />);

    const dialog = await openDialogWithSelection();

    // Aún sin días, la pre-validación bloquea el submit.
    expect(within(dialog).getByText('Elegí al menos un día.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Asignar' })).toBeDisabled();
    expect(mocks.assignmentsApi.assign).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Día lun' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Asignar' })).toBeEnabled(),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Asignar' }));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('Se creó la asignación.'));
    expect(mocks.assignmentsApi.assign).toHaveBeenCalledTimes(1);
    expect(mocks.assignmentsApi.assign).toHaveBeenCalledWith({
      workerId: 'w1',
      machineId: 'm1',
      slot: { daysOfWeek: [1], start: '08:00', end: '16:00' },
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('marca el solape (I1) con la agenda fresca del worker y no envía', async () => {
    mocks.assignmentsApi.workerSchedule.mockImplementation(async (workerId: string) =>
      workerId === 'w1'
        ? [
            {
              id: 'a1',
              workerId: 'w1',
              machineId: 'm2',
              slot: { daysOfWeek: [1], start: '10:00', end: '12:00' },
            },
          ]
        : [],
    );
    render(<AssignmentsScreen canWrite />);

    const dialog = await openDialogWithSelection();
    // La agenda ya se pidió fresca para el worker elegido.
    await waitFor(() => expect(mocks.assignmentsApi.workerSchedule).toHaveBeenCalledWith('w1'));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Día lun' }));

    expect(await within(dialog).findByText(/Se solapa con Ada Lovelace/)).toBeInTheDocument();
    expect(within(dialog).getByText('lun 10:00–12:00 en Horno')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Asignar' }));
    expect(mocks.assignmentsApi.assign).not.toHaveBeenCalled();
  });

  it('las franjas adyacentes (end === start) NO cuentan como solape y se envían', async () => {
    mocks.assignmentsApi.workerSchedule.mockImplementation(async (workerId: string) =>
      workerId === 'w1'
        ? [
            {
              id: 'a1',
              workerId: 'w1',
              machineId: 'm2',
              slot: { daysOfWeek: [1], start: '16:00', end: '18:00' },
            },
          ]
        : [],
    );
    render(<AssignmentsScreen canWrite />);

    const dialog = await openDialogWithSelection();
    await waitFor(() => expect(mocks.assignmentsApi.workerSchedule).toHaveBeenCalledWith('w1'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Día lun' }));
    // El borrador por defecto es 08:00–16:00: adyacente a 16:00–18:00 del lunes.

    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Asignar' })).toBeEnabled(),
    );
    expect(within(dialog).queryByText(/Se solapa con/)).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Asignar' }));
    expect(mocks.assignmentsApi.assign).toHaveBeenCalledWith({
      workerId: 'w1',
      machineId: 'm1',
      slot: { daysOfWeek: [1], start: '08:00', end: '16:00' },
    });
  });

  it('el 409 del servidor (OverlappingScheduleError) muestra el mensaje amigable', async () => {
    mocks.assignmentsApi.assign.mockRejectedValue(
      new ApiError({
        statusCode: 409,
        error: 'OverlappingScheduleError',
        message: 'El trabajador ya tiene una asignación en ese horario.',
      }),
    );
    render(<AssignmentsScreen canWrite />);

    const dialog = await openDialogWithSelection();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Día lun' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Asignar' })).toBeEnabled(),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Asignar' }));

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        'El trabajador ya tiene una asignación en ese horario.',
      ),
    );
    // El error no cierra el diálogo: queda abierto para corregir la franja.
    expect(screen.queryByRole('dialog')).toBeInTheDocument();
  });
});

describe('AssignmentsScreen: desasignar (admin)', () => {
  it('pide confirmación y hace DELETE con feedback de éxito', async () => {
    mocks.assignmentsApi.machineSchedule.mockResolvedValue([ASSIGNMENT_MONDAY]);
    render(<AssignmentsScreen canWrite />);

    await selectOptionAsync('Máquina', 'Mezcladora');
    fireEvent.click(await screen.findByRole('button', { name: /Desasignar Ada Lovelace/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Desasignar' })).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        `Se quitará la franja ${slotLabel(ASSIGNMENT_MONDAY.slot)} de Ada Lovelace en Mezcladora.`,
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Desasignar' }));

    await waitFor(() => expect(mocks.assignmentsApi.unassign).toHaveBeenCalledWith('a2'));
    expect(toastMocks.success).toHaveBeenCalledWith('Se quitó la asignación.');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('si el DELETE falla, el diálogo queda abierto y el error se muestra', async () => {
    mocks.assignmentsApi.machineSchedule.mockResolvedValue([ASSIGNMENT_MONDAY]);
    mocks.assignmentsApi.unassign.mockRejectedValue(
      new ApiError({ statusCode: 403, error: 'HttpError', message: 'Forbidden' }),
    );
    render(<AssignmentsScreen canWrite />);

    await selectOptionAsync('Máquina', 'Mezcladora');
    fireEvent.click(await screen.findByRole('button', { name: /Desasignar Ada Lovelace/ }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desasignar' }));

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith('No tenés permisos para esta acción.'),
    );
    // El diálogo queda abierto para reintentar (ConfirmDialog con busy).
    expect(screen.queryByRole('dialog')).toBeInTheDocument();
  });
});
