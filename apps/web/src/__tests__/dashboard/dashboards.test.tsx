import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminDashboard } from '@/components/dashboard/admin-dashboard';
import { AuditorDashboard } from '@/components/dashboard/auditor-dashboard';
import { ApiError } from '@/lib/api/errors';

/**
 * CTAs y accesos de dashboard: se filtran con el mismo registro de `lib/nav`, así
 * que las pantallas de fases futuras no aparecen como enlaces muertos. El
 * recopilatorio también cubre los estados de error de las consultas del panel.
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
  it('el admin muestra recetas, asignaciones, producción y sus acciones rápidas', async () => {
    render(<AdminDashboard />);

    expect(await screen.findByRole('link', { name: 'Materiales' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trabajadores' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recetas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Asignaciones' })).toBeInTheDocument();
    // Fase 4: los CTAs de producción/se suministros ya están habilitados.
    expect(screen.getByRole('link', { name: 'Nueva producción' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar arribo' })).toBeInTheDocument();
  });

  it('el auditor ve «Ver stock» y «Trazabilidad» (Fases 5 y 6)', async () => {
    render(<AuditorDashboard />);

    await waitFor(() =>
      expect(screen.getByText('Todavía no hay eventos registrados.')).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'Ver stock' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver stock' }).getAttribute('href')).toBe('/stock');
    expect(screen.getByRole('link', { name: 'Trazabilidad' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trazabilidad' }).getAttribute('href')).toBe(
      '/trazabilidad',
    );
  });

  it('si el listado de eventos falla, el auditor ve el bloque de error con Reintentar', async () => {
    mocks.batchEventsApi.list.mockRejectedValue(
      new ApiError({ statusCode: 503, error: 'HttpError', message: 'boom' }),
    );
    render(<AuditorDashboard />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ocurrió un error inesperado.');
    expect(screen.queryByText('Todavía no hay eventos registrados.')).not.toBeInTheDocument();

    mocks.batchEventsApi.list.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await screen.findByText('Todavía no hay eventos registrados.');
    expect(mocks.batchEventsApi.list).toHaveBeenCalledTimes(2);
  });
});
