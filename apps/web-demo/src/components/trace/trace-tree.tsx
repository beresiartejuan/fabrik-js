'use client';

import { StatusBadge } from '@/components/shared/status-badge';
import { formatDateTime } from '@/lib/format/date';
import { shortId } from '@/lib/format/ids';
import { BATCH_STATUS_META } from '@/lib/format/labels';
import { formatQuantity } from '@/lib/format/quantity';
import { cn } from '@/lib/utils';

import type { TraceViewNode } from './trace-view';

/**
 * Ángbol de trazabilidad recursivo (Fase 6, pantalla 14, docs/pantallas.md).
 *
 * Cada nodo (`TraceViewNode` normalizado) muestra:
 * - **Tarjeta de lote**: material resuelto, id abreviado (`#xxxxxxxx`), cantidad
 *   y estado (badge).
 * - **Tarjeta de evento** (solo cuando el nodo lo lleva): máquina y operario
 *   resueltos, timestamp formateado y observación si existe.
 * - Badge destructivo **«ciclo detectado»** en la rama cortada por datos
 *   corruptos (`cycleDetected`).
 *
 * La indentación usa listas anidadas con una línea vertical (`border-l`) como
 * conector — sin librería de grafos.
 */

/** Resoluciones de ids → nombres (los provee la pantalla con sus catálogos). */
export interface TraceResolvers {
  readonly materialName: (materialId: string) => string;
  readonly machineName: (machineId: string) => string;
  readonly workerName: (workerId: string) => string;
}

/** Resolutor de identidad: muestra los ids crudos del wire (tests / fallback). */
export const identityResolvers: TraceResolvers = {
  materialName: (id) => id,
  machineName: (id) => id,
  workerName: (id) => id,
};

export interface TraceTreeProps {
  /** Raíz ya normalizada (`normalizeTraceNode`/`normalizeForwardNode`). */
  readonly root: TraceViewNode;
  readonly resolvers: TraceResolvers;
}

export function TraceTree({ root, resolvers }: TraceTreeProps) {
  return (
    <ul className="list-none">
      <TraceNode node={root} resolvers={resolvers} isRoot />
    </ul>
  );
}

interface TraceNodeProps {
  readonly node: TraceViewNode;
  readonly resolvers: TraceResolvers;
  readonly isRoot?: boolean;
}

function TraceNode({ node, resolvers, isRoot = false }: TraceNodeProps) {
  return (
    <li>
      <div
        className={cn(
          'flex flex-col gap-2 rounded-xl border bg-background p-3',
          isRoot && 'border-ring/40 bg-muted/20',
        )}
      >
        {node.cycleDetected && (
          <div>
            <StatusBadge tone="destructive">ciclo detectado</StatusBadge>
          </div>
        )}
        {node.batch && <BatchCard batch={node.batch} resolvers={resolvers} />}
        {node.event && <EventCard event={node.event} resolvers={resolvers} />}
      </div>
      {node.children.length > 0 && (
        <ul className="mt-2 ml-3 flex list-none flex-col gap-2 border-l-2 border-border/60 pl-4">
          {node.children.map((child) => (
            // La clave es el id del lote/evento del hijo (único entre hermanos
            // en ambos árboles: un lote tiene un solo evento de origen).
            <TraceNode
              key={child.batch?.id ?? child.event?.id ?? 'nodo'}
              node={child}
              resolvers={resolvers}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Tarjeta de lote: material resuelto + id abreviado + cantidad + estado. */
function BatchCard({
  batch,
  resolvers,
}: {
  readonly batch: TraceViewNode['batch'];
  readonly resolvers: TraceResolvers;
}) {
  if (batch === undefined) {
    return null;
  }
  const status = BATCH_STATUS_META[batch.status];
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span
        title={batch.id}
        className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
      >
        #{shortId(batch.id)}
      </span>
      <span className="font-medium">{resolvers.materialName(batch.materialId)}</span>
      <span className="text-muted-foreground tabular-nums">{formatQuantity(batch.quantity)}</span>
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
    </div>
  );
}

/** Tarjeta de evento: máquina, operario, timestamp y observación (si existe). */
function EventCard({
  event,
  resolvers,
}: {
  readonly event: TraceViewNode['event'];
  readonly resolvers: TraceResolvers;
}) {
  if (event === undefined) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted/40 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span title={event.id} className="font-mono text-xs text-muted-foreground">
          evento {shortId(event.id)}
        </span>
        <span>
          Máquina: <strong>{resolvers.machineName(event.machineId)}</strong>
        </span>
        <span>
          Operario: <strong>{resolvers.workerName(event.workerId)}</strong>
        </span>
        <span className="text-xs text-muted-foreground">{formatDateTime(event.timestamp)}</span>
      </div>
      {event.observation !== undefined && (
        <p className="text-xs text-muted-foreground italic">«{event.observation}»</p>
      )}
    </div>
  );
}
