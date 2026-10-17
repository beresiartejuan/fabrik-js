import { NotFoundError } from '../errors/index.js';
import { Recipe, RecipeStep, type RecipeStepProps } from '../entities/recipe.js';
import type { RecipeFilter, RecipeRepository } from '../ports/recipe-repository.js';
import type { MaterialId, RecipeId } from '../value-objects/ids.js';
import type { Quantity } from '../value-objects/quantity.js';

import { CATALOG_READ_ROLES, CATALOG_WRITE_ROLES, requireRole, type Actor } from './actor.js';

// --- Dependencias ---

/** Las recetas no tienen eventos en docs/05: solo repositorio. */
export interface RecipeWriteDeps {
  readonly recipes: RecipeRepository;
}

export interface RecipeReadDeps {
  readonly recipes: RecipeRepository;
}

// --- Comandos ---

export interface CreateRecipeCommand {
  readonly name: string;
  readonly outputProductId: MaterialId;
  readonly outputQuantity: Quantity;
  readonly steps: readonly RecipeStepProps[];
}

export interface UpdateRecipeCommand {
  readonly id: RecipeId;
  readonly name?: string;
  readonly outputProductId?: MaterialId;
  readonly outputQuantity?: Quantity;
  readonly steps?: readonly RecipeStepProps[];
}

export interface GetRecipeCommand {
  readonly id: RecipeId;
}

export interface ListRecipesCommand {
  readonly filter?: RecipeFilter;
}

/**
 * `CreateRecipe` (rol A): construye los pasos ordenados y delega la validación de
 * posiciones consecutivas e I7 en la fábrica `Recipe`.
 */
export class CreateRecipe {
  constructor(private readonly deps: RecipeWriteDeps) {}

  async execute(actor: Actor, command: CreateRecipeCommand): Promise<Recipe> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'CreateRecipe');
    const steps = command.steps.map((step) => RecipeStep.create(step));
    const recipe = Recipe.create({
      name: command.name,
      outputProductId: command.outputProductId,
      outputQuantity: command.outputQuantity,
      steps,
    });
    await this.deps.recipes.save(recipe);
    return recipe;
  }
}

/**
 * `UpdateRecipe` (rol A): actualiza nombre, output y/o pasos. Reconstruye la
 * receta con `fromPersistence`, que vuelve a validar posiciones e I7.
 */
export class UpdateRecipe {
  constructor(private readonly deps: RecipeWriteDeps) {}

  async execute(actor: Actor, command: UpdateRecipeCommand): Promise<Recipe> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'UpdateRecipe');
    const current = await this.deps.recipes.findById(command.id);
    if (!current) {
      throw new NotFoundError('Recipe', command.id);
    }
    const steps = command.steps
      ? command.steps.map((step) => RecipeStep.create(step))
      : current.steps;
    const updated = Recipe.fromPersistence({
      id: current.id,
      name: command.name ?? current.name,
      outputProductId: command.outputProductId ?? current.outputProductId,
      outputQuantity: command.outputQuantity ?? current.outputQuantity,
      steps,
    });
    await this.deps.recipes.save(updated);
    return updated;
  }
}

/** `GetRecipe` (roles A, Au): devuelve la receta o lanza `NotFoundError`. */
export class GetRecipe {
  constructor(private readonly deps: RecipeReadDeps) {}

  async execute(actor: Actor, command: GetRecipeCommand): Promise<Recipe> {
    requireRole(actor, CATALOG_READ_ROLES, 'GetRecipe');
    const recipe = await this.deps.recipes.findById(command.id);
    if (!recipe) {
      throw new NotFoundError('Recipe', command.id);
    }
    return recipe;
  }
}

/** `ListRecipes` (roles A, Au): listado con filtro opcional por producto. */
export class ListRecipes {
  constructor(private readonly deps: RecipeReadDeps) {}

  async execute(actor: Actor, command: ListRecipesCommand): Promise<readonly Recipe[]> {
    requireRole(actor, CATALOG_READ_ROLES, 'ListRecipes');
    return this.deps.recipes.list(command.filter);
  }
}
