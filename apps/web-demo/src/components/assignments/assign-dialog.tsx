'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createEmptySlotDraft,
  draftDuplicates,
  findOverlappingAssignments,
  type TimeSlotDraft,
  validateSlotDraft,
} from '@/components/assignments/time-slot-draft';
import { TimeSlotEditor } from '@/components/assignments/time-slot-editor';
import { FormDialog } from '@/components/shared/form-dialog';
import { SelectField } from '@/components/shared/select-field';
import { Button } from '@/components/ui/button';
import { errorToMessage } from '@/lib/api/errors';
import type { AssignWorkerInput } from '@/lib/api/modules/assignmentsApi';
import { assignmentsApi } from '@/lib/api/modules/assignmentsApi';
import type { AssignmentWire, MachineWire, WorkerWire } from '@/lib/api/types';
import { formatTimeSlot } from '@/lib/format/days';
import { useApiQuery } from '@/lib/hooks/useApiQuery';

/**
 * Diálogo “Asignar” (docs/10-plan-de-web.md §Pantalla 8, Fase 3). Presenta
 * worker activo + máquina + editor de franja (`TimeSlotEditor`) y hace la
 * **pre-validación I1 en cliente**: contra la agenda del worker (se pide
 * fresca al abrir el diálogo y al cambiar de worker) marca inline “Se solapa
 * con …” con `TimeSlot.overlaps` del dominio y deshabilita el submit. Franjas
 * adyacentes (end === start) y de otros días no cuentan; el server revalida y
 * el 409 `OverlappingScheduleError` se mapea con `errorToMessage` en la
 * pantalla (el diálogo queda abierto para corregir la franja).
 *
 * Como los otros diálogos (p. ej. “Mover”), es presentacional: el submit se
 * delega en la pantalla vía `onSubmit` + `busy`.
 */
export interface AssignDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly machines: readonly MachineWire[];
  readonly workers: readonly WorkerWire[];
  readonly initialMachineId?: string;
  readonly initialWorkerId?: string;
  /** `true` mientras la pantalla procesa la asignación. */
  readonly busy?: boolean;
  readonly onSubmit: (payload: AssignWorkerInput) => void;
}

export function AssignDialog({
  open,
  onOpenChange,
  machines,
  workers,
  initialMachineId,
  initialWorkerId,
  busy = false,
  onSubmit,
}: AssignDialogProps) {
  const [workerId, setWorkerId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [draft, setDraft] = useState<TimeSlotDraft>(createEmptySlotDraft);

  // Estado limpio en cada apertura, con la máquina/worker que se venía mirando.
  useEffect(() => {
    if (open) {
      setWorkerId(initialWorkerId ?? '');
      setMachineId(initialMachineId ?? '');
      setDraft(createEmptySlotDraft());
    }
  }, [open, initialMachineId, initialWorkerId]);

  // Agenda del worker seleccionado: base del chequeo de solapes (I1). Se pide
  // fresca al cambiar de worker (deps) y al abrir el diálogo; mientras se
  // edita la franja los solapes se recalculan localmente (la agenda no cambia
  // por tipear) y el server revalida al enviar.
  const schedule = useApiQuery<AssignmentWire[]>(
    () => (workerId ? assignmentsApi.workerSchedule(workerId) : Promise.resolve([])),
    [workerId],
  );
  const refreshSchedule = schedule.refetch;

  // Al abrir se revalida la agenda aunque el worker no cambie: el worker ya
  // puede venir preseleccionado desde la vista “Por trabajador”.
  useEffect(() => {
    if (open) {
      refreshSchedule();
    }
  }, [open, refreshSchedule]);

  const validation = useMemo(() => validateSlotDraft(draft), [draft]);
  const conflicts = useMemo(
    () => findOverlappingAssignments(draft, schedule.data ?? []),
    [draft, schedule.data],
  );
  const duplicate = useMemo(
    () =>
      draftDuplicates(
        draft,
        (schedule.data ?? []).map((a) => a.slot),
      ),
    [draft, schedule.data],
  );

  const workerOptions = workers
    .filter((worker) => worker.active)
    .map((worker) => ({ value: worker.id, label: worker.name }));
  const machineOptions = machines.map((machine) => ({ value: machine.id, label: machine.name }));

  const selectedWorkerName =
    workers.find((worker) => worker.id === workerId)?.name ?? 'este trabajador';

  const canSubmit =
    workerId !== '' &&
    machineId !== '' &&
    validation.valid &&
    conflicts.length === 0 &&
    !schedule.loading &&
    !busy;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit({
      workerId,
      machineId,
      slot: { daysOfWeek: [...draft.days], start: draft.start, end: draft.end },
    });
  }

  const machineName = (targetMachineId: string): string =>
    machines.find((machine) => machine.id === targetMachineId)?.name ?? targetMachineId;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Asignar operario"
      description={`Nueva franja para ${selectedWorkerName}. Elegí días y horario; las franjas adyacentes (ej. 08:00–10:00 y 10:00–12:00) no cuentan como solape.`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Trabajador"
            value={workerId}
            onValueChange={setWorkerId}
            options={workerOptions}
            placeholder="Elegí un trabajador"
            disabled={busy}
          />
          <SelectField
            label="Máquina"
            value={machineId}
            onValueChange={setMachineId}
            options={machineOptions}
            placeholder="Elegí una máquina"
            disabled={busy}
          />
        </div>

        <TimeSlotEditor
          value={draft}
          onChange={setDraft}
          issues={validation.issues}
          disabled={busy}
        />

        {schedule.error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            No se pudo verificar la agenda actual: {errorToMessage(schedule.error)}.
          </div>
        )}

        {!schedule.error && schedule.loading && workerId !== '' && (
          <p className="text-sm text-muted-foreground">Verificando la agenda del trabajador…</p>
        )}

        {conflicts.length > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {duplicate ? (
              <p className="font-medium">
                Ya existe una asignación idéntica para {selectedWorkerName}.
              </p>
            ) : (
              <>
                <p className="font-medium">Se solapa con {selectedWorkerName}:</p>
                <ul className="mt-1 list-inside list-disc">
                  {conflicts.map((assignment) => (
                    <li key={assignment.id}>
                      {formatTimeSlot(assignment.slot)} en {machineName(assignment.machineId)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {busy ? 'Asignando…' : 'Asignar'}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
