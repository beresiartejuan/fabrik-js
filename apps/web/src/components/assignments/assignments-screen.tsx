'use client';

import { PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { AssignDialog } from '@/components/assignments/assign-dialog';
import { ScheduleGrid } from '@/components/assignments/schedule-grid';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { QueryError } from '@/components/shared/query-error';
import { SelectField } from '@/components/shared/select-field';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorToMessage } from '@/lib/api/errors';
import type { AssignWorkerInput } from '@/lib/api/modules/assignmentsApi';
import { assignmentsApi } from '@/lib/api/modules/assignmentsApi';
import { machinesApi } from '@/lib/api/modules/machinesApi';
import { workersApi } from '@/lib/api/modules/workersApi';
import type { AssignmentWire } from '@/lib/api/types';
import { formatTimeSlot } from '@/lib/format/days';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';

/**
 * Pantalla 8 — `/asignaciones` (docs/pantallas.md §Fase 3).
 *
 * Vista de agenda con tabs **Por máquina | Por trabajador**: cada selección
 * carga `GET /machines/:id/schedule` o `GET /workers/:id/schedule` y la grilla
 * semanal resuelve la contraparte (worker en la vista de máquina y viceversa;
 * la API anida solo ids). Admin además asigna (`POST /assignments`, con
 * pre-validación de solapes en el diálogo) y desasigna
 * (`DELETE /assignments/:id` con confirmación); el auditor es solo lectura.
 */
type SlotView = 'machine' | 'worker';

