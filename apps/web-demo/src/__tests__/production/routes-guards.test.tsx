import type { WorkerRole } from '@fabrik/domain';
import { render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_STORAGE_KEY, SessionProvider } from '@/lib/session/session-store';

/**
 * Guardas de las rutas de la Fase 4 a nivel de página (`docs/pantallas.md`
 * §Guardas): un admin **no** entra a `/produccion/registrar` (worker-only: el
 * dominio exige rol `worker` en `RecordTransformation`) y un worker no entra a
 * `/produccion/nueva` (solo admin arranca órdenes). El redirect vuelve al
 * dashboard y el contenido privado no llega a montarse.
 */

const { replace, push } = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push, back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}));

function wrapper({ children }: { children: ReactNode }) {
  return createElement(SessionProvider, null, children);
}

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
  push.mockClear();
});

describe('guardas de las rutas de producción', () => {
  it('registrar: un admin es redirigido al dashboard y no ve el formulario', async () => {
    const { default: RegistrarPage } = await import('@/app/(app)/produccion/registrar/page');
    seedSession('admin');
    render(<RegistrarPage />, { wrapper });

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByRole('button', { name: 'Agregar insumo' })).not.toBeInTheDocument();
  });

  it('nueva producción: un worker es redirigido al dashboard', async () => {
    const { default: NuevaPage } = await import('@/app/(app)/produccion/nueva/page');
    seedSession('worker');
    render(<NuevaPage />, { wrapper });

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByLabelText('Receta')).not.toBeInTheDocument();
  });
});
