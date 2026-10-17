import { describe, expect, it } from 'vitest';

import { isActiveHref, isNavHrefEnabled, NAV_ITEMS, navItemsForRole, ROLE_LABELS } from '@/lib/nav';

const FUTURE_HREFS = [
  '/asignaciones',
  '/produccion',
  '/produccion/nueva',
  '/produccion/registrar',
  '/suministros/arribo',
  '/stock',
  '/trazabilidad',
  '/eventos',
];

describe('navItemsForRole', () => {
  it('el admin ve los catálogos existentes y recetas', () => {
    const hrefs = navItemsForRole('admin').map((item) => item.href);
    expect(hrefs).toEqual([
      '/',
      '/materiales',
      '/ubicaciones',
      '/maquinas',
      '/trabajadores',
      '/recetas',
    ]);
  });

  it('el worker solo ve Inicio mientras las fases futuras no aterricen', () => {
    const hrefs = navItemsForRole('worker').map((item) => item.href);
    expect(hrefs).toEqual(['/']);
  });

  it('el auditor ve los catálogos existentes, recetas e Inicio', () => {
    const hrefs = navItemsForRole('auditor').map((item) => item.href);
    expect(hrefs).toEqual([
      '/',
      '/materiales',
      '/ubicaciones',
      '/maquinas',
      '/trabajadores',
      '/recetas',
    ]);
  });

  it('oculta las rutas de fases futuras para todos los roles', () => {
    for (const role of ['admin', 'worker', 'auditor'] as const) {
      const hrefs = navItemsForRole(role).map((item) => item.href);
      for (const href of FUTURE_HREFS) {
        expect(hrefs).not.toContain(href);
      }
    }
  });
});

describe('NAV_ITEMS enabled', () => {
  it('marca habilitadas solo las rutas que existen hoy', () => {
    const enabled = NAV_ITEMS.filter((item) => item.enabled === true).map((item) => item.href);
    expect(enabled).toEqual([
      '/',
      '/materiales',
      '/ubicaciones',
      '/maquinas',
      '/trabajadores',
      '/recetas',
    ]);
  });

  it('isNavHrefEnabled respeta el flag y las rutas desconocidas quedan ocultas', () => {
    expect(isNavHrefEnabled('/materiales')).toBe(true);
    expect(isNavHrefEnabled('/recetas')).toBe(true);
    expect(isNavHrefEnabled('/stock')).toBe(false);
    expect(isNavHrefEnabled('/ruta-inexistente')).toBe(false);
  });
});

describe('ROLE_LABELS', () => {
  it('traduce los roles al español', () => {
    expect(ROLE_LABELS).toEqual({
      admin: 'Administrador',
      worker: 'Operario',
      auditor: 'Auditor',
    });
  });
});

describe('isActiveHref', () => {
  it('matchea "/" solo exacto', () => {
    expect(isActiveHref('/', '/')).toBe(true);
    expect(isActiveHref('/materiales', '/')).toBe(false);
  });

  it('usa prefijo de segmento', () => {
    expect(isActiveHref('/produccion', '/produccion')).toBe(true);
    expect(isActiveHref('/produccion/nueva', '/produccion')).toBe(true);
    expect(isActiveHref('/produccion-cero', '/produccion')).toBe(false);
  });
});
