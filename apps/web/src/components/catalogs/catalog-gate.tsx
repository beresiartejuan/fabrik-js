'use client';

import type { ReactNode } from 'react';

import { useSession } from '@/lib/session/session-store';

/**
 * Puerta de las pantallas de catálogo (docs/pantallas.md §Pantallas 3–6):
 * resuelve `canWrite` (admin escribe; auditor es solo lectura) desde la sesión y
 * lo pasa a la pantalla. La redirección por rol la hace `RequireRole` antes.
 */
export function CatalogGate({ children }: { readonly children: (canWrite: boolean) => ReactNode }) {
  const { session } = useSession();
  return <>{children(session?.worker?.role === 'admin')}</>;
}
