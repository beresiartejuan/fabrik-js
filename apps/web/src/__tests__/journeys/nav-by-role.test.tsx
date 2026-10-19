import type { WorkerRole } from '@fabrik/domain';
import { screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AppLayout from '@/app/(app)/layout';
import { isNavHrefEnabled } from '@/lib/nav';
import { renderWithSession, seedSessionRole } from '../helpers/session';

/**
 * Recorrido por rol (criterio de salida de Fase 7, «sin callejones sin
 * salida»): el **sidebar real** del grupo `(app)` renderiza exactamente las
 * secciones habilitadas esperadas por rol — las mismas de la matriz de
 * `lib/nav` (que ya tiene sus tests puros en `__tests__/nav.test.ts`) — y
 * ningún enlace del sidebar apunta a una ruta inexistente/deshabilitada.
 */

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api/modules/authApi', () => ({
  authApi: { logout: vi.fn().mockResolvedValue(undefined), me: vi.fn() },
}));

/** Enlaces visibles del sidebar por rol (solo `enabled: true`). */
const NAV_BY_ROLE: Record<WorkerRole, Array<[string, string]>> = {
  admin: [
    ['/', 'Inicio'],
    ['/materiales', 'Materiales'],
    ['/ubicaciones', 'Ubicaciones'],
    ['/maquinas', 'Máquinas'],
    ['/trabajadores', 'Trabajadores'],
    ['/recetas', 'Recetas'],
    ['/asignaciones', 'Asignaciones'],
    ['/produccion', 'Producción'],
    ['/produccion/nueva', 'Nueva producción'],
    ['/suministros/arribo', 'Arribo de suministros'],
    ['/stock', 'Stock'],
    ['/trazabilidad', 'Trazabilidad'],
    ['/eventos', 'Eventos'],
  ],
  worker: [
    ['/', 'Inicio'],
    ['/produccion', 'Producción'],
    ['/produccion/registrar', 'Registrar transformación'],
    ['/suministros/arribo', 'Arribo de suministros'],
    ['/stock', 'Stock'],
  ],
  auditor: [
    ['/', 'Inicio'],
    ['/materiales', 'Materiales'],
    ['/ubicaciones', 'Ubicaciones'],
    ['/maquinas', 'Máquinas'],
    ['/trabajadores', 'Trabajadores'],
    ['/recetas', 'Recetas'],
    ['/asignaciones', 'Asignaciones'],
    ['/produccion', 'Producción'],
    ['/stock', 'Stock'],
    ['/trazabilidad', 'Trazabilidad'],
    ['/eventos', 'Eventos'],
  ],
};

beforeEach(() => {
  window.sessionStorage.clear();
  replace.mockClear();
});

function renderShell(role: WorkerRole): void {
  seedSessionRole(role);
  renderWithSession(createElement(AppLayout, null, createElement('p', null, 'Contenido privado')));
}

describe('recorrido por rol: navegación del shell', () => {
  for (const role of ['admin', 'worker', 'auditor'] as const) {
    it(`el ${role} ve exactamente las secciones habilitadas esperadas`, async () => {
      renderShell(role);

      const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
      const links = within(nav).getAllByRole('link');
      expect(links).toHaveLength(NAV_BY_ROLE[role].length);

      NAV_BY_ROLE[role].forEach(([href, label], index) => {
        const link = links[index];
        expect(link).toBeInTheDocument();
        expect(link).toHaveTextContent(label);
        expect(link).toHaveAttribute('href', href);
        // «Callejón sin salida»: un link del sidebar siempre lleva a una ruta
        // habilitada (sin secciones futuras ni hrefs muertos).
        expect(isNavHrefEnabled(href)).toBe(true);
      });

      // El link activo queda marcado (a11y de navegación por teclado/lectores).
      expect(links[0]).toHaveAttribute('aria-current', 'page');
    });
  }
});
