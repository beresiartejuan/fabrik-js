import type { Recipe, RecipeStep } from '@fabrik/domain';
import { z } from 'zod';

import { idSchema, quantitySchema } from '../common/catalog-schemas.js';
import { type QuantityResponse, serializeQuantity } from '../common/entity-serializers.js';

/** DTOs del recurso `recipes` (Fase 4). */

/** Material + cantidad de un paso: `{ materialId, quantity }`. */
export const MaterialQuantitySchema = z.object({
  materialId: idSchema,
  quantity: quantitySchema,
});
export type MaterialQuantityDto = z.infer<typeof MaterialQuantitySchema>;

/**
 * Paso de receta. La forma se valida aquí; la integridad del conjunto (posiciones
 * consecutivas 1..N e I7: el output del último paso coincide con el de la receta)
 * la valida `Recipe`, que lanza `RecipeIntegrityError` → 422. Por eso `steps` no
 * lleva `.min(1)`: una lista vacía debe dar el 422 del dominio, no un 400 de zod.
 */
export const RecipeStepSchema = z.object({
  position: z.number().int().positive(),
  machineType: z.string().trim().min(1),
  inputs: z.array(MaterialQuantitySchema),
  outputProductId: idSchema,
  outputQuantity: quantitySchema,
});
export type RecipeStepDto = z.infer<typeof RecipeStepSchema>;

/** `POST /recipes`. */
export const CreateRecipeSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio'),
  outputProductId: idSchema,
  outputQuantity: quantitySchema,
  steps: z.array(RecipeStepSchema),
});
export type CreateRecipeDto = z.infer<typeof CreateRecipeSchema>;

/**
 * `PATCH /recipes/:id`. Si se envía `steps`, **reemplaza la lista completa** (no
 * es un merge por posición); el resto de campos son parciales. Se eligió `PATCH`
 * (no `PUT`) por coherencia con el resto de catálogos, documentando esa semántica.
 */
export const UpdateRecipeSchema = z.object({
  name: z.string().trim().min(1).optional(),
  outputProductId: idSchema.optional(),
  outputQuantity: quantitySchema.optional(),
  steps: z.array(RecipeStepSchema).optional(),
});
export type UpdateRecipeDto = z.infer<typeof UpdateRecipeSchema>;

/** `GET /recipes` (filtro de `RecipeFilter`). */
export const ListRecipesQuerySchema = z.object({
  outputProductId: idSchema.optional(),
});
export type ListRecipesQuery = z.infer<typeof ListRecipesQuerySchema>;

export interface RecipeStepResponse {
  readonly id: string;
  readonly position: number;
  readonly machineType: string;
  readonly inputs: { materialId: string; quantity: QuantityResponse }[];
  readonly outputProductId: string;
  readonly outputQuantity: QuantityResponse;
}

export interface RecipeResponse {
  readonly id: string;
  readonly name: string;
  readonly outputProductId: string;
  readonly outputQuantity: QuantityResponse;
  readonly steps: RecipeStepResponse[];
}

export function serializeRecipeStep(step: RecipeStep): RecipeStepResponse {
  return {
    id: step.id,
    position: step.position,
    machineType: step.machineType,
    inputs: step.inputs.map((input) => ({
      materialId: input.materialId,
      quantity: serializeQuantity(input.quantity),
    })),
    outputProductId: step.outputProductId,
    outputQuantity: serializeQuantity(step.outputQuantity),
  };
}

export function serializeRecipe(recipe: Recipe): RecipeResponse {
  return {
    id: recipe.id,
    name: recipe.name,
    outputProductId: recipe.outputProductId,
    outputQuantity: serializeQuantity(recipe.outputQuantity),
    steps: recipe.steps.map(serializeRecipeStep),
  };
}
