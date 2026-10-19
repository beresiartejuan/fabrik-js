import { describe, expect, it } from 'vitest';

import { isActiveHref, isNavHrefEnabled, NAV_ITEMS, navItemsForRole, ROLE_LABELS } from '@/lib/nav';

describe('navItemsForRole', () => {
  it('el admin ve catálogos, producción, arribo, stock y las lecturas A/Au', () => {
    const hrefs = navItemsForRole('admin').map((item) => item.href);
    expect(hrefs).toEqual([
      '/',
      '/materiales',
      '/ubicaciones',
      '/maquinas',
      '/trabajadores',
      '/recetas',
      '/asignaciones',
      '/produccion',
      '/produccion/nueva',
      '/suministros/arribo',
      '/stock',
      '/trazabilidad',
      '/eventos',
    ]);
  });

  it('el worker ve Inicio, producción, registrar transformación, arribo y stock', () => {
    const hrefs = navItemsForRole('worker').map((item) => item.href);
    expect(hrefs).toEqual([
      '/',
      '/produccion',
      '/produccion/registrar',
      '/suministros/arribo',
      '/stock',
    ]);
  });

  it('el auditor ve catálogos, producción, stock y las lecturas de auditoría (Fase 6)', () => {
    const hrefs = navItemsForRole('auditor').map((item) => item.href);
    expect(hrefs).toEqual([
      '/',
      '/materiales',
      '/ubicaciones',
      '/maquinas',
      '/trabajadores',
      '/recetas',
      '/asignaciones',
      '/produccion',
      '/stock',
      '/trazabilidad',
      '/eventos',
    ]);
  });

  it('el worker no ve trazabilidad ni eventos (A/Au)', () => {
    const hrefs = navItemsForRole('worker').map((item) => item.href);
    expect(hrefs).not.toContain('/trazabilidad');
    expect(hrefs).not.toContain('/eventos');
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
      '/asignaciones',
      '/produccion',
      '/produccion/nueva',
      '/produccion/registrar',
      '/suministros/arribo',
      '/stock',
      '/trazabilidad',
      '/eventos',
    ]);
  });

  it('isNavHrefEnabled respeta el flag y las rutas desconocidas quedan ocultas', () => {
    expect(isNavHrefEnabled('/materiales')).toBe(true);
    expect(isNavHrefEnabled('/recetas')).toBe(true);
    expect(isNavHrefEnabled('/asignaciones')).toBe(true);
    expect(isNavHrefEnabled('/produccion/registrar')).toBe(true);
    expect(isNavHrefEnabled('/suministros/arribo')).toBe(true);
    expect(isNavHrefEnabled('/stock')).toBe(true);
    expect(isNavHrefEnabled('/trazabilidad')).toBe(true);
    expect(isNavHrefEnabled('/eventos')).toBe(true);
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
