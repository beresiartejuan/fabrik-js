import type { Actor, LocationKind } from '@fabrik/domain';
import { LocationId } from '@fabrik/domain';

import { readTokens } from '@/lib/session/session-store';
import { locationToWire } from '../demo/mappers';
import {
  type DemoContext,
  ensureDemoContext,
  getDemoContext,
  toApiError,
} from '../demo/module-kit';
import type { LocationWire } from '../types';

/**
 * Endpoints de lugares (`apps/api/src/locations/locations.controller.ts`) sobre
 * el **runtime demo** (docs/11-plan-demo.md §4): los cuatro casos de uso que
 * inyecta el controlador real (`CreateLocation`, `UpdateLocation`,
 * `GetLocation`, `ListLocations`), ejecutados con el actor de la sesión.
 *
 * - `list` (A/Au): filtro opcional `kind`; **worker → 403** (gate del dominio).
 * - `get` — id desconocido → `NotFoundError` → 404.
 * - `create`/`update` — admin. **`update` solo renombra**: el wire de entrada
 *   no expone `kind` (cambiarlo podría violar I2 y el caso de uso no lo
 *   acepta), igual que `UpdateLocationSchema` en la API.
 * - No hay baja: los lugares no tienen baja lógica en el dominio (contrato
 *   intacto con el módulo axios).
 */

export interface ListLocationsParams {
  readonly kind?: LocationKind;
}

export interface CreateLocationInput {
  readonly name: string;
  readonly kind: LocationKind;
}

export interface UpdateLocationInput {
  readonly name?: string;
}

export interface LocationsApi {
  list(params?: ListLocationsParams): Promise<LocationWire[]>;
  get(id: string): Promise<LocationWire>;
  create(input: CreateLocationInput): Promise<LocationWire>;
  update(id: string, input: UpdateLocationInput): Promise<LocationWire>;
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

export function createLocationsApi(ctx: DemoContext = getDemoContext()): LocationsApi {
  return {
    async list(params) {
      try {
        const actor = await requireActorForCall(ctx);
        const locations = await ctx.registry.useCases.locations.ListLocations.execute(actor, {
          filter: {
            ...(params?.kind !== undefined ? { kind: params.kind } : {}),
          },
        });
        return locations.map(locationToWire);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async get(id) {
      try {
        const actor = await requireActorForCall(ctx);
        const location = await ctx.registry.useCases.locations.GetLocation.execute(actor, {
          id: LocationId.from(id),
        });
        return locationToWire(location);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async create(input) {
      try {
        const actor = await requireActorForCall(ctx);
        const location = await ctx.registry.useCases.locations.CreateLocation.execute(actor, input);
        return locationToWire(location);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async update(id, input) {
      try {
        const actor = await requireActorForCall(ctx);
        const location = await ctx.registry.useCases.locations.UpdateLocation.execute(actor, {
          id: LocationId.from(id),
          ...input,
        });
        return locationToWire(location);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

/** Instancia por defecto que usa la app. */
export const locationsApi: LocationsApi = createLocationsApi();
