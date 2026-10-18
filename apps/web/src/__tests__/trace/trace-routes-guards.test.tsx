import type { WorkerRole } from '@fabrik/domain';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_STORAGE_KEY, SessionProvider } from '@/lib/session/session-store';

/**
 * Guardas de las rutas de la Fase 6 (`docs/10-plan-de-web.md` §14–15): la
 * trazabilidad y los eventos son lecturas A/Au — un `worker` es redirigido al
 * dashboard por `RequireRole` y el contenido no llega a montarse (el RBAC real
 * vuelve a 403 en el dominio).
 */

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/trazabilidad',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api/modules/materialsApi', () => ({
  materialsApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/lib/api/modules/machinesApi', () => ({
  machinesApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/lib/api/modules/workersApi', () => ({
  workersApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/lib/api/modules/batchEventsApi', () => ({
  batchEventsApi: { list: vi.fn().mockResolvedValue([]) },
}));

function seedSession(role: WorkerRole): void {
  window.sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      accessToken: 'a',
      refreshToken: 'r',
      worker: { workerId: 'w1', role },
      name: 'Ada',
    }),
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  replace.mockClear();
});

describe('guardas de las rutas de trazabilidad y eventos', () => {
  it('trazabilidad: un worker es redirigido al dashboard y no ve el buscador', async () => {
    const { default: TrazabilidadPage } = await import('@/app/(app)/trazabilidad/page');
    seedSession('worker');
    render(
      <SessionProvider>
        <TrazabilidadPage />
      </SessionProvider>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByLabelText('Buscar lote por ID')).not.toBeInTheDocument();
  });

  it('trazabilidad: un auditor ve la pantalla', async () => {
    const { default: TrazabilidadPage } = await import('@/app/(app)/trazabilidad/page');
    seedSession('auditor');
    render(
      <SessionProvider>
        <TrazabilidadPage />
      </SessionProvider>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Trazabilidad', level: 1 }),
    ).toBeInTheDocument();
  });

  it('eventos: un worker es redirigido al dashboard y no ve los filtros', async () => {
    const { default: EventosPage } = await import('@/app/(app)/eventos/page');
    seedSession('worker');
    render(
      <SessionProvider>
        <EventosPage />
      </SessionProvider>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByRole('combobox', { name: 'Máquina' })).not.toBeInTheDocument();
  });
});
