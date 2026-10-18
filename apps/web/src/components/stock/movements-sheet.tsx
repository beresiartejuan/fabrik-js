'use client';

import { EmptyState } from '@/components/shared/empty-state';
import { QueryError } from '@/components/shared/query-error';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { stockApi } from '@/lib/api/modules/stockApi';
import type { StockByLocationEntryWire } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format/date';
import { shortId } from '@/lib/format/ids';
import { STOCK_REASON_META } from '@/lib/format/labels';
import { formatDelta } from '@/lib/format/quantity';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { cn } from '@/lib/utils';

/**
 * Drawer (Sheet) de movimientos de stock de un material en un lugar (Fase 5,
 * `GET /stock/:locationId/movements?materialId=`). Solo lectura A/Au: el worker
 * recibe 403, así que las pantallas **no lo montan** para ese rol.
 *
 * El wire llega ascendente por `timestamp`; acá se lista al revés (lo más
 * reciente primero), orden natural para revisar un historial.
 */

export interface MovementsSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly locationId: string;
  /** Entrada de stock seleccionada (fila que abrió el drawer). */
  readonly entry: StockByLocationEntryWire | null;
  /** Nombre ya resuelto del material (o el id del wire si no puede resolverse). */
  readonly materialName: string;
}

export function MovementsSheet({
  open,
  onOpenChange,
  locationId,
  entry,
  materialName,
}: MovementsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Movimientos — {materialName}</SheetTitle>
          <SheetDescription>
            Historial de este material en el lugar (más reciente primero), con el motivo de cada
            entrada y salida.
          </SheetDescription>
        </SheetHeader>
        {open && entry !== null && (
          <MovementsList locationId={locationId} materialId={entry.materialId} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function MovementsList({
  locationId,
  materialId,
}: {
  readonly locationId: string;
  readonly materialId: string;
}) {
  const movements = useApiQuery(() => stockApi.movements(locationId, materialId));

  const rows = [...(movements.data ?? [])].reverse();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
      {movements.error ? (
        <QueryError error={movements.error} onRetry={movements.refetch} />
      ) : movements.loading ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No hay movimientos para este material en este lugar"
          description="Cuando se registre un arribo, producción o transferencia, aparece acá."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((movement) => (
            <li key={movement.id} className="rounded-lg border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'font-medium tabular-nums',
                    movement.delta.amount < 0
                      ? 'text-destructive'
                      : 'text-emerald-700 dark:text-emerald-300',
                  )}
                >
                  {formatDelta(movement.delta)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(movement.timestamp)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusBadge tone={STOCK_REASON_META[movement.reason].tone}>
                  {STOCK_REASON_META[movement.reason].label}
                </StatusBadge>
                {movement.batchEventId && (
                  <span
                    title={movement.batchEventId}
                    className="font-mono text-xs text-muted-foreground"
                  >
                    Evento {shortId(movement.batchEventId)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
