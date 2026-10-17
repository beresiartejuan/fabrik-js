import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminDashboard } from '@/components/dashboard/admin-dashboard';
import { AuditorDashboard } from '@/components/dashboard/auditor-dashboard';

/**
 * CTAs y accesos de dashboard: se filtran con el mismo registro de `lib/nav`, así
 * que las pantallas de fases futuras no aparecen como enlaces muertos.
 */

const { mocks } = vi.hoisted(() => ({
  mocks: {
    materialsApi: { list: vi.fn() },
    machinesApi: { list: vi.fn() },
    workersApi: { list: vi.fn() },
    batchEventsApi: { list: vi.fn() },
  },
}));

vi.mock('@/lib/api/modules/materialsApi', () => ({ materialsApi: mocks.materialsApi }));
vi.mock('@/lib/api/modules/machinesApi', () => ({ machinesApi: mocks.machinesApi }));
vi.mock('@/lib/api/modules/workersApi', () => ({ workersApi: mocks.workersApi }));
vi.mock('@/lib/api/modules/batchEventsApi', () => ({ batchEventsApi: mocks.batchEventsApi }));

beforeEach(() => {
  for (const api of Object.values(mocks)) {
    api.list.mockReset();
    api.list.mockResolvedValue([]);
  }
});

describe('dashboards: secciones habilitadas', () => {
  it('el admin muestra recetas, asignaciones y oculta las fases futuras', async () => {
    render(<AdminDashboard />);

    expect(await screen.findByRole('link', { name: 'Materiales' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trabajadores' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recetas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Asignaciones' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nueva producción' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Registrar arribo' })).not.toBeInTheDocument();
  });

  it('el auditor no muestra accesos a stock/trazabilidad todavía', async () => {
    render(<AuditorDashboard />);

    await waitFor(() =>
      expect(screen.getByText('Todavía no hay eventos registrados.')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('link', { name: 'Ver stock' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Trazabilidad' })).not.toBeInTheDocument();
  });
});
