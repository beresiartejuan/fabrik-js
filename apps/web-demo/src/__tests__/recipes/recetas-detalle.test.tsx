import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_STORAGE_KEY, SessionProvider } from '@/lib/session/session-store';
import { makeMachine, makeMaterial, makeRecipe } from '../helpers/fixtures';

/**
 * Ruta `/recetas/detalle?id=<id>` (variante export de la pantalla 7): el id de
 * la receta llega por query param (`useSearchParams` dentro de `Suspense`,
 * mismo patrón del deep-link `?batch=` de trazabilidad) porque `output:
 * 'export'` no admite rutas dinámicas. `?id=` vacío cae en modo alta, como
 * `/recetas/nueva`.
 */

const { mocks, replace, searchParamsValue } = vi.hoisted(() => ({
  mocks: {
    materialsApi: { list: vi.fn() },
    machinesApi: { list: vi.fn() },
    recipesApi: { get: vi.fn(), list: vi.fn() },
  },
  replace: vi.fn(),
  searchParamsValue: { current: '' },
}));

vi.mock('@/lib/api/modules/materialsApi', () => ({ materialsApi: mocks.materialsApi }));
vi.mock('@/lib/api/modules/machinesApi', () => ({ machinesApi: mocks.machinesApi }));
vi.mock('@/lib/api/modules/recipesApi', () => ({ recipesApi: mocks.recipesApi }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/recetas/detalle',
  useSearchParams: () => new URLSearchParams(searchParamsValue.current),
}));

function seedSession(role: 'admin' | 'auditor' | 'worker'): void {
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
  searchParamsValue.current = '';
  for (const mock of [
    mocks.materialsApi.list,
    mocks.machinesApi.list,
    mocks.recipesApi.get,
    mocks.recipesApi.list,
  ]) {
    mock.mockReset();
  }
  mocks.materialsApi.list.mockResolvedValue([makeMaterial()]);
  mocks.machinesApi.list.mockResolvedValue([makeMachine()]);
  mocks.recipesApi.get.mockResolvedValue(makeRecipe({ id: 'rec-01', name: 'Receta' }));
});

describe('la página /recetas/detalle', () => {
  it('resuelve ?id= y carga la receta en modo edición', async () => {
    searchParamsValue.current = '?id=rec-01';
    const { default: DetallePage } = await import('@/app/(app)/recetas/detalle/page');
    seedSession('admin');
    render(
      <SessionProvider>
        <DetallePage />
      </SessionProvider>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Editar receta', level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() => expect(mocks.recipesApi.get).toHaveBeenCalledWith('rec-01'));
  });

  it('sin ?id= cae en modo alta, como /recetas/nueva', async () => {
    const { default: DetallePage } = await import('@/app/(app)/recetas/detalle/page');
    seedSession('admin');
    render(
      <SessionProvider>
        <DetallePage />
      </SessionProvider>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Nueva receta', level: 1 }),
    ).toBeInTheDocument();
    expect(mocks.recipesApi.get).not.toHaveBeenCalled();
  });

  it('un worker es redirigido al dashboard (A/Au) y no ve el builder', async () => {
    const { default: DetallePage } = await import('@/app/(app)/recetas/detalle/page');
    seedSession('worker');
    render(
      <SessionProvider>
        <DetallePage />
      </SessionProvider>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(mocks.recipesApi.get).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', { name: /Editar receta|Nueva receta/ }),
    ).not.toBeInTheDocument();
  });
});
