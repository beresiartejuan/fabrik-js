import { type Actor, LocationId, MaterialId, type StockByLocationEntry } from '@fabrik/domain';

import { readTokens } from '@/lib/session/session-store';

import { stockMovementToWire } from '../demo/mappers';
import {
  type DemoContext,
  ensureDemoContext,
  getDemoContext,
  toApiError,
} from '../demo/module-kit';
import type { StockByLocationEntryWire, StockMovementWire } from '../types';

/**
 * Inventario (`apps/api/src/stock/stock.controller.ts`, Fase 5) sobre el runtime
 * DEMO (docs/demo.md §T4b): la fábrica ejecuta los mismos casos de uso
 * que el controlador (`GetStockByLocation` y `GetStockMovements`, lecturas puras
 * del registro `demo/registry.ts`) en lugar de las rutas HTTP; la interfaz, el
 * actor por llamada y el wire de respuesta quedan idénticos al módulo axios.
 *
 * - `byLocation` — roles **A/Au/W**: existencias agregadas por material de un
 *   lugar, tal como las calcula `GetStockByLocation`: la unidad sale del
 *   **catálogo** (no del movimiento), omite las entradas con delta neto 0 y las
 *   cantidades pueden ser **negativas** en lugares de producción (consumos sin
 *   entrada previa): la UI lo muestra con signo y color. Lugar desconocido →
 *   `ApiError` 404.
 * - `movements` — roles **A/Au** (un `worker` recibe `ApiError` 403, así que la
 *   UI no le ofrece el drawer de movimientos): historial del lugar en orden
 *   cronológico **ascendente**, con filtro por material opcional. Lugar
 *   desconocido → `ApiError` 404.
 *
 * Es un recurso de **solo lectura**: los movimientos se generan con arribos,
 * producción, transferencias y ajustes; no hay endpoints de escritura.
 *
 * Convención del kit (cabecera de `demo/module-kit.ts`): operaciones `async`,
 * context singleton por operación (`ensureDemoContext`), token leído **por
 * llamada** de la sesión y `try/catch → toApiError`.
 */

/** Serializa una entrada de stock agregada (`StockByLocationEntryResponse`). */
function serializeStockByLocationEntry(entry: StockByLocationEntry): StockByLocationEntryWire {
  return { materialId: entry.materialId, amount: entry.amount, unit: entry.unit };
}

export interface StockApi {
  /** Stock agregado de un lugar: `{ materialId, amount, unit }[]`. */
  byLocation(locationId: string): Promise<StockByLocationEntryWire[]>;

  /** Movimientos del lugar, opcionalmente filtrados por material. */
  movements(locationId: string, materialId?: string): Promise<StockMovementWire[]>;
}

/**
 * Pasos de arranque de cada operación (kit §Convención): el histórico arranca
 * **una vez por pestaña** (`ensureDemoContext`) y el actor sale del token
 * **leído en la llamada** — nunca se cachea.
 */
async function requireActorForCall(ctx: DemoContext): Promise<Actor> {
  await ensureDemoContext();
  return ctx.requireActor(readTokens()?.accessToken ?? '');
}

export function createStockApi(ctx: DemoContext = getDemoContext()): StockApi {
  return {
    async byLocation(locationId) {
      try {
        const actor = await requireActorForCall(ctx);
        const entries = await ctx.registry.useCases.traceability.GetStockByLocation.execute(actor, {
          locationId: LocationId.from(locationId),
        });
        return entries.map(serializeStockByLocationEntry);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async movements(locationId, materialId) {
      try {
        const actor = await requireActorForCall(ctx);
        const movements = await ctx.registry.useCases.traceability.GetStockMovements.execute(
          actor,
          {
            locationId: LocationId.from(locationId),
            materialId: materialId ? MaterialId.from(materialId) : undefined,
          },
        );
        return movements.map(stockMovementToWire);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

/** Instancia por defecto que usa la app. */
export const stockApi: StockApi = createStockApi();
