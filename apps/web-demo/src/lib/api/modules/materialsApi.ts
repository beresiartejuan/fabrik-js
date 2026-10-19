import type { Actor, MaterialKind, PhysicalState, UnitOfMeasure } from '@fabrik/domain';
import { MaterialId } from '@fabrik/domain';

import { readTokens } from '@/lib/session/session-store';
import { materialToWire } from '../demo/mappers';
import {
  type DemoContext,
  ensureDemoContext,
  getDemoContext,
  toApiError,
} from '../demo/module-kit';
import type { MaterialWire } from '../types';

/**
 * Endpoints de materiales (`apps/api/src/materials/materials.controller.ts`)
 * sobre el **runtime demo** (docs/demo.md §4): los mismos cinco casos
 * de uso que inyecta el controlador real (`CreateMaterial`, `UpdateMaterial`,
 * `DeactivateMaterial`, `GetMaterial`, `ListMaterials`), ejecutados contra la
 * base de `sessionStorage` y convertidos a wire con los mappers de `demo/`.
 *
 * - `list` (A/Au): filtro `kind`/`physicalState`; **worker → 403** (el gate es
 *   `requireRole` dentro del caso de uso, mismos roles que el `ActorGuard`).
 * - `get` — A/Au; id desconocido → `NotFoundError` → 404.
 * - `create`/`update`/`deactivate` — admin. `update` no acepta `kind` ni
 *   `physicalState` (el dominio no los permite cambiar) y una `description: ''`
 *   explícita deja la descripción vacía (`''` no es nullish: no cae al valor
 *   previo; la entidad revalida I6 al reconstituir).
 * - `deactivate` — baja lógica idempotente (`active: false`), sin 404 si ya
 *   estaba de baja (el caso de uso no vuelve a publicar el evento).
 *
 * El actor se resuelve **en cada llamada** del access token de la sesión
 * (`readTokens()`, de `lib/session/session-store`)
 * con **rol fresco** (`requireActor`), y todo el cuerpo va en un `try/catch`
 * que traduce a `ApiError` (`toApiError`, espejo del `DomainExceptionFilter`).
 */

export interface ListMaterialsParams {
  readonly kind?: MaterialKind;
  readonly physicalState?: PhysicalState;
}

export interface CreateMaterialInput {
  readonly name: string;
  readonly description?: string;
  readonly kind: MaterialKind;
  readonly physicalState: PhysicalState;
  readonly unitOfMeasure: UnitOfMeasure;
}

export interface UpdateMaterialInput {
  readonly name?: string;
  readonly description?: string;
  readonly unitOfMeasure?: UnitOfMeasure;
}

export interface MaterialsApi {
  list(params?: ListMaterialsParams): Promise<MaterialWire[]>;
  get(id: string): Promise<MaterialWire>;
  create(input: CreateMaterialInput): Promise<MaterialWire>;
  update(id: string, input: UpdateMaterialInput): Promise<MaterialWire>;
  deactivate(id: string): Promise<MaterialWire>;
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

export function createMaterialsApi(ctx: DemoContext = getDemoContext()): MaterialsApi {
  return {
    async list(params) {
      try {
        const actor = await requireActorForCall(ctx);
        const materials = await ctx.registry.useCases.materials.ListMaterials.execute(actor, {
          filter: {
            ...(params?.kind !== undefined ? { kind: params.kind } : {}),
            ...(params?.physicalState !== undefined ? { physicalState: params.physicalState } : {}),
          },
        });
        return materials.map(materialToWire);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async get(id) {
      try {
        const actor = await requireActorForCall(ctx);
        const material = await ctx.registry.useCases.materials.GetMaterial.execute(actor, {
          id: MaterialId.from(id),
        });
        return materialToWire(material);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async create(input) {
      try {
        const actor = await requireActorForCall(ctx);
        const material = await ctx.registry.useCases.materials.CreateMaterial.execute(actor, input);
        return materialToWire(material);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async update(id, input) {
      try {
        const actor = await requireActorForCall(ctx);
        const material = await ctx.registry.useCases.materials.UpdateMaterial.execute(actor, {
          id: MaterialId.from(id),
          ...input,
        });
        return materialToWire(material);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async deactivate(id) {
      try {
        const actor = await requireActorForCall(ctx);
        const material = await ctx.registry.useCases.materials.DeactivateMaterial.execute(actor, {
          id: MaterialId.from(id),
        });
        return materialToWire(material);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

/** Instancia por defecto que usa la app. */
export const materialsApi: MaterialsApi = createMaterialsApi();
