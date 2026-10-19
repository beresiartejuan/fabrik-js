import { type Actor, LocationId, MaterialId, Quantity } from '@fabrik/domain';

import { readTokens } from '@/lib/session/session-store';

import { batchToWire } from '../demo/mappers';
import {
  type DemoContext,
  ensureDemoContext,
  getDemoContext,
  toApiError,
} from '../demo/module-kit';
import type { BatchWire, QuantityWire } from '../types';

/**
 * Ingreso de suministros (`apps/api/src/supplies/supplies.controller.ts`) sobre
 * el runtime DEMO (docs/demo.md §T4b): la fábrica ejecuta el caso de uso
 * real `RegisterSupplyArrival` del registro (`demo/registry.ts`) en lugar de
 * `POST /supplies/arrivals`; la interfaz, el actor por llamada y el wire de
 * respuesta quedan idénticos al módulo axios (los componentes no cambian).
 *
 * `RegisterSupplyArrival` (roles A/W) crea un lote `stored` en el lugar de
 * almacenamiento + el `StockMovement` `supply_in`, y responde el **lote creado**
 * (`BatchResponse`). El material debe ser `kind=supply`, el lugar `kind=storage`
 * y la unidad coincidir con la del material (I6); esas reglas las aplica el
 * dominio (404/403/422) — los errores salen por `demo/module-kit.toApiError`
 * con el mismo body que habría emitido el `DomainExceptionFilter` del API.
 *
 * Convención del kit (cabecera de `demo/module-kit.ts`): operaciones `async`,
 * context singleton por operación (`ensureDemoContext`, que garantiza el
 * histórico con use cases reales en la primera llamada de la pestaña), token
 * leído **por llamada** de la sesión (`readTokens()?.accessToken ?? ''`, de
 * `lib/session/session-store`) y `try/catch → toApiError`.
 */
export interface SupplyArrivalInput {
  readonly materialId: string;
  readonly quantity: QuantityWire;
  readonly locationId: string;
}

export interface SuppliesApi {
  arrive(input: SupplyArrivalInput): Promise<BatchWire>;
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

export function createSuppliesApi(ctx: DemoContext = getDemoContext()): SuppliesApi {
  return {
    async arrive(input) {
      try {
        const actor = await requireActorForCall(ctx);
        const batch = await ctx.registry.useCases.production.RegisterSupplyArrival.execute(actor, {
          materialId: MaterialId.from(input.materialId),
          quantity: Quantity.create(input.quantity.amount, input.quantity.unit),
          locationId: LocationId.from(input.locationId),
        });
        return batchToWire(batch);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

/** Instancia por defecto que usa la app. */
export const suppliesApi: SuppliesApi = createSuppliesApi();
