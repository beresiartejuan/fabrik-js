'use client';

import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { MaterialForm } from '@/components/catalogs/material-form';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { FormDialog } from '@/components/shared/form-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { QueryError } from '@/components/shared/query-error';
import { RowActions } from '@/components/shared/row-actions';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { errorToMessage } from '@/lib/api/errors';
import { type CreateMaterialInput, materialsApi } from '@/lib/api/modules/materialsApi';
import type { MaterialWire } from '@/lib/api/types';
import {
  activeMeta,
  MATERIAL_KIND_LABELS,
  MATERIAL_KIND_META,
  PHYSICAL_STATE_LABELS,
  PHYSICAL_STATE_META,
} from '@/lib/format/labels';
import { unitLabel } from '@/lib/format/units';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';

/**
 * Pantalla 3 — `/materiales` (docs/pantallas.md §3). Alta/edición en diálogo
 * (unidades filtradas por estado físico, ver `MaterialForm`), baja lógica con
 * confirmación y búsqueda/orden local en la tabla. El auditor ve la tabla **sin**
 * acciones de escritura.
 */

export function MaterialsScreen({ canWrite }: { readonly canWrite: boolean }) {
  const materials = useApiQuery(() => materialsApi.list());
  useErrorToast(materials.error);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialWire | null>(null);
  const [busy, setBusy] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<MaterialWire | null>(null);

  function openCreate(): void {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(material: MaterialWire): void {
    setEditing(material);
    setDialogOpen(true);
  }

  async function handleSubmit(values: CreateMaterialInput): Promise<void> {
    setBusy(true);
    try {
      if (editing) {
        await materialsApi.update(editing.id, {
          name: values.name,
          ...(values.description !== undefined ? { description: values.description } : {}),
          unitOfMeasure: values.unitOfMeasure,
        });
        toast.success(`Se actualizó «${values.name}».`);
      } else {
        await materialsApi.create(values);
        toast.success(`Se creó «${values.name}».`);
      }
      setDialogOpen(false);
      setEditing(null);
      materials.refetch();
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
      await materialsApi.deactivate(deactivateTarget.id);
      toast.success(`Se dio de baja «${deactivateTarget.name}».`);
      setDeactivateTarget(null);
      materials.refetch();
    } catch (error) {
      toast.error(errorToMessage(error));
      throw error;
    }
  }

  const columns: DataTableColumn<MaterialWire>[] = [
    {
      id: 'name',
      header: 'Nombre',
      cell: (material) => <span className="font-medium">{material.name}</span>,
      sortValue: (material) => material.name,
    },
    {
      id: 'description',
      header: 'Descripción',
      cell: (material) => (
        <span className="text-muted-foreground">{material.description ?? '—'}</span>
      ),
    },
    {
      id: 'kind',
      header: 'Tipo',
      cell: (material) => {
        const meta = MATERIAL_KIND_META[material.kind];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
      sortValue: (material) => MATERIAL_KIND_LABELS[material.kind],
    },
    {
      id: 'physicalState',
      header: 'Estado físico',
      cell: (material) => {
        const meta = PHYSICAL_STATE_META[material.physicalState];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
      sortValue: (material) => PHYSICAL_STATE_LABELS[material.physicalState],
    },
    {
      id: 'unit',
      header: 'Unidad',
      cell: (material) => unitLabel(material.unitOfMeasure),
      sortValue: (material) => unitLabel(material.unitOfMeasure),
    },
    {
      id: 'active',
      header: 'Estado',
      cell: (material) => {
        const meta = activeMeta(material.active);
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
      sortValue: (material) => (material.active ? 1 : 0),
    },
  ];

  if (canWrite) {
    columns.push({
      id: 'actions',
      header: 'Acciones',
      cellClassName: 'text-right',
      cell: (material) => (
        <RowActions
          actions={[
            { label: 'Editar', onSelect: () => openEdit(material) },
            {
              label: 'Dar de baja',
              variant: 'destructive',
              disabled: !material.active,
              disabledHint: 'El material ya está dado de baja.',
              onSelect: () => setDeactivateTarget(material),
            },
          ]}
        />
      ),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Materiales"
        description="Catálogo de insumos y productos con su unidad y estado."
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <PlusIcon aria-hidden="true" />
              Nuevo material
            </Button>
          ) : undefined
        }
      />

      {materials.error ? (
        <QueryError error={materials.error} onRetry={materials.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={materials.data ?? []}
          getRowId={(material) => material.id}
          loading={materials.loading}
          searchable
          searchPlaceholder="Buscar materiales…"
          searchValue={(material) =>
            [material.name, material.description ?? '', MATERIAL_KIND_LABELS[material.kind]].join(
              ' ',
            )
          }
          emptyTitle="Todavía no hay materiales"
          emptyDescription="Creá el primer material para empezar a registrar producción."
          emptyAction={
            canWrite ? (
              <Button variant="outline" onClick={openCreate}>
                <PlusIcon aria-hidden="true" />
                Nuevo material
              </Button>
            ) : undefined
          }
        />
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Editar material' : 'Nuevo material'}
        description={
          editing
            ? 'El tipo y el estado físico no se modifican; sí el nombre, la descripción y la unidad.'
            : 'Elegí el estado físico y la unidad compatible.'
        }
      >
        <MaterialForm
          mode={editing ? 'edit' : 'create'}
          defaultValues={
            editing
              ? {
                  name: editing.name,
                  description: editing.description,
                  kind: editing.kind,
                  physicalState: editing.physicalState,
                  unitOfMeasure: editing.unitOfMeasure,
                }
              : undefined
          }
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
        title="Dar de baja material"
        description={
          deactivateTarget
            ? `«${deactivateTarget.name}» quedará inactivo. Podés seguir viéndolo en la tabla.`
            : undefined
        }
        confirmLabel="Dar de baja"
        destructive
        onConfirm={handleDeactivate}
      />
    </div>
  );
}
