'use client';

import { AdminDashboard } from '@/components/dashboard/admin-dashboard';
import { AuditorDashboard } from '@/components/dashboard/auditor-dashboard';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-common';
import { WorkerDashboard } from '@/components/dashboard/worker-dashboard';
import { useSession } from '@/lib/session/session-store';

/**
 * Pantalla 2 — `/` (dashboard rol-aware, docs/10-plan-de-web.md §2).
 *
 * Renderiza un panel distinto según el rol del `Actor` de la sesión. Mientras la
 * sesión hidrata (o falta el `Actor`) muestra el skeleton; `RequireAuth` en el
 * layout `(app)` ya garantiza que haya sesión.
 */
export default function DashboardPage() {
  const { session, hydrated } = useSession();
  const worker = session?.worker ?? null;

  if (!hydrated || !worker) {
    return <DashboardSkeleton />;
  }

  switch (worker.role) {
    case 'admin':
      return <AdminDashboard />;
    case 'worker':
      return <WorkerDashboard workerId={worker.workerId} />;
    case 'auditor':
      return <AuditorDashboard />;
    default:
      return null;
  }
}
