'use client';

import Link from 'next/link';

import { EmptyState } from '@/components/shared/empty-state';
import { QueryError } from '@/components/shared/query-error';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { batchEventsApi } from '@/lib/api/modules/batchEventsApi';
import { machinesApi } from '@/lib/api/modules/machinesApi';
import { workersApi } from '@/lib/api/modules/workersApi';
import { formatDateTime } from '@/lib/format/date';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';
import { isNavHrefEnabled } from '@/lib/nav';

import { PageHeader } from './dashboard-common';

/**
 * Dashboard del **auditor** (docs/10-plan-de-web.md §2): últimos eventos
 * (`GET /batch-events`, recorte en cliente — no hay paginación, gap documentado)
 * + accesos a `/stock` (Fase 5) y a `/trazabilidad` cuando la pantalla exista.
 */

const LATEST_LIMIT = 8;

export function AuditorDashboard() {
  const events = useApiQuery(() => batchEventsApi.list());
  const machines = useApiQuery(() => machinesApi.list());
  const workers = useApiQuery(() => workersApi.list());

  // Los nombres de máquina/operario se resuelven contra los catálogos: si una
  // lectura falla el listado sigue (ids crudos) pero el toast avisa el porqué.
  useErrorToast(events.error);
  useErrorToast(machines.error);
  useErrorToast(workers.error);

  const canSeeStock = isNavHrefEnabled('/stock');
  const canSeeTrace = isNavHrefEnabled('/trazabilidad');

  const machineById = new Map((machines.data ?? []).map((machine) => [machine.id, machine]));
  const workerById = new Map((workers.data ?? []).map((worker) => [worker.id, worker]));

  // El wire llega en orden cronológico ascendente: los últimos son el final.
  const latestEvents = [...(events.data ?? [])].reverse().slice(0, LATEST_LIMIT);
  const loading = events.loading || machines.loading || workers.loading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Panel de auditoría"
        description="Últimos eventos de transformación y accesos de solo lectura."
      />

      {events.error !== null ? (
        <QueryError error={events.error} onRetry={events.refetch} />
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-medium">Últimos eventos</h2>
          {loading ? (
            <div className="flex flex-col gap-2" aria-hidden="true">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : latestEvents.length === 0 ? (
            <EmptyState
              title="Todavía no hay eventos registrados."
              description="Cuando alguien registre transformaciones, las más recientes aparecen acá."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {latestEvents.map((event) => (
                <li key={event.id} className="rounded-lg border bg-background p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {machineById.get(event.machineId)?.name ?? event.machineId}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(event.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Operario: {workerById.get(event.workerId)?.name ?? event.workerId}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(canSeeStock || canSeeTrace) && (
        <div className="flex flex-wrap gap-2">
          {canSeeStock && (
            <Link href="/stock" className={buttonVariants({ variant: 'outline' })}>
              Ver stock
            </Link>
          )}
          {canSeeTrace && (
            <Link href="/trazabilidad" className={buttonVariants({ variant: 'outline' })}>
              Trazabilidad
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
