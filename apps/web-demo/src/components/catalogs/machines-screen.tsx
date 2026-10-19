'use client';

import { CogIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { MachineForm, type MachineFormValues } from '@/components/catalogs/machine-form';
import { MoveMachineDialog } from '@/components/catalogs/move-machine-dialog';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { FormDialog } from '@/components/shared/form-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { QueryError } from '@/components/shared/query-error';
import { RowActions } from '@/components/shared/row-actions';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { errorToMessage } from '@/lib/api/errors';
import { locationsApi } from '@/lib/api/modules/locationsApi';
import { machinesApi } from '@/lib/api/modules/machinesApi';
import type { MachineWire } from '@/lib/api/types';
import { MACHINE_STATUS_LABELS, MACHINE_STATUS_META } from '@/lib/format/labels';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';

/**
 * Pantalla 5 — `/maquinas` (docs/10-plan-de-web.md §5). Alta/edición (nombre,
 * tipo y lugar de producción) y acción **Mover** (`POST /machines/:id/move`). El
 * `status` es de solo lectura (la API no expone transiciones — gap documentado).
 * El auditor ve la tabla sin acciones de escritura.
 */

export function MachinesScreen({ canWrite }: { readonly canWrite: boolean }) {
  const machines = useApiQuery(() => machinesApi.list());
  const locations = useApiQuery(() => locationsApi.list());
  useErrorToast(machines.error);
  useErrorToast(locations.error);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MachineWire | null>(null);
  const [moveTarget, setMoveTarget] = useState<MachineWire | null>(null);
  const [busy, setBusy] = useState(false);

  const locationById = useMemo(
    () => new Map((locations.data ?? []).map((location) => [location.id, location])),
    [locations.data],
  );
  const machineTypes = useMemo(() => {
    const types = new Set((machines.data ?? []).map((machine) => machine.type));
    return [...types].sort((a, b) => a.localeCompare(b, 'es'));
  }, [machines.data]);

  function openCreate(): void {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(machine: MachineWire): void {
    setEditing(machine);
    setDialogOpen(true);
  }

  async function handleSubmit(values: MachineFormValues): Promise<void> {
    setBusy(true);
    try {
      if (editing) {
        await machinesApi.update(editing.id, { name: values.name, type: values.type });
        toast.success(`Se actualizó «${values.name}».`);
      } else {
        await machinesApi.create(values);
        toast.success(`Se creó «${values.name}».`);
      }
      setDialogOpen(false);
      setEditing(null);
      machines.refetch();
    } catch (error) {
      toast.error(errorToMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleMove(locationId: string): Promise<void> {
    if (!moveTarget) {
      return;
    }
    setBusy(true);
    try {
      await machinesApi.move(moveTarget.id, { locationId });
      toast.success(`Se movió «${moveTarget.name}».`);
      setMoveTarget(null);
      machines.refetch();
    } catch (error) {
      toast.error(errorToMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const columns: DataTableColumn<MachineWire>[] = [
    {
      id: 'name',
      header: 'Nombre',
      cell: (machine) => <span className="font-medium">{machine.name}</span>,
      sortValue: (machine) => machine.name,
    },
    {
      id: 'type',
      header: 'Tipo',
      cell: (machine) => <span className="capitalize">{machine.type}</span>,
      sortValue: (machine) => machine.type,
    },
    {
      id: 'location',
      header: 'Lugar',
      cell: (machine) => locationById.get(machine.locationId)?.name ?? '—',
      sortValue: (machine) => locationById.get(machine.locationId)?.name ?? '',
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (machine) => {
        const meta = MACHINE_STATUS_META[machine.status];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
      sortValue: (machine) => MACHINE_STATUS_LABELS[machine.status],
    },
  ];

  if (canWrite) {
    columns.push({
      id: 'actions',
      header: 'Acciones',
      cellClassName: 'text-right',
      cell: (machine) => (
        <RowActions
          actions={[
            { label: 'Editar', onSelect: () => openEdit(machine) },
            { label: 'Mover', onSelect: () => setMoveTarget(machine) },
          ]}
        />
      ),
    });
  }

  const error = machines.error ?? locations.error;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Máquinas"
        description="Equipos de producción, su tipo, lugar y estado operativo."
        actions={
          canWrite ? (
            <Button onClick={openCreate} disabled={locations.data === null}>
              <PlusIcon aria-hidden="true" />
              Nueva máquina
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <QueryError
          error={error}
          onRetry={() => {
            machines.refetch();
            locations.refetch();
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={machines.data ?? []}
          getRowId={(machine) => machine.id}
          loading={machines.loading || locations.loading}
          searchable
          searchPlaceholder="Buscar máquinas…"
          searchValue={(machine) =>
            [
              machine.name,
              machine.type,
              locationById.get(machine.locationId)?.name ?? '',
              MACHINE_STATUS_LABELS[machine.status],
            ].join(' ')
          }
          emptyTitle="Todavía no hay máquinas"
          emptyDescription="Creá la primera máquina de producción."
          emptyAction={
            canWrite ? (
              <Button variant="outline" onClick={openCreate} disabled={locations.data === null}>
                <CogIcon aria-hidden="true" />
                Nueva máquina
              </Button>
            ) : undefined
          }
        />
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Editar máquina' : 'Nueva máquina'}
        description={
          editing
            ? 'En la edición no se cambia el lugar; usá la acción «Mover».'
            : 'El lugar debe ser de producción. El tipo es libre (se sugieren los existentes).'
        }
      >
        <MachineForm
          mode={editing ? 'edit' : 'create'}
          defaultValues={
            editing
              ? { name: editing.name, type: editing.type, locationId: editing.locationId }
              : undefined
          }
          locations={locations.data ?? []}
          machineTypes={machineTypes}
          busy={busy}
          onSubmit={handleSubmit}
          onCancel={() => setDialogOpen(false)}
        />
      </FormDialog>

      <MoveMachineDialog
        open={moveTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMoveTarget(null);
          }
        }}
        machine={moveTarget}
        locations={locations.data ?? []}
        busy={busy}
        onSubmit={handleMove}
      />
    </div>
  );
}
