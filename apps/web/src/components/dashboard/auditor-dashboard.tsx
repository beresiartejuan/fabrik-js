'use client';

import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorToMessage } from '@/lib/api/errors';
import { batchEventsApi } from '@/lib/api/modules/batchEventsApi';
import { machinesApi } from '@/lib/api/modules/machinesApi';
import { workersApi } from '@/lib/api/modules/workersApi';
import { formatDateTime } from '@/lib/format/date';
import { useApiQuery } from '@/lib/hooks/useApiQuery';

import { PageHeader } from './dashboard-common';

/**
 * Dashboard del **auditor** (docs/10-plan-de-web.md §2): últimos eventos
 * (`GET /batch-events`, recorte en cliente — no hay paginación, gap documentado)
 * + accesos a `/stock` y `/trazabilidad`.
 */

const LATEST_LIMIT = 8;

export function AuditorDashboard() {
  const events = useApiQuery(() => batchEventsApi.list());
  const machines = useApiQuery(() => machinesApi.list());
  const workers = useApiQuery(() => workersApi.list());

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

      {events.error !== null && (
        <p className="text-sm text-destructive">{errorToMessage(events.error)}</p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">Últimos eventos</h2>
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : latestEvents.length === 0 ? (
          <p className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">
            Todavía no hay eventos registrados.
          </p>
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

      <div className="flex flex-wrap gap-2">
        <Link href="/stock" className={buttonVariants({ variant: 'outline' })}>
          Ver stock
        </Link>
        <Link href="/trazabilidad" className={buttonVariants({ variant: 'outline' })}>
          Trazabilidad
        </Link>
      </div>
    </div>
  );
}
