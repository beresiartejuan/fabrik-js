'use client';

import { type FormEvent, useId, useMemo, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { QueryError } from '@/components/shared/query-error';
import { SelectField } from '@/components/shared/select-field';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { batchEventsApi } from '@/lib/api/modules/batchEventsApi';
import { machinesApi } from '@/lib/api/modules/machinesApi';
import { materialsApi } from '@/lib/api/modules/materialsApi';
import { workersApi } from '@/lib/api/modules/workersApi';
import type { BatchEventWire } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format/date';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';

import {
  batchQuantitiesSummary,
  capEventsToDisplay,
  EMPTY_EVENT_FILTERS,
  type EventFilterState,
  toEventQuery,
} from './events-state';

/**
 * Pantalla 15 — `/eventos` (A/Au, docs/pantallas.md §15, Fase 6).
 *
 * Filtros (máquina, operario, material y rango `from`/`to`) → `GET /batch-events`
 * → tabla cronológica ascendente de transformaciones. **Gap de API:** no hay
 * paginación, entonces la tabla recorta en cliente a los eventos más recientes
 * (`EVENTS_DISPLAY_LIMIT`) con una nota visible.
 */

export function EventsScreen() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Eventos"
        description="Historial de transformaciones: filtrá por máquina, operario, material o rango de fechas."
      />
      <EventsBody />
    </div>
  );
}

function EventsBody() {
  const fromId = useId();
  const toId = useId();

  // Catálogos para los selects y para resolver nombres (admin/auditor).
  const machines = useApiQuery(() => machinesApi.list());
  const workers = useApiQuery(() => workersApi.list());
  const materials = useApiQuery(() => materialsApi.list());

  const [applied, setApplied] = useState<EventFilterState>(EMPTY_EVENT_FILTERS);
  const [draft, setDraft] = useState<EventFilterState>(EMPTY_EVENT_FILTERS);

  const events = useApiQuery(() => batchEventsApi.list(toEventQuery(applied)), [applied]);

  // Si un catálogo falla, la tabla sigue (los nombres quedan como ids); el
  // toast avisa el porqué, y el error del listado va al bloque + toast.
  useErrorToast(machines.error);
  useErrorToast(workers.error);
  useErrorToast(materials.error);
  useErrorToast(events.error);

  const materialById = useMemo(
    () => new Map((materials.data ?? []).map((material) => [material.id, material])),
    [materials.data],
  );
  const machineById = useMemo(
    () => new Map((machines.data ?? []).map((machine) => [machine.id, machine])),
    [machines.data],
  );
  const workerById = useMemo(
    () => new Map((workers.data ?? []).map((worker) => [worker.id, worker])),
    [workers.data],
  );

  function materialName(materialId: string): string {
    return materialById.get(materialId)?.name ?? materialId;
  }
  function machineName(machineId: string): string {
    return machineById.get(machineId)?.name ?? machineId;
  }
  function workerName(workerId: string): string {
    return workerById.get(workerId)?.name ?? workerId;
  }

  // El wire llega ascendente: el recorte conserva los más recientes (final).
  const { visible, total, capped } = capEventsToDisplay(events.data ?? []);

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setApplied(draft);
  }

  function clearFilters(): void {
    setDraft(EMPTY_EVENT_FILTERS);
    setApplied(EMPTY_EVENT_FILTERS);
  }

  function setDraftFilter<K extends keyof EventFilterState>(key: K, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const columns: DataTableColumn<BatchEventWire>[] = [
    {
      id: 'timestamp',
      header: 'Fecha y hora',
      cell: (event) => <span className="whitespace-nowrap">{formatDateTime(event.timestamp)}</span>,
      sortValue: (event) => event.timestamp,
    },
    {
      id: 'machine',
      header: 'Máquina',
      cell: (event) => machineName(event.machineId),
      sortValue: (event) => machineName(event.machineId),
    },
    {
      id: 'worker',
      header: 'Operario',
      cell: (event) => workerName(event.workerId),
      sortValue: (event) => workerName(event.workerId),
    },
    {
      id: 'inputs',
      header: 'Entradas',
      cell: (event) => {
        const summary = batchQuantitiesSummary(event.inputs, materialName);
        return (
          <span title={summary} className="max-w-64 truncate align-bottom">
            {summary}
          </span>
        );
      },
    },
    {
      id: 'outputs',
      header: 'Salidas',
      cell: (event) => {
        const summary = batchQuantitiesSummary(event.outputs, materialName);
        return (
          <span title={summary} className="max-w-64 truncate align-bottom">
            {summary}
          </span>
        );
      },
    },
    {
      id: 'observation',
      header: 'Observación',
      cell: (event) =>
        event.observation !== undefined ? (
          <span title={event.observation} className="block max-w-72 truncate text-sm">
            {event.observation}
          </span>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border bg-background">
        <form
          onSubmit={applyFilters}
          className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3"
          noValidate
        >
          <SelectField
            label="Máquina"
            value={draft.machineId}
            onValueChange={(next) => {
              setDraftFilter('machineId', next);
            }}
            options={[
              { value: '', label: 'Todas las máquinas' },
              ...(machines.data ?? []).map((machine) => ({
                value: machine.id,
                label: machine.name,
              })),
            ]}
            placeholder="Todas"
            disabled={machines.loading}
          />
          <SelectField
            label="Operario"
            value={draft.workerId}
            onValueChange={(next) => {
              setDraftFilter('workerId', next);
            }}
            options={[
              { value: '', label: 'Todos los operarios' },
              ...(workers.data ?? []).map((worker) => ({ value: worker.id, label: worker.name })),
            ]}
            placeholder="Todos"
            disabled={workers.loading}
          />
          <SelectField
            label="Material"
            value={draft.materialId}
            onValueChange={(next) => {
              setDraftFilter('materialId', next);
            }}
            options={[
              { value: '', label: 'Todos los materiales' },
              ...(materials.data ?? []).map((material) => ({
                value: material.id,
                label: material.name,
              })),
            ]}
            placeholder="Todos"
            disabled={materials.loading}
          />
          <Field>
            <FieldLabel htmlFor={fromId}>Desde</FieldLabel>
            <Input
              id={fromId}
              type="datetime-local"
              value={draft.from}
              onChange={(change) => {
                setDraftFilter('from', change.target.value);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={toId}>Hasta</FieldLabel>
            <Input
              id={toId}
              type="datetime-local"
              value={draft.to}
              onChange={(change) => {
                setDraftFilter('to', change.target.value);
              }}
            />
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="outline" size="sm">
              Aplicar filtros
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Limpiar
            </Button>
          </div>
        </form>
      </section>

      {events.error ? (
        <QueryError error={events.error} onRetry={events.refetch} />
      ) : (
        <>
          {capped && (
            <p className="text-sm text-muted-foreground" role="note">
              Mostrando los últimos {visible.length} de {total} eventos (la API no pagina todavía).
            </p>
          )}
          <DataTable
            columns={columns}
            rows={visible}
            getRowId={(event) => event.id}
            loading={events.loading}
            searchable
            searchPlaceholder="Buscar en eventos…"
            searchValue={(event) =>
              [
                machineName(event.machineId),
                workerName(event.workerId),
                batchQuantitiesSummary(event.inputs, materialName),
                batchQuantitiesSummary(event.outputs, materialName),
                event.observation ?? '',
              ].join(' ')
            }
            emptyTitle="Sin eventos para estos filtros"
            emptyDescription="Probá ampliar el rango temporal o quitar filtros para ver más resultados."
          />
        </>
      )}
    </div>
  );
}
