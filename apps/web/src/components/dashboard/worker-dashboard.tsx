'use client';

import { TimeSlot } from '@fabrik/domain';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorToMessage } from '@/lib/api/errors';
import { assignmentsApi } from '@/lib/api/modules/assignmentsApi';
import { machinesApi } from '@/lib/api/modules/machinesApi';
import type { TimeSlotWire } from '@/lib/api/types';
import { useApiQuery } from '@/lib/hooks/useApiQuery';

import { PageHeader } from './dashboard-common';

/**
 * Dashboard del **worker** (docs/10-plan-de-web.md §2): "Mis máquinas de ahora".
 *
 * La API no expone un endpoint de máquinas activas; se calcula en cliente con
 * `GET /workers/:id/schedule` + `GET /machines` + `TimeSlot.contains(now)` del
 * dominio (gap documentado en el plan).
 */

function slotContains(slot: TimeSlotWire, date: Date): boolean {
  try {
    return TimeSlot.create(slot.daysOfWeek, slot.start, slot.end).contains(date);
  } catch {
    // Franja inválida en el wire: se ignora en vez de romper el dashboard.
    return false;
  }
}

export function WorkerDashboard({ workerId }: { workerId: string }) {
  const schedule = useApiQuery(() => assignmentsApi.workerSchedule(workerId), [workerId]);
  const machines = useApiQuery(() => machinesApi.list());

  // Instante de referencia para "ahora"; se recalcula en cada render.
  const now = new Date();

  const machineById = new Map((machines.data ?? []).map((machine) => [machine.id, machine]));
  const currentMachines = (schedule.data ?? [])
    .filter((assignment) => slotContains(assignment.slot, now))
    .map((assignment) => machineById.get(assignment.machineId))
    .filter((machine): machine is NonNullable<typeof machine> => machine !== undefined);

  const loading = schedule.loading || machines.loading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mi jornada" description="Máquinas que tenés asignadas en este momento." />

      {schedule.error !== null && (
        <p className="text-sm text-destructive">{errorToMessage(schedule.error)}</p>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : currentMachines.length === 0 ? (
        <p className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">
          Todavía no hay máquinas asignadas en este momento.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {currentMachines.map((machine) => (
            <Card key={machine.id}>
              <CardHeader className="gap-1">
                <CardTitle className="text-base">{machine.name}</CardTitle>
                <CardDescription>{machine.type}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href="/produccion/registrar" className={buttonVariants()}>
          Registrar transformación
        </Link>
        <Link href="/suministros/arribo" className={buttonVariants({ variant: 'outline' })}>
          Arribo de suministros
        </Link>
      </div>
    </div>
  );
}
