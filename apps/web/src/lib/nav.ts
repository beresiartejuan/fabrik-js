import type { WorkerRole } from '@fabrik/domain';

/**
 * Navegación del sidebar y etiquetas de rol (docs/10-plan-de-web.md §Pantallas).
 *
 * La navegación se **filtra en cliente** por rol: es solo *UX*, el RBAC real lo
 * decide el dominio (403). Mantener la matriz sincronizada con la tabla de
 * pantallas del plan.
 */

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly roles: readonly WorkerRole[];
  /**
   * La ruta existe y puede mostrarse. Por defecto `false`: las secciones de
   * fases futuras quedan ocultas hasta que su pantalla aterrice (ver
   * `NAV_ITEMS`). Re-habilitar acá a medida que avancen las fases.
   */
  readonly enabled?: boolean;
}

export const ALL_ROLES: readonly WorkerRole[] = ['admin', 'worker', 'auditor'];

/**
 * Matriz de navegación (roles que **ven** cada sección):
 *
 * | Sección                  | admin | worker | auditor |
 * |--------------------------|:-----:|:------:|:-------:|
 * | `/` (dashboard)          |   ✓   |   ✓    |    ✓    |
 * | `/materiales`            |   ✓   |        |    ✓    |
 * | `/ubicaciones`           |   ✓   |        |    ✓    |
 * | `/maquinas`              |   ✓   |        |    ✓    |
 * | `/trabajadores`          |   ✓   |        |    ✓    |
 * | `/recetas`               |   ✓   |        |    ✓    |
 * | `/asignaciones`          |   ✓   |        |    ✓    |
 * | `/produccion`            |   ✓   |   ✓    |    ✓    |
 * | `/produccion/nueva`      |   ✓   |        |         |
 * | `/produccion/registrar`  |       |   ✓    |         |
 * | `/suministros/arribo`    |   ✓   |   ✓    |         |
 * | `/stock`                 |   ✓   |   ✓    |    ✓    |
 * | `/trazabilidad`          |   ✓   |        |    ✓    |
 * | `/eventos`               |   ✓   |        |    ✓    |
 *
 * Nota de dominio: un `admin` **no** registra transformaciones (worker-only), por
 * eso "Registrar transformación" nunca aparece para admin/auditor.
 *
 * Las secciones de fases futuras (`/trazabilidad`, `/eventos`, Fase
 * 6) están en `NAV_ITEMS` con `enabled: false` y no se renderizan (sidebar ni
 * CTAs de dashboard) hasta que exista su pantalla.
 * `enabled` refleja si la ruta **existe** hoy; se reactiva acá a medida que
 * aterricen las fases (y se ajustan los tests de navegación).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Inicio', roles: ALL_ROLES, enabled: true },
  { href: '/materiales', label: 'Materiales', roles: ['admin', 'auditor'], enabled: true },
  { href: '/ubicaciones', label: 'Ubicaciones', roles: ['admin', 'auditor'], enabled: true },
  { href: '/maquinas', label: 'Máquinas', roles: ['admin', 'auditor'], enabled: true },
  { href: '/trabajadores', label: 'Trabajadores', roles: ['admin', 'auditor'], enabled: true },
  { href: '/recetas', label: 'Recetas', roles: ['admin', 'auditor'], enabled: true },
  { href: '/asignaciones', label: 'Asignaciones', roles: ['admin', 'auditor'], enabled: true },
  // Producción y suministros (Fase 4).
  { href: '/produccion', label: 'Producción', roles: ALL_ROLES, enabled: true },
  { href: '/produccion/nueva', label: 'Nueva producción', roles: ['admin'], enabled: true },
  {
    href: '/produccion/registrar',
    label: 'Registrar transformación',
    roles: ['worker'],
    enabled: true,
  },
  {
    href: '/suministros/arribo',
    label: 'Arribo de suministros',
    roles: ['admin', 'worker'],
    enabled: true,
  },
  {
    href: '/stock',
    label: 'Stock',
    roles: ALL_ROLES,
    enabled: true,
  },
  { href: '/trazabilidad', label: 'Trazabilidad', roles: ['admin', 'auditor'], enabled: false },
  { href: '/eventos', label: 'Eventos', roles: ['admin', 'auditor'], enabled: false },
];

/** Etiquetas en español de los roles del dominio. */
export const ROLE_LABELS: Record<WorkerRole, string> = {
  admin: 'Administrador',
  worker: 'Operario',
  auditor: 'Auditor',
};

/** `true` si el ítem apunta a una ruta habilitada (`enabled` por defecto `false`). */
export function isNavItemEnabled(item: NavItem): boolean {
  return item.enabled ?? false;
}

/**
 * `true` si `href` está registrado y habilitado. Lo usan los dashboards para no
 * duplicar la lista de rutas disponibles y ocultar sus CTAs de fases futuras.
 */
export function isNavHrefEnabled(href: string): boolean {
  return NAV_ITEMS.some((item) => item.href === href && isNavItemEnabled(item));
}

/** Secciones **habilitadas** visibles para un rol, en el orden de `NAV_ITEMS`. */
export function navItemsForRole(role: WorkerRole): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role) && isNavItemEnabled(item));
}

/**
 * `true` si `href` corresponde a la ruta activa. `/` matchea **solo** exacto;
 * el resto matchea exacto o como prefijo de segmento (`/produccion` activa en
 * `/produccion/nueva`, pero no en `/produccion-cero`).
 */
export function isActiveHref(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
