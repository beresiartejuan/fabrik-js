'use client';

import Link from 'next/link';

import { EmptyState } from '@/components/shared/empty-state';
import { QueryError } from '@/components/shared/query-error';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { meApi } from '@/lib/api/modules/meApi';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';
import { isNavHrefEnabled } from '@/lib/nav';

import { PageHeader } from './dashboard-common';

/**
 * Dashboard del **worker** (docs/10-plan-de-web.md §2): "Mis máquinas de ahora".
 *
 * Consume `GET /me/schedule`, que resuelve la agenda del propio actor y calcula
 * `activeNow` en el servidor. Es la fuente de verdad de I3 (el reloj/zona del
 * navegador puede no coincidir con el proceso API y mostraría un estado distinto
 * al que aplicará `RecordTransformation`), así que aquí **no** se recalcula el
 * `TimeSlot`. La máquina viene enriquecida en el mismo ítem (nombre/tipo), sin
 * pedir `GET /machines` (que un worker no puede leer).
 */
export function WorkerDashboard() {
  const schedule = useApiQuery(() => meApi.schedule());
  useErrorToast(schedule.error);

  const currentMachines = (schedule.data ?? []).flatMap((item) =>
    item.activeNow && item.machine ? [item.machine] : [],
  );

  const canRegister = isNavHrefEnabled('/produccion/registrar');
  const canRegisterArrival = isNavHrefEnabled('/suministros/arribo');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mi jornada" description="Máquinas que tenés asignadas en este momento." />

      {schedule.loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : schedule.error !== null ? (
        <QueryError error={schedule.error} onRetry={schedule.refetch} />
      ) : currentMachines.length === 0 ? (
        <EmptyState
          title="Todavía no hay máquinas asignadas en este momento."
          description="Cuando el admin te asigne a las máquinas que están activas ahora mismo, aparecen acá."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {currentMachines.map((machine) => (
            <Card key={machine.id}>
              <CardHeader className="gap-1">
                <CardTitle className="text-base">{machine.name}</CardTitle>
                <CardDescription className="capitalize">{machine.type}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {(canRegister || canRegisterArrival) && (
        <div className="flex flex-wrap gap-2">
          {canRegister && (
            <Link href="/produccion/registrar" className={buttonVariants()}>
              Registrar transformación
            </Link>
          )}
          {canRegisterArrival && (
            <Link href="/suministros/arribo" className={buttonVariants({ variant: 'outline' })}>
              Arribo de suministros
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
