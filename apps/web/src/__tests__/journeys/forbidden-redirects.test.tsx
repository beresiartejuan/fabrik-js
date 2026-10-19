import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AsignacionesPage from '@/app/(app)/asignaciones/page';
import MaterialesPage from '@/app/(app)/materiales/page';
import NuevaProduccionPage from '@/app/(app)/produccion/nueva/page';
import RegistrarPage from '@/app/(app)/produccion/registrar/page';
import { renderWithSession, seedSessionRole } from '../helpers/session';

/**
 * Recorrido por rol (criterio de salida de Fase 7): **ningún callejón sin
 * salida en las rutas prohibidas** — forzar la URL de una pantalla ajena al rol
 * reenvía al dashboard y el contenido no llega a montarse (el RBAC real lo
 * impone el dominio con 403). Los redirects que faltaban acá (auditor en las
 * pantallas admin/worker, worker en catálogos/asignaciones) complementan
 * `guards.test.tsx`, `production/routes-guards.test.tsx` (admin → registrar,
 * worker → nueva) y `trace/trace-routes-guards.test.tsx` (worker en
 * trazabilidad/eventos) — no se duplican.
 */

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/materiales',
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  window.sessionStorage.clear();
  replace.mockClear();
});

describe('recorrido por rol: pantallas prohibidas reenvían al dashboard', () => {
  it('un auditor es redirigido desde las pantallas admin/worker (nueva producción y registrar)', async () => {
    for (const Page of [NuevaProduccionPage, RegistrarPage]) {
      seedSessionRole('auditor');
      const view = renderWithSession(<Page />);

      await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
      expect(
        screen.queryByRole('heading', { name: /Nueva producción|Registrar transformación/ }),
      ).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('un worker es redirigido desde catálogos y asignaciones (A/Au)', async () => {
    for (const Page of [MaterialesPage, AsignacionesPage]) {
      seedSessionRole('worker');
      const view = renderWithSession(<Page />);

      await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
      expect(
        screen.queryByRole('heading', { name: /Materiales|Asignaciones/ }),
      ).not.toBeInTheDocument();
      view.unmount();
    }
  });
});
