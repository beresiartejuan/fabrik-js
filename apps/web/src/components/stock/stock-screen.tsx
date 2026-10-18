'use client';

import { useMemo, useState } from 'react';

import { CatalogsReadGate } from '@/components/shared/catalogs-read-gate';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { QueryError } from '@/components/shared/query-error';
import { SelectField } from '@/components/shared/select-field';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { locationsApi } from '@/lib/api/modules/locationsApi';
import { materialsApi } from '@/lib/api/modules/materialsApi';
import { stockApi } from '@/lib/api/modules/stockApi';
import type { LocationWire, StockByLocationEntryWire } from '@/lib/api/types';
import { LOCATION_KIND_LABELS } from '@/lib/format/labels';
import { formatQty } from '@/lib/format/quantity';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';
import { cn } from '@/lib/utils';

import { MovementsSheet } from './movements-sheet';

/**
 * Pantalla 13 — `/stock` (A/Au/W, docs/10-plan-de-web.md §13, Fase 5).
 *
 * Selector de lugar → `GET /stock/:locationId` en tabla: material resuelto por
 * nombre (con los catálogos), **cantidad con signo** (en lugares de producción
 * los consumos agregan `amount` negativos) y unidad. Seleccionar una fila abre
 * el **drawer** de movimientos (`GET /stock/:locationId/movements?materialId=`).
 *
 * **Degradación por rol:** `GET /locations` y `GET /materials` son A/Au
 * (`CatalogsReadGate`), y el historial de movimientos también (`worker` → 403).
 * Un operario ingresa el ID del lugar manualmente, ve los ids de material y **no
 * tiene** botón de movimientos; el stock en sí sí lo lee (A/Au/W).
 */
export function StockScreen() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock"
        description="Existencias por lugar. Elegí un material para revisar el historial de movimientos; en la planta los consumos aparecen en negativo."
      />
      <CatalogsReadGate>
        {(canReadCatalogs) => <StockBody canReadCatalogs={canReadCatalogs} />}
      </CatalogsReadGate>
    </div>
  );
}

interface StockBodyProps {
  readonly canReadCatalogs: boolean;
}

