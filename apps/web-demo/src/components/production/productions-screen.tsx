'use client';

import Link from 'next/link';
import { type FormEvent, useId, useMemo, useState } from 'react';

import { CatalogsReadGate } from '@/components/shared/catalogs-read-gate';
import { DataTable, type DataTableColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { QueryError } from '@/components/shared/query-error';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, errorToMessage } from '@/lib/api/errors';
import { batchesApi } from '@/lib/api/modules/batchesApi';
import { materialsApi } from '@/lib/api/modules/materialsApi';
import { recipesApi } from '@/lib/api/modules/recipesApi';
import type { BatchWire } from '@/lib/api/types';
import { batchLabel, shortId } from '@/lib/format/ids';
import { BATCH_STATUS_META } from '@/lib/format/labels';
import { formatQuantity } from '@/lib/format/quantity';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { isNavHrefEnabled } from '@/lib/nav';
import { useSession } from '@/lib/session/session-store';

/**
 * Pantalla 9 — `/produccion` (A/W/Au). Lista las **producciones activas** (lotes
 * `in_progress`) con `GET /batches?status=in_progress` (gap del plan ya
 * resuelto en la API) y ofrece un buscador por ID (`GET /batches/:id`; 404 →
 * mensaje amigable). El resultado enlaza a `/trazabilidad?batch=` (Fase 6, A/Au).
 *
 * Los nombres de material y de receta se resuelven con los catálogos cuando el
 * rol puede leerlos (`admin`/`auditor`); un operario ve los ids del wire, igual
 * que en el resto de su flujo (listar y buscar son A/Au/W).
 */
export function ProductionsScreen() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Producción"
        description="Lotes en curso (in_progress). Los seguimientos se registran desde «Registrar transformación»."
      />
      <CatalogsReadGate>
        {(canReadCatalogs) => <ProductionsBody canReadCatalogs={canReadCatalogs} />}
      </CatalogsReadGate>
    </div>
  );
}

interface ProductionsBodyProps {
  readonly canReadCatalogs: boolean;
}