export function AssignmentsScreen({ canWrite }: { readonly canWrite: boolean }) {
  const [view, setView] = useState<SlotView>('machine');
  const [machineId, setMachineId] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState<AssignmentWire | null>(null);

  // Catálogos: se cargan completos para resolver nombres de contraparte, y del
  // worker activo sale el selector del diálogo de alta.
  const machines = useApiQuery(() => machinesApi.list());
  const workers = useApiQuery(() => workersApi.list());

  // Agendas: sin selección no se llama a la API (la fetcher resuelve vacío).
  const machineSchedule = useApiQuery<AssignmentWire[]>(
    () => (machineId ? assignmentsApi.machineSchedule(machineId) : Promise.resolve([])),
    [machineId],
  );
  const workerSchedule = useApiQuery<AssignmentWire[]>(
    () => (workerId ? assignmentsApi.workerSchedule(workerId) : Promise.resolve([])),
    [workerId],
  );

  useErrorToast(machines.error);
  useErrorToast(workers.error);
  useErrorToast(machineSchedule.error);
  useErrorToast(workerSchedule.error);

  const workerById = useMemo(
    () => new Map((workers.data ?? []).map((worker) => [worker.id, worker])),
    [workers.data],
  );
  const machineById = useMemo(
    () => new Map((machines.data ?? []).map((machine) => [machine.id, machine])),
    [machines.data],
  );

  const selectedMachine = machineId ? machineById.get(machineId) : undefined;
  const selectedWorker = workerId ? workerById.get(workerId) : undefined;

  const activeSchedule = view === 'machine' ? machineSchedule : workerSchedule;
  const selectedId = view === 'machine' ? machineId : workerId;

  function counterpartLabel(assignment: AssignmentWire): string {
    if (view === 'machine') {
      return workerById.get(assignment.workerId)?.name ?? assignment.workerId;
    }
    return machineById.get(assignment.machineId)?.name ?? assignment.machineId;
  }

  /** El diálogo valida y entrega el payload; la petición y su cierre son de la pantalla. */
  async function handleAssign(payload: AssignWorkerInput): Promise<void> {
    setAssignBusy(true);
    try {
      await assignmentsApi.assign(payload);
      toast.success('Se creó la asignación.');
      machineSchedule.refetch();
      workerSchedule.refetch();
      setAssignOpen(false);
    } catch (cause) {
      // El 409 `OverlappingScheduleError` (y cualquier otro error) se muestra
      // como toast con el mensaje en español; el diálogo queda abierto.
      toast.error(errorToMessage(cause));
    } finally {
      setAssignBusy(false);
    }
  }

  async function handleUnassign(): Promise<void> {
    if (!unassignTarget) {
      return;
    }
    try {
      await assignmentsApi.unassign(unassignTarget.id);
      toast.success('Se quitó la asignación.');
      machineSchedule.refetch();
      workerSchedule.refetch();
    } catch (cause) {
      toast.error(errorToMessage(cause));
      throw cause;
    }
  }

  function unassignDescription(target: AssignmentWire): string {
    const slotLabel = formatTimeSlot(target.slot);
    return view === 'machine'
      ? `Se quitará la franja ${slotLabel} de ${counterpartLabel(target)} en ${selectedMachine?.name ?? 'la máquina'}.`
      : `Se quitará la franja ${slotLabel} de ${selectedWorker?.name ?? 'el trabajador'} en ${counterpartLabel(target)}.`;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Asignaciones"
        description="Quién atiende cada máquina y en qué franjas horarias."
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setAssignOpen(true);
              }}
            >
              <PlusIcon aria-hidden="true" />
              Asignar
            </Button>
          ) : undefined
        }
      />

      <Tabs value={view} onValueChange={(next) => setView(next as SlotView)}>
        <TabsList>
          <TabsTrigger value="machine">Por máquina</TabsTrigger>
          <TabsTrigger value="worker">Por trabajador</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === 'machine' ? (
        <SelectField
          label="Máquina"
          value={machineId}
          onValueChange={setMachineId}
          options={(machines.data ?? []).map((machine) => ({
            value: machine.id,
            label: machine.name,
          }))}
          placeholder={machines.loading ? 'Cargando máquinas…' : 'Elegí una máquina'}
          disabled={machines.loading}
        />
      ) : (
        <SelectField
          label="Trabajador"
          value={workerId}
          onValueChange={setWorkerId}
          options={(workers.data ?? []).map((worker) => ({
            value: worker.id,
            label: worker.active ? worker.name : `${worker.name} (inactivo)`,
          }))}
          placeholder={workers.loading ? 'Cargando trabajadores…' : 'Elegí un trabajador'}
          disabled={workers.loading}
        />
      )}

      {selectedId === '' ? (
        <EmptyState
          title={
            view === 'machine'
              ? 'Elegí una máquina para ver su agenda semanal.'
              : 'Elegí un trabajador para ver su agenda semanal.'
          }
          description="Las franjas se cargan desde la agenda semanal de la selección."
        />
      ) : activeSchedule.error ? (
        <QueryError error={activeSchedule.error} onRetry={activeSchedule.refetch} />
      ) : activeSchedule.loading ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <ScheduleGrid
          assignments={activeSchedule.data ?? []}
          counterpartLabel={counterpartLabel}
          canWrite={canWrite}
          onUnassign={canWrite ? setUnassignTarget : undefined}
          emptyTitle={
            view === 'machine'
              ? 'Sin asignaciones para esta máquina'
              : 'Sin asignaciones para este trabajador'
          }
          emptyDescription={
            canWrite
              ? 'Usá «Asignar» para sumar el primer horario.'
              : 'Todavía no hay horarios cargados.'
          }
        />
      )}

      {canWrite && (
        <AssignDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          machines={machines.data ?? []}
          workers={workers.data ?? []}
          initialMachineId={view === 'machine' && machineId !== '' ? machineId : undefined}
          initialWorkerId={view === 'worker' && workerId !== '' ? workerId : undefined}
          busy={assignBusy}
          onSubmit={(payload) => {
            void handleAssign(payload);
          }}
        />
      )}

      {canWrite && unassignTarget && (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setUnassignTarget(null);
            }
          }}
          title="Desasignar"
          description={unassignDescription(unassignTarget)}
          confirmLabel="Desasignar"
          destructive
          onConfirm={handleUnassign}
        />
      )}
    </div>
  );
}
