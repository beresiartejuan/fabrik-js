import type { Actor, MachineType } from '@fabrik/domain';
import { MaterialId, RecipeId, type RecipeStepProps } from '@fabrik/domain';

import { readTokens } from '@/lib/session/session-store';
import { materialQuantityFromWire, quantityFromWire, recipeToWire } from '../demo/mappers';
import {
  type DemoContext,
  ensureDemoContext,
  getDemoContext,
  toApiError,
} from '../demo/module-kit';
import type { MaterialQuantityWire, QuantityWire, RecipeWire } from '../types';

/**
 * Endpoints de recetas (`apps/api/src/recipes/recipes.controller.ts`) sobre el
 * **runtime demo** (docs/11-plan-demo.md §4): los cuatro casos de uso que
 * inyecta el controlador real (`CreateRecipe`, `UpdateRecipe`, `GetRecipe`,
 * `ListRecipes`), ejecutados con el actor de la sesión.
 *
 * - `list` (A/Au): filtro `outputProductId`; **worker → 403** (gate del
 *   dominio).
 * - `get` — id desconocido → `NotFoundError` → 404.
 * - `create`/`update` — admin. La traducción wire → dominio replica
 *   `RecipesController.toStepProps`: `MaterialId.from` + `Quantity.create`
 *   (los pasos no llevan `id` en la entrada — `RecipeStep.create` lo genera),
 *   y las invariants del agregado (`Recipe`) quedan a cargo del caso de uso:
 *   posiciones consecutivas 1..N, I7 (output del último paso = output de la
 *   receta) y `amount > 0` → `RecipeIntegrityError`/`InvalidQuantityError`
 *   → 422.
 * - `update`: si el body incluye `steps`, **reemplaza la lista completa** (no
 *   es un merge por posición), igual que el `PATCH` real.
 */

export interface RecipeStepInput {
  readonly position: number;
  readonly machineType: MachineType;
  readonly inputs: readonly MaterialQuantityWire[];
  readonly outputProductId: string;
  readonly outputQuantity: QuantityWire;
}

export interface CreateRecipeInput {
  readonly name: string;
  readonly outputProductId: string;
  readonly outputQuantity: QuantityWire;
  readonly steps: readonly RecipeStepInput[];
}

/** `PATCH /recipes/:id` (todos los campos son opcionales; `steps` reemplaza). */
export interface UpdateRecipeInput {
  readonly name?: string;
  readonly outputProductId?: string;
  readonly outputQuantity?: QuantityWire;
  readonly steps?: readonly RecipeStepInput[];
}

export interface ListRecipesParams {
  readonly outputProductId?: string;
}

export interface RecipesApi {
  list(params?: ListRecipesParams): Promise<RecipeWire[]>;
  get(id: string): Promise<RecipeWire>;
  create(input: CreateRecipeInput): Promise<RecipeWire>;
  update(id: string, input: UpdateRecipeInput): Promise<RecipeWire>;
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

/** `RecipeStepDto` → `RecipeStepProps` (espejo de `RecipesController.toStepProps`). */
function toStepProps(step: RecipeStepInput): RecipeStepProps {
  return {
    position: step.position,
    machineType: step.machineType,
    inputs: step.inputs.map(materialQuantityFromWire),
    outputProductId: MaterialId.from(step.outputProductId),
    outputQuantity: quantityFromWire(step.outputQuantity),
  };
}

export function createRecipesApi(ctx: DemoContext = getDemoContext()): RecipesApi {
  return {
    async list(params) {
      try {
        const actor = await requireActorForCall(ctx);
        const recipes = await ctx.registry.useCases.recipes.ListRecipes.execute(actor, {
          filter: {
            ...(params?.outputProductId !== undefined
              ? { outputProductId: MaterialId.from(params.outputProductId) }
              : {}),
          },
        });
        return recipes.map(recipeToWire);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async get(id) {
      try {
        const actor = await requireActorForCall(ctx);
        const recipe = await ctx.registry.useCases.recipes.GetRecipe.execute(actor, {
          id: RecipeId.from(id),
        });
        return recipeToWire(recipe);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async create(input) {
      try {
        const actor = await requireActorForCall(ctx);
        const recipe = await ctx.registry.useCases.recipes.CreateRecipe.execute(actor, {
          name: input.name,
          outputProductId: MaterialId.from(input.outputProductId),
          outputQuantity: quantityFromWire(input.outputQuantity),
          steps: input.steps.map(toStepProps),
        });
        return recipeToWire(recipe);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async update(id, input) {
      try {
        const actor = await requireActorForCall(ctx);
        const recipe = await ctx.registry.useCases.recipes.UpdateRecipe.execute(actor, {
          id: RecipeId.from(id),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.outputProductId !== undefined
            ? { outputProductId: MaterialId.from(input.outputProductId) }
            : {}),
          ...(input.outputQuantity !== undefined
            ? { outputQuantity: quantityFromWire(input.outputQuantity) }
            : {}),
          ...(input.steps !== undefined ? { steps: input.steps.map(toStepProps) } : {}),
        });
        return recipeToWire(recipe);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

/** Instancia por defecto que usa la app. */
export const recipesApi: RecipesApi = createRecipesApi();
