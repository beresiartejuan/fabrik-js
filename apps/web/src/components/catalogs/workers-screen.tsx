'use client';

import { PlusIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { WorkerForm, type WorkerFormValues } from '@/components/catalogs/worker-form';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { FormDialog } from '@/components/shared/form-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { QueryError } from '@/components/shared/query-error';
import { RowActions } from '@/components/shared/row-actions';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { errorToMessage } from '@/lib/api/errors';
import { workersApi } from '@/lib/api/modules/workersApi';
import type { WorkerWire } from '@/lib/api/types';
import { activeMeta, WORKER_ROLE_LABELS } from '@/lib/format/labels';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';

/**
 * Pantalla 6 — `/trabajadores` (docs/pantallas.md §6). Alta/edición y baja
 * lógica. **Reactivar** queda deshabilitado con nota: la API no expone ese caso
 * de uso (deuda anotada en docs/09). El auditor ve la tabla sin acciones.
 */

const REACTIVATE_HINT = 'La API todavía no expone la reactivación de trabajadores (deuda de API).';

export function WorkersScreen({ canWrite }: { readonly canWrite: boolean }) {
  const workers = useApiQuery(() => workersApi.list());
  useErrorToast(workers.error);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WorkerWire | null>(null);
  const [busy, setBusy] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<WorkerWire | null>(null);

  function openCreate(): void {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(worker: WorkerWire): void {
    setEditing(worker);
    setDialogOpen(true);
  }

  async function handleSubmit(values: WorkerFormValues): Promise<void> {
    setBusy(true);
    try {
      if (editing) {
        await workersApi.update(editing.id, values);
        toast.success(`Se actualizó «${values.name}».`);
      } else {
        await workersApi.create(values);
        toast.success(`Se creó «${values.name}».`);
      }
      setDialogOpen(false);
      setEditing(null);
      workers.refetch();
    } catch (error) {
      toast.error(errorToMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate(): Promise<void> {
    if (!deactivateTarget) {
      return;
    }
    try {
      await workersApi.deactivate(deactivateTarget.id);
      toast.success(`Se dio de baja «${deactivateTarget.name}».`);
      setDeactivateTarget(null);
      workers.refetch();
    } catch (error) {
      toast.error(errorToMessage(error));
      throw error;
    }
  }

  const columns: DataTableColumn<WorkerWire>[] = [
    {
      id: 'name',
      header: 'Nombre',
      cell: (worker) => <span className="font-medium">{worker.name}</span>,
      sortValue: (worker) => worker.name,
    },
    {
      id: 'role',
      header: 'Rol',
      cell: (worker) => WORKER_ROLE_LABELS[worker.role],
      sortValue: (worker) => WORKER_ROLE_LABELS[worker.role],
    },
    {
      id: 'active',
      header: 'Estado',
      cell: (worker) => {
        const meta = activeMeta(worker.active);
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
      sortValue: (worker) => (worker.active ? 1 : 0),
    },
  ];

  if (canWrite) {
    columns.push({
      id: 'actions',
      header: 'Acciones',
      cellClassName: 'text-right',
      cell: (worker) => (
        <RowActions
          actions={[
            { label: 'Editar', onSelect: () => openEdit(worker) },
            {
              label: 'Dar de baja',
              variant: 'destructive',
              disabled: !worker.active,
              disabledHint: 'El trabajador ya está dado de baja.',
              onSelect: () => setDeactivateTarget(worker),
            },
            {
              label: 'Reactivar',
              disabled: true,
              disabledHint: REACTIVATE_HINT,
              onSelect: () => undefined,
            },
          ]}
        />
      ),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Trabajadores"
        description="Administradores, operarios y auditores de la fábrica."
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <PlusIcon aria-hidden="true" />
              Nuevo trabajador
            </Button>
          ) : undefined
        }
      />

      {workers.error ? (
        <QueryError error={workers.error} onRetry={workers.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={workers.data ?? []}
          getRowId={(worker) => worker.id}
          loading={workers.loading}
          searchable
          searchPlaceholder="Buscar trabajadores…"
          searchValue={(worker) => `${worker.name} ${WORKER_ROLE_LABELS[worker.role]}`}
          emptyTitle="Todavía no hay trabajadores"
          emptyDescription="Creá el primer trabajador para asignarlo a las máquinas."
          emptyAction={
            canWrite ? (
              <Button variant="outline" onClick={openCreate}>
                <UsersIcon aria-hidden="true" />
                Nuevo trabajador
              </Button>
            ) : undefined
          }
        />
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Editar trabajador' : 'Nuevo trabajador'}
        description="El nombre y el rol se pueden modificar en cualquier momento."
      >
        <WorkerForm
          mode={editing ? 'edit' : 'create'}
          defaultValues={editing ? { name: editing.name, role: editing.role } : undefined}
          busy={busy}
          onSubmit={handleSubmit}
          onCancel={() => setDialogOpen(false)}
        />
      </FormDialog>

      <ConfirmDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivateTarget(null);
          }
        }}
        title="Dar de baja trabajador"
        description={
          deactivateTarget
            ? `«${deactivateTarget.name}» quedará inactivo. La reactivación todavía no está disponible.`
            : undefined
        }
        confirmLabel="Dar de baja"
        destructive
        onConfirm={handleDeactivate}
      />
    </div>
  );
}