function StockBody({ canReadCatalogs }: StockBodyProps) {
  const [locationId, setLocationId] = useState('');
  const [movementsTarget, setMovementsTarget] = useState<StockByLocationEntryWire | null>(null);

  const trimmedLocation = locationId.trim();
  const hasLocation = trimmedLocation.length > 0;

  // Catálogos (A/Au): el worker entra en modo manual y no dispara estas lecturas.
  const locations = useApiQuery(
    () => (canReadCatalogs ? locationsApi.list() : Promise.resolve(null)),
    [canReadCatalogs],
  );
  const materials = useApiQuery(
    () => (canReadCatalogs ? materialsApi.list() : Promise.resolve(null)),
    [canReadCatalogs],
  );

  // Un nombre de material que no resuelve no bloquea la tabla (queda el id del wire).
  useErrorToast(materials.error);

  const stock = useApiQuery(
    () => (hasLocation ? stockApi.byLocation(trimmedLocation) : Promise.resolve(null)),
    [hasLocation, trimmedLocation],
  );

  const materialById = useMemo(
    () => new Map((materials.data ?? []).map((material) => [material.id, material])),
    [materials.data],
  );

  function materialName(entry: StockByLocationEntryWire): string {
    return materialById.get(entry.materialId)?.name ?? entry.materialId;
  }

  const columns: DataTableColumn<StockByLocationEntryWire>[] = [
    {
      id: 'material',
      header: 'Material',
      cell: (entry) => <MaterialCell name={materialName(entry)} />,
      sortValue: (entry) => materialName(entry),
    },
    {
      id: 'amount',
      header: 'Cantidad',
      cell: (entry) => <StockAmount amount={entry.amount} unit={entry.unit} />,
      sortValue: (entry) => entry.amount,
    },
    ...(canReadCatalogs
      ? [
          {
            id: 'movements',
            header: 'Acciones',
            cell: (entry: StockByLocationEntryWire) => (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMovementsTarget(entry);
                }}
              >
                Ver movimientos
              </Button>
            ),
          } satisfies DataTableColumn<StockByLocationEntryWire>,
        ]
      : []),
  ];

  const selectedLocation: LocationWire | null =
    (locations.data ?? []).find((location) => location.id === trimmedLocation) ?? null;
  const locationLabel = selectedLocation
    ? `${selectedLocation.name} — ${LOCATION_KIND_LABELS[selectedLocation.kind]}`
    : trimmedLocation;

  return (
    <div className="flex flex-col gap-4">
      {!canReadCatalogs && (
        <p
          role="note"
          className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        >
          Tu rol no puede leer los catálogos ni el historial de movimientos (solo admins y
          auditores): ingresá el ID del lugar manualmente para consultar el stock.
        </p>
      )}

      {canReadCatalogs ? (
        <SelectField
          label="Lugar"
          value={trimmedLocation}
          onValueChange={setLocationId}
          options={(locations.data ?? []).map((location) => ({
            value: location.id,
            label: `${location.name} — ${LOCATION_KIND_LABELS[location.kind]}`,
          }))}
          placeholder={locations.loading ? 'Cargando lugares…' : 'Elegí un lugar'}
          disabled={locations.loading}
        />
      ) : (
        <ManualLocationField onConfirm={setLocationId} />
      )}

      {locations.error ? (
        <QueryError error={locations.error} onRetry={locations.refetch} />
      ) : !hasLocation ? (
        <EmptyState
          title={canReadCatalogs ? 'Elegí un lugar' : 'Ingresá el ID de un lugar'}
          description={
            canReadCatalogs
              ? 'El stock se consulta por lugar: producción o almacén.'
              : 'El stock se consulta por lugar: pedí el ID (de producción o almacén) y pegalo acá.'
          }
        />
      ) : stock.error ? (
        <QueryError error={stock.error} onRetry={stock.refetch} />
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-sm font-medium text-muted-foreground">
            Stock de {locationLabel}
          </h2>
          <DataTable
            columns={columns}
            rows={stock.data ?? []}
            getRowId={(entry) => entry.materialId}
            loading={stock.loading}
            emptyTitle="No hay stock registrado en este lugar"
            emptyDescription="Cuando se registren arribos o transformaciones, las existencias del lugar aparecen acá."
          />
        </section>
      )}

      {canReadCatalogs && (
        <MovementsSheet
          open={movementsTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setMovementsTarget(null);
            }
          }}
          locationId={trimmedLocation}
          entry={movementsTarget}
          materialName={movementsTarget ? materialName(movementsTarget) : ''}
        />
      )}
    </div>
  );
}

// --- Celdas y modo manual ----------------------------------------------------

/** Material resuelto: nombre de catálogo (id completo en `title`). */
function MaterialCell({ name }: { readonly name: string }) {
  return <span title={name}>{name}</span>;
}

const AMOUNT_POSITIVE_CLASS = 'text-emerald-700 dark:text-emerald-300';
const AMOUNT_NEGATIVE_CLASS = 'text-destructive';

/**
 * Cantidad con **signo y color**: en lugares de producción el agregado puede
 * ser negativo (consumos). El `-` lo trae el número; el verde distingue el
 * resto.
 */
function StockAmount({
  amount,
  unit,
  className,
}: {
  readonly amount: number;
  readonly unit: StockByLocationEntryWire['unit'];
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        amount < 0 ? AMOUNT_NEGATIVE_CLASS : AMOUNT_POSITIVE_CLASS,
        className,
      )}
    >
      {formatQty(amount, unit)}
    </span>
  );
}

/**
 * Degradación del worker (catálogos A/Au): ID del lugar a mano + botón
 * «Consultar» (la consulta no dispara por tecla para no bombardear la API con
 * 404s mientras se escribe un UUID).
 */
function ManualLocationField({ onConfirm }: { readonly onConfirm: (locationId: string) => void }) {
  const [draft, setDraft] = useState('');

  return (
    <Field>
      <FieldLabel>ID del lugar</FieldLabel>
      <form
        className="flex flex-wrap items-end gap-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(draft.trim());
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Id del lugar"
          aria-label="ID del lugar"
          className="min-w-60 flex-1"
        />
        <Button type="submit" variant="outline" size="sm" disabled={draft.trim().length === 0}>
          Consultar
        </Button>
      </form>
    </Field>
  );
}
