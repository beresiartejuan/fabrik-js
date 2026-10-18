'use client';

import { useSearchParams } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { QueryError } from '@/components/shared/query-error';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ApiError } from '@/lib/api/errors';
import { batchEventsApi } from '@/lib/api/modules/batchEventsApi';
import { machinesApi } from '@/lib/api/modules/machinesApi';
import { materialsApi } from '@/lib/api/modules/materialsApi';
import { traceApi } from '@/lib/api/modules/traceApi';
import { workersApi } from '@/lib/api/modules/workersApi';
import type { BatchEventWire, BatchForwardNodeWire, BatchTraceNodeWire } from '@/lib/api/types';
import { batchLabel } from '@/lib/format/ids';
import { useApiQuery } from '@/lib/hooks/useApiQuery';

import { type TraceResolvers, TraceTree } from './trace-tree';
import { deriveRecentBatchIds, normalizeForwardNode, normalizeTraceNode } from './trace-view';

/**
 * Pantalla 14 — `/trazabilidad` (A/Au, docs/10-plan-de-web.md §14, Fase 6).
 *
 * Buscador por **ID de lote** (o «lotes recientes», derivados en cliente desde
 * `GET /batch-events` con `deriveRecentBatchIds`) → `GET /trace/:batchId`
 * (Genealogía, hacia atrás) y `GET /trace/:batchId/forward` (Recall, adelante)
 * en tabs. El árbol se renderiza con el componente recursivo `TraceTree`; el
 * 404 de un lote desconocido muestra el mensaje amigable.
 *
 * **Deep-link:** acepta `?batch=<id>` (lo enlaza `/produccion` desde su
 * buscador) para aterrizar con la trazabilidad ya cargada.
 *
 * Ambos árboles se piden al cargar un lote (mismo rol, costo acotado): los
 * tabs solo eligen qué panel mostrar, así que el cambio de pestaña no
 * refetchea (los paneles de `Tabs` se desmontan cuando están inactivos).
 */

const RECENT_BATCHES_LIMIT = 6;

export function TraceScreen() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Trazabilidad"
        description="Genealogía de un lote hacia atrás (insumos) y recall hacia adelante (productos afectados)."
      />
      <TraceBody />
    </div>
  );
}

/** Valor del query param `batch` saneado (vacío = sin lote precargado). */
function batchParamFrom(searchParams: { get(key: string): string | null }): string {
  return searchParams.get('batch')?.trim() ?? '';
}

