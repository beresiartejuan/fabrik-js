import { describe, expect, it } from 'vitest';

import { isActiveHref, navItemsForRole, ROLE_LABELS } from '@/lib/nav';

describe('navItemsForRole', () => {
  it('el admin no ve "Registrar transformación" (worker-only) y sí los catálogos', () => {
    const hrefs = navItemsForRole('admin').map((item) => item.href);
    expect(hrefs).not.toContain('/produccion/registrar');
    expect(hrefs).toContain('/materiales');
    expect(hrefs).toContain('/produccion/nueva');
    expect(hrefs).toContain('/eventos');
  });

  it('el worker solo ve Inicio, Producción, Registrar, Arribo y Stock', () => {
    const hrefs = navItemsForRole('worker').map((item) => item.href);
    expect(hrefs).toEqual([
      '/',
      '/produccion',
      '/produccion/registrar',
      '/suministros/arribo',
      '/stock',
    ]);
  });

  it('el auditor ve catálogos y lectura, pero no las acciones de escritura', () => {
    const hrefs = navItemsForRole('auditor').map((item) => item.href);
    expect(hrefs).toContain('/materiales');
    expect(hrefs).toContain('/eventos');
    expect(hrefs).toContain('/trazabilidad');
    expect(hrefs).not.toContain('/produccion/nueva');
    expect(hrefs).not.toContain('/produccion/registrar');
    expect(hrefs).not.toContain('/suministros/arribo');
  });

  it('todos los roles ven el dashboard, producción y stock', () => {
    for (const role of ['admin', 'worker', 'auditor'] as const) {
      const hrefs = navItemsForRole(role).map((item) => item.href);
      expect(hrefs).toContain('/');
      expect(hrefs).toContain('/produccion');
      expect(hrefs).toContain('/stock');
    }
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
