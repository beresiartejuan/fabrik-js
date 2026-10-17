import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkerDashboard } from '@/components/dashboard/worker-dashboard';
import type { MeScheduleItemWire } from '@/lib/api/types';

/**
 * Dashboard del worker: debe consumir `GET /me/schedule` tal cual (máquina
 * enriquecida + `activeNow` del servidor), sin recalcular `TimeSlot` en el
 * navegador ni pedir `GET /machines`.
 */

const { meApiMock } = vi.hoisted(() => ({
  meApiMock: { schedule: vi.fn() },
}));

vi.mock('@/lib/api/modules/meApi', () => ({ meApi: meApiMock }));

const SLOT = { daysOfWeek: [1, 2, 3, 4, 5] as const, start: '08:00', end: '17:00' };

const ITEMS: MeScheduleItemWire[] = [
  {
    id: 'a1',
    workerId: 'w1',
    machineId: 'm1',
    slot: { ...SLOT, daysOfWeek: [...SLOT.daysOfWeek] },
    machine: {
      id: 'm1',
      name: 'Horno 1',
      type: 'horno',
      locationId: 'l1',
      status: 'running',
    },
    activeNow: true,
  },
  {
    id: 'a2',
    workerId: 'w1',
    machineId: 'm2',
    slot: { ...SLOT, daysOfWeek: [...SLOT.daysOfWeek] },
    machine: {
      id: 'm2',
      name: 'Mezcladora',
      type: 'mixer',
      locationId: 'l1',
      status: 'idle',
    },
    // El servidor dice que la franja no está vigente: no se muestra aunque
    // `TimeSlot.contains` en el navegador pudiera opinar otra cosa.
    activeNow: false,
  },
  {
    id: 'a3',
    workerId: 'w1',
    machineId: 'm3',
    slot: { ...SLOT, daysOfWeek: [...SLOT.daysOfWeek] },
    machine: null,
    activeNow: true,
  },
];

beforeEach(() => {
  meApiMock.schedule.mockReset();
});

describe('WorkerDashboard', () => {
  it('muestra las máquinas activas con nombre/tipo del objeto embebido de la API', async () => {
    meApiMock.schedule.mockResolvedValue(ITEMS);

    render(<WorkerDashboard />);

    expect(await screen.findByText('Horno 1')).toBeInTheDocument();
    expect(screen.getByText('horno')).toBeInTheDocument();
    expect(screen.queryByText('Mezcladora')).not.toBeInTheDocument();
    expect(screen.queryByText(/Todavía no hay máquinas/)).not.toBeInTheDocument();
    expect(meApiMock.schedule).toHaveBeenCalledTimes(1);
  });

  it('muestra el estado vacío cuando no hay asignaciones vigentes', async () => {
    meApiMock.schedule.mockResolvedValue([]);

    render(<WorkerDashboard />);

    await waitFor(() =>
      expect(
        screen.getByText('Todavía no hay máquinas asignadas en este momento.'),
      ).toBeInTheDocument(),
    );
  });

  it('no muestra CTAs de pantallas que todavía no existen', async () => {
    meApiMock.schedule.mockResolvedValue(ITEMS);

    render(<WorkerDashboard />);

    await screen.findByText('Horno 1');
    expect(
      screen.queryByRole('link', { name: 'Registrar transformación' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Arribo de suministros' })).not.toBeInTheDocument();
  });
});