function ProductionsBody({ canReadCatalogs }: ProductionsBodyProps) {
  const { session } = useSession();
  const role = session?.worker?.role;

  const batches = useApiQuery(() => batchesApi.list({ status: 'in_progress' }));
  const materials = useApiQuery(
    () => (canReadCatalogs ? materialsApi.list() : Promise.resolve(null)),
    [canReadCatalogs],
  );
  const recipes = useApiQuery(
    () => (canReadCatalogs ? recipesApi.list() : Promise.resolve(null)),
    [canReadCatalogs],
  );

  const materialById = useMemo(
    () => new Map((materials.data ?? []).map((material) => [material.id, material])),
    [materials.data],
  );
  const recipeById = useMemo(
    () => new Map((recipes.data ?? []).map((recipe) => [recipe.id, recipe])),
    [recipes.data],
  );

  function materialName(batch: BatchWire): string {
    return materialById.get(batch.materialId)?.name ?? batch.materialId;
  }

  function recipeLabel(batch: BatchWire): string {
    if (!batch.recipeId) {
      return '—';
    }
    return recipeById.get(batch.recipeId)?.name ?? `Receta ${shortId(batch.recipeId)}`;
  }

  const canStartProduction = role === 'admin' && isNavHrefEnabled('/produccion/nueva');
  const canRegister = role === 'worker' && isNavHrefEnabled('/produccion/registrar');
  // Trazabilidad (Fase 6) es A/Au: el worker no recibe el enlace (403).
  const canTrace = (role === 'admin' || role === 'auditor') && isNavHrefEnabled('/trazabilidad');

  const search = useBatchSearch();

  const columns: DataTableColumn<BatchWire>[] = [
    {
      id: 'id',
      header: 'Lote',
      cell: (batch) => (
        <span title={batch.id} className="font-mono text-sm">
          {batchLabel(batch.id)}
        </span>
      ),
      sortValue: (batch) => batch.id,
    },
    {
      id: 'material',
      header: 'Material',
      cell: (batch) => materialName(batch),
      sortValue: (batch) => materialName(batch),
    },
    {
      id: 'quantity',
      header: 'Cantidad',
      cell: (batch) => formatQuantity(batch.quantity),
      sortValue: (batch) => batch.quantity.amount,
    },
    {
      id: 'recipe',
      header: 'Receta',
      cell: (batch) => recipeLabel(batch),
      sortValue: (batch) => recipeLabel(batch),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (batch) => (
        <StatusBadge tone={BATCH_STATUS_META[batch.status].tone}>
          {BATCH_STATUS_META[batch.status].label}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {(canStartProduction || canRegister) && (
        <div className="flex flex-wrap gap-2">
          {canStartProduction && (
            <Link href="/produccion/nueva" className={buttonVariants()}>
              Nueva producción
            </Link>
          )}
          {canRegister && (
            <Link href="/produccion/registrar" className={buttonVariants({ variant: 'outline' })}>
              Registrar transformación
            </Link>
          )}
        </div>
      )}

      <BatchSearch
        searchState={search}
        resultLabel={(batch) => `${materialName(batch)} · ${formatQuantity(batch.quantity)}`}
        showTraceLink={canTrace}
      />

      {batches.error ? (
        <QueryError error={batches.error} onRetry={batches.refetch} />
      ) : (
        <DataTable
          columns={columns}
          rows={batches.data ?? []}
          getRowId={(batch) => batch.id}
          loading={batches.loading}
          emptyTitle="No hay producciones activas"
          emptyDescription="Iniciá una orden desde una receta para crear el primer lote."
        />
      )}
    </div>
  );
}

// --- Buscador por ID ---------------------------------------------------------

interface BatchSearchState {
  readonly run: (id: string) => void;
  readonly clear: () => void;
  readonly loading: boolean;
  readonly result: BatchWire | null;
  readonly error: unknown;
  readonly errorIsNotFound: boolean;
}

/** Busca un lote por id con `GET /batches/:id`; el 404 se muestra amigable. */
function useBatchSearch(): BatchSearchState {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BatchWire | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function run(id: string): Promise<void> {
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await batchesApi.get(trimmed));
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }

  function clear(): void {
    setResult(null);
    setError(null);
  }

  return {
    run,
    clear,
    loading,
    result,
    error,
    errorIsNotFound: error instanceof ApiError && error.hasStatus(404),
  };
}

interface BatchSearchProps {
  readonly searchState: BatchSearchState;
  /** Resumen legible del lote encontrado (nombre de material + cantidad). */
  readonly resultLabel: (batch: BatchWire) => string;
  /** A/Au: el resultado enlaza a su trazabilidad (`/trazabilidad?batch=`). */
  readonly showTraceLink?: boolean;
}

function BatchSearch({ searchState, resultLabel, showTraceLink = false }: BatchSearchProps) {
  const queryId = useId();
  const [query, setQuery] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    searchState.run(query);
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-background p-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        <Field className="min-w-60 flex-1">
          <FieldLabel htmlFor={queryId}>Buscar lote por ID</FieldLabel>
          <Input
            id={queryId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Id del lote (UUID)"
            disabled={searchState.loading}
          />
        </Field>
        <Button type="submit" variant="outline" size="sm" disabled={searchState.loading}>
          {searchState.loading ? 'Buscando…' : 'Buscar'}
        </Button>
      </form>

      {searchState.error !== null && (
        <FieldError>
          {searchState.errorIsNotFound
            ? 'No se encontró ningún lote con ese ID.'
            : errorToMessage(searchState.error)}
        </FieldError>
      )}

      {searchState.result && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <StatusBadge tone={BATCH_STATUS_META[searchState.result.status].tone}>
            {BATCH_STATUS_META[searchState.result.status].label}
          </StatusBadge>
          <strong>{batchLabel(searchState.result.id)}</strong>
          <span>{resultLabel(searchState.result)}</span>
          {showTraceLink && (
            <Link
              href={`/trazabilidad?batch=${searchState.result.id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Ver trazabilidad
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={searchState.clear}>
            Cerrar
          </Button>
        </div>
      )}
    </section>
  );
}