function TraceBody() {
  const searchParams = useSearchParams();

  // Estado inicial desde el deep-link `?batch=`; el input lo refleja.
  const [batchId, setBatchId] = useState<string>(() => batchParamFrom(searchParams));
  const [draft, setDraft] = useState<string>(() => batchParamFrom(searchParams));

  // Catálogos (A/Au como la pantalla): resuelven nombres de material y actores.
  const materials = useApiQuery(() => materialsApi.list());
  const machines = useApiQuery(() => machinesApi.list());
  const workers = useApiQuery(() => workersApi.list());
  // «Lotes recientes»: los eventos (ascendentes) alimentan el helper puro.
  const pastEvents = useApiQuery(() => batchEventsApi.list());

  const resolvers: TraceResolvers = useMemo(() => {
    const materialById = new Map((materials.data ?? []).map((m) => [m.id, m]));
    const machineById = new Map((machines.data ?? []).map((m) => [m.id, m]));
    const workerById = new Map((workers.data ?? []).map((w) => [w.id, w]));
    return {
      materialName: (id) => materialById.get(id)?.name ?? id,
      machineName: (id) => machineById.get(id)?.name ?? id,
      workerName: (id) => workerById.get(id)?.name ?? id,
    };
  }, [materials.data, machines.data, workers.data]);

  const hasBatch = batchId.length > 0;

  const backward = useApiQuery(
    () => (hasBatch ? traceApi.backward(batchId) : Promise.resolve(null)),
    [batchId, hasBatch],
  );
  const forward = useApiQuery(
    () => (hasBatch ? traceApi.forward(batchId) : Promise.resolve(null)),
    [batchId, hasBatch],
  );

  const notFound = backward.error?.hasStatus(404) ?? false;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const next = draft.trim();
    if (next.length === 0) {
      return;
    }
    setBatchId(next);
  }

  function selectBatch(next: string): void {
    setBatchId(next);
    setDraft(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl border bg-background p-4">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2" noValidate>
          <Field className="min-w-60 flex-1">
            <FieldLabel>Buscar lote por ID</FieldLabel>
            <Input
              value={draft}
              onChange={(change) => setDraft(change.target.value)}
              placeholder="Id del lote (UUID)"
              aria-label="Buscar lote por ID"
            />
          </Field>
          <Button type="submit" variant="outline" size="sm" disabled={draft.trim().length === 0}>
            Buscar
          </Button>
        </form>
        <RecentBatches events={pastEvents.data ?? []} onSelect={selectBatch} />
      </section>

      {!hasBatch ? (
        <EmptyState
          title="Buscá un lote por su ID"
          description="Pegá el ID completo del lote (UUID) para ver su genealogía; también podés elegir uno de los lotes recientes."
        />
      ) : notFound ? (
        <EmptyState
          title="No se encontró ningún lote con ese ID."
          description="Revisá el ID y probá otra vez: la trazabilidad usa el ID completo del lote."
        />
      ) : backward.error !== null ? (
        <QueryError error={backward.error} onRetry={backward.refetch} />
      ) : (
        <Tabs defaultValue="genealogia" className="w-full">
          <TabsList>
            <TabsTrigger value="genealogia">Genealogía</TabsTrigger>
            <TabsTrigger value="recall">Recall</TabsTrigger>
          </TabsList>
          <TabsContent value="genealogia" className="pt-2">
            <TracePanel
              variant="backward"
              loading={backward.loading}
              error={backward.error}
              data={backward.data}
              onRetry={backward.refetch}
              resolvers={resolvers}
            />
          </TabsContent>
          <TabsContent value="recall" className="pt-2">
            <TracePanel
              variant="forward"
              loading={forward.loading}
              error={forward.error}
              data={forward.data}
              onRetry={forward.refetch}
              resolvers={resolvers}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

interface TracePanelProps {
  readonly variant: 'backward' | 'forward';
  readonly loading: boolean;
  readonly error: ApiError | null;
  readonly data: BatchTraceNodeWire | BatchForwardNodeWire | null;
  readonly onRetry: () => void;
  readonly resolvers: TraceResolvers;
}

/** Estado de un panel del árbol: loading → error → árbol normalizado. */
function TracePanel({ variant, loading, error, data, onRetry, resolvers }: TracePanelProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (error !== null) {
    return <QueryError error={error} onRetry={onRetry} />;
  }
  if (data === null) {
    return null;
  }
  const view =
    variant === 'backward'
      ? normalizeTraceNode(data as BatchTraceNodeWire)
      : normalizeForwardNode(data as BatchForwardNodeWire);
  return (
    <div className="flex flex-col gap-2">
      <TraceTree root={view} resolvers={resolvers} />
      {variant === 'forward' && view.children.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ninguna transformación consumió este lote: no hay productos derivados (recall vacío).
        </p>
      )}
    </div>
  );
}

/** Accesos rápidos: lotes tocados por los últimos eventos (A/Au). */
function RecentBatches({
  events,
  onSelect,
}: {
  readonly events: readonly BatchEventWire[];
  readonly onSelect: (batchId: string) => void;
}) {
  const recentIds = deriveRecentBatchIds(events, RECENT_BATCHES_LIMIT);
  if (recentIds.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Lotes recientes:</span>
      {recentIds.map((id) => (
        <Button
          key={id}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onSelect(id);
          }}
          title={id}
        >
          <span className="font-mono">{batchLabel(id)}</span>
        </Button>
      ))}
    </div>
  );
}
