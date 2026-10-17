import type { WorkerRole } from '../entities/worker.js';
import { UnauthorizedRoleError } from '../errors/index.js';
import type { WorkerId } from '../value-objects/ids.js';

/**
 * Contexto mínimo de ejecución de un caso de uso: quién lo ejecuta y con qué
 * rol. El rol vive en `Worker` (dato de identidad, docs/02); la API lo resuelve
 * desde la sesión autenticada y lo pasa explícitamente a cada caso de uso.
 */
export interface Actor {
  readonly workerId: WorkerId;
  readonly role: WorkerRole;
}

/** Roles que pueden escribir en los catálogos (docs/04: A). */
export const CATALOG_WRITE_ROLES: readonly WorkerRole[] = ['admin'];

/** Roles que pueden leer los catálogos (docs/04: A, Au). */
export const CATALOG_READ_ROLES: readonly WorkerRole[] = ['admin', 'auditor'];

/**
 * Todos los roles del sistema (docs/04, `GetStockByLocation`: A, Au, W). Pensado
 * para lecturas de stock abiertas al operario que consume el material.
 */
export const ALL_ROLES: readonly WorkerRole[] = ['admin', 'worker', 'auditor'];

/**
 * Guard de autorización compartido. Lanza `UnauthorizedRoleError` si el rol del
 * actor no está en `allowed`. Se ejecuta antes de cualquier validación o efecto
 * para que un rol indebido nunca llegue a tocar el dominio.
 */
export function requireRole(
  actor: Actor,
  allowed: readonly WorkerRole[],
  useCase: string,
): void {
  if (!allowed.includes(actor.role)) {
    throw new UnauthorizedRoleError(actor.role, useCase);
  }
}
