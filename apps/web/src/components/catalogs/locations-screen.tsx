'use client';

import { MapPinIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { LocationForm, type LocationFormValues } from '@/components/catalogs/location-form';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { FormDialog } from '@/components/shared/form-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { QueryError } from '@/components/shared/query-error';
import { RowActions } from '@/components/shared/row-actions';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { errorToMessage } from '@/lib/api/errors';
import { locationsApi } from '@/lib/api/modules/locationsApi';
import type { LocationWire } from '@/lib/api/types';
import { LOCATION_KIND_LABELS, LOCATION_KIND_META } from '@/lib/format/labels';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';

/**
 * Pantalla 4 — `/ubicaciones` (docs/10-plan-de-web.md §4). Alta con nombre y tipo;
 * la edición **solo renombra** (el tipo no se puede cambiar). No hay baja lógica
 * en la API. El auditor ve la tabla sin acciones de escritura.
 */

export function LocationsScreen({ canWrite }: { readonly canWrite: boolean }) {
  const locations = useApiQuery(() => locationsApi.list());
  useErrorToast(locations.error);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LocationWire | null>(null);
  const [busy, setBusy] = useState(false);

  function openCreate(): void {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(location: LocationWire): void {
    setEditing(location);
    setDialogOpen(true);
  }

  async function handleSubmit(values: LocationFormValues): Promise<void> {
    setBusy(true);
    try {
      if (editing) {
        await locationsApi.update(editing.id, { name: values.name });
        toast.success(`Se renombró «${values.name}».`);
      } else {
        await locationsApi.create(values);
        toast.success(`Se creó «${values.name}».`);
      }
      setDialogOpen(false);
      setEditing(null);
      locations.refetch();
    } catch (error) {
      toast.error(errorToMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const columns: DataTableColumn<LocationWire>[] = [
    {
      id: 'name',
      header: 'Nombre',
      cell: (location) => <span className="font-medium">{location.name}</span>,
      sortValue: (location) => location.name,
    },
    {
      id: 'kind',
      header: 'Tipo',
      cell: (location) => {
        const meta = LOCATION_KIND_META[location.kind];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
      sortValue: (location) => LOCATION_KIND_LABELS[location.kind],
    },
  ];

  if (canWrite) {
    columns.push({
      id: 'actions',
      header: 'Acciones',
      cellClassName: 'text-right',
      cell: (location) => (
        <RowActions actions={[{ label: 'Renombrar', onSelect: () => openEdit(location) }]} />
      ),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ubicaciones"
        description="Lugares de producción y almacenes de la fábrica."
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <PlusIcon aria-hidden="true" />
              Nueva ubicación
            </Button>
          ) : undefined
        }
      />

      {locations.error ? (
        <QueryError error={locations.error} onRetry={locations.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={locations.data ?? []}
          getRowId={(location) => location.id}
          loading={locations.loading}
          searchable
          searchPlaceholder="Buscar ubicaciones…"
          searchValue={(location) => `${location.name} ${LOCATION_KIND_LABELS[location.kind]}`}
          emptyTitle="Todavía no hay ubicaciones"
          emptyDescription="Creá el primer lugar de producción o almacén."
          emptyAction={
            canWrite ? (
              <Button variant="outline" onClick={openCreate}>
                <MapPinIcon aria-hidden="true" />
                Nueva ubicación
              </Button>
            ) : undefined
          }
        />
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? 'Renombrar ubicación' : 'Nueva ubicación'}
        description={
          editing
            ? 'Solo se puede cambiar el nombre; el tipo queda fijo.'
            : 'Los lugares de producción alojan máquinas; los almacenes guardan stock.'
        }
      >
        <LocationForm
          mode={editing ? 'edit' : 'create'}
          defaultValues={editing ? { name: editing.name, kind: editing.kind } : undefined}
          busy={busy}
          onSubmit={handleSubmit}
          onCancel={() => setDialogOpen(false)}
        />
      </FormDialog>
    </div>
  );
}
