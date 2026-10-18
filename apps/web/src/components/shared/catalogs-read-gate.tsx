'use client';

import type { ReactNode } from 'react';

import { useSession } from '@/lib/session/session-store';

/**
 * Puerta de **lectura de catálogos** para pantallas de producción (Fase 4):
 * `CATALOG_READ_ROLES` del dominio (`admin`/`auditor`) puede listar
 * materiales/lugares/recetas; un `worker` recibe 403 (`UnauthorizedRoleError`),
 * así que las pantallas que el operario usa degradan a entrada manual en vez de
 * disparar lecturas que van a fallar. La redirección por rol la hace
 * `RequireRole` antes.
 */
export function CatalogsReadGate({
  children,
}: {
  readonly children: (canReadCatalogs: boolean) => ReactNode;
}) {
  const { session } = useSession();
  const role = session?.worker?.role;
  return <>{children(role === 'admin' || role === 'auditor')}</>;
}
