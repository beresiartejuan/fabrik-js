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
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Inicio', roles: ALL_ROLES },
  { href: '/materiales', label: 'Materiales', roles: ['admin', 'auditor'] },
  { href: '/ubicaciones', label: 'Ubicaciones', roles: ['admin', 'auditor'] },
  { href: '/maquinas', label: 'Máquinas', roles: ['admin', 'auditor'] },
  { href: '/trabajadores', label: 'Trabajadores', roles: ['admin', 'auditor'] },
  { href: '/recetas', label: 'Recetas', roles: ['admin', 'auditor'] },
  { href: '/asignaciones', label: 'Asignaciones', roles: ['admin', 'auditor'] },
  { href: '/produccion', label: 'Producción', roles: ALL_ROLES },
  { href: '/produccion/nueva', label: 'Nueva producción', roles: ['admin'] },
  { href: '/produccion/registrar', label: 'Registrar transformación', roles: ['worker'] },
  { href: '/suministros/arribo', label: 'Arribo de suministros', roles: ['admin', 'worker'] },
  { href: '/stock', label: 'Stock', roles: ALL_ROLES },
  { href: '/trazabilidad', label: 'Trazabilidad', roles: ['admin', 'auditor'] },
  { href: '/eventos', label: 'Eventos', roles: ['admin', 'auditor'] },
];

/** Etiquetas en español de los roles del dominio. */
export const ROLE_LABELS: Record<WorkerRole, string> = {
  admin: 'Administrador',
  worker: 'Operario',
  auditor: 'Auditor',
};

/** Secciones visibles para un rol, en el orden de `NAV_ITEMS`. */
export function navItemsForRole(role: WorkerRole): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
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
