import type { ListBatchEventsParams } from '@/lib/api/modules/batchEventsApi';
import type { BatchEventWire, BatchQuantityWire } from '@/lib/api/types';

/**
 * Estado puro de los filtros de `/eventos` (Fase 6, pantalla 15). Sin React:
 * mapea el borrador del formulario al query de `GET /batch-events`, probándose
 * sin montar componentes.
 *
 * El API exige ISO 8601 **con offset** (`z.iso.datetime({ offset: true })` de
 * `apps/api/src/batch-events/batch-events.dto.ts`); los inputs `datetime-local`
 * no traen zona horaria, así que se convierten con `new Date(...).toISOString()`
 * (UTC explícito). Un valor inválido/vacío → se omite (nunca va `''` a la API).
 */

/** Filtros como strings crudos del formulario (`''` = sin filtro). */
export interface EventFilterState {
  readonly machineId: string;
  readonly workerId: string;
  readonly materialId: string;
  /** Valor del input `datetime-local` (p. ej. `2026-10-17T12:30`). */
  readonly from: string;
  readonly to: string;
}

export const EMPTY_EVENT_FILTERS: EventFilterState = {
  machineId: '',
  workerId: '',
  materialId: '',
  from: '',
  to: '',
};

/** `true` si algún filtro está aplicado (decide la copia del estado vacío). */
export function hasEventFilters(state: EventFilterState): boolean {
  return (
    state.machineId.trim().length > 0 ||
    state.workerId.trim().length > 0 ||
    state.materialId.trim().length > 0 ||
    state.from.trim().length > 0 ||
    state.to.trim().length > 0
  );
}

/** `local` (`YYYY-MM-DDTHH:mm`) → ISO 8601 con offset; inválido/vacío → `null`. */
export function toIsoOrNull(localValue: string): string | null {
  const trimmed = localValue.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Mapea el estado de filtros a los params de `batchEventsApi.list`. */
export function toEventQuery(state: EventFilterState): ListBatchEventsParams {
  const machineId = state.machineId.trim();
  const workerId = state.workerId.trim();
  const materialId = state.materialId.trim();
  const from = toIsoOrNull(state.from);
  const to = toIsoOrNull(state.to);
  return {
    ...(machineId !== '' ? { machineId } : {}),
    ...(workerId !== '' ? { workerId } : {}),
    ...(materialId !== '' ? { materialId } : {}),
    ...(from !== null ? { from } : {}),
    ...(to !== null ? { to } : {}),
  };
}

/**
 * Recorte de la tabla en cliente (gap de API: no hay paginación, docs/10).
 * El wire llega ascendente: «los últimos» = final del arreglo.
 */
export const EVENTS_DISPLAY_LIMIT = 200;

/** Recorta al máximo visible, conservando los más recientes (final del arreglo). */
export function capEventsToDisplay(events: readonly BatchEventWire[]): {
  readonly visible: readonly BatchEventWire[];
  readonly total: number;
  readonly capped: boolean;
} {
  const visible =
    events.length > EVENTS_DISPLAY_LIMIT ? events.slice(-EVENTS_DISPLAY_LIMIT) : events;
  return { visible, total: events.length, capped: events.length > EVENTS_DISPLAY_LIMIT };
}

/** Resumen de insumos/salidas: `2 · Harina, Agua` (`—` si no hay filas). */
export function batchQuantitiesSummary(
  items: readonly BatchQuantityWire[],
  materialName: (materialId: string) => string,
): string {
  if (items.length === 0) {
    return '—';
  }
  return `${items.length} · ${items.map((item) => materialName(item.materialId)).join(', ')}`;
}
