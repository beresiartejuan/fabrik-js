import { eq, inArray } from 'drizzle-orm';

import type { Recipe, RecipeFilter, RecipeId, RecipeRepository } from '@fabrik/domain';

import type { Executor } from '../executor.js';
import {
  recipeStepInputsToRows,
  recipeStepToRow,
  recipeToRow,
  rowToRecipe,
} from '../mappers.js';
import { recipeStepInputs, recipeSteps, recipes, type RecipeRow, type RecipeStepRow } from '../schema.js';

/** Adaptador Drizzle de `RecipeRepository` (`save` = upsert del agregado). */
export class DrizzleRecipeRepository implements RecipeRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: RecipeId): Promise<Recipe | null> {
    const rows = await this.db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
    if (rows.length === 0) {
      return null;
    }
    const hydrated = await this.hydrate(rows);
    return hydrated[0] ?? null;
  }

  async list(filter?: RecipeFilter): Promise<readonly Recipe[]> {
    const rows = await this.db
      .select()
      .from(recipes)
      .where(filter?.outputProductId !== undefined ? eq(recipes.outputProductId, filter.outputProductId) : undefined);
    return this.hydrate(rows);
  }

  async save(recipe: Recipe): Promise<void> {
    const row = recipeToRow(recipe);
    await this.db
      .insert(recipes)
      .values(row)
      .onConflictDoUpdate({ target: recipes.id, set: row });

    // Reemplazo del grafo de hijos: se borran pasos + inputs y se reinsertan.
    const existingSteps = await this.db
      .select({ id: recipeSteps.id })
      .from(recipeSteps)
      .where(eq(recipeSteps.recipeId, recipe.id));
    if (existingSteps.length > 0) {
      await this.db.delete(recipeStepInputs).where(
        inArray(
          recipeStepInputs.recipeStepId,
          existingSteps.map((step) => step.id),
        ),
      );
    }
    await this.db.delete(recipeSteps).where(eq(recipeSteps.recipeId, recipe.id));

    const stepRows = recipe.steps.map((step) => recipeStepToRow(recipe.id, step));
    if (stepRows.length > 0) {
      await this.db.insert(recipeSteps).values(stepRows);
    }
    const inputRows = recipe.steps.flatMap((step) => recipeStepInputsToRows(step));
    if (inputRows.length > 0) {
      await this.db.insert(recipeStepInputs).values(inputRows);
    }
  }

  private async hydrate(rows: readonly RecipeRow[]): Promise<Recipe[]> {
    if (rows.length === 0) {
      return [];
    }
    const recipeIds = rows.map((row) => row.id);
    const stepRows = await this.db
      .select()
      .from(recipeSteps)
      .where(inArray(recipeSteps.recipeId, recipeIds));
    const stepIds = stepRows.map((step) => step.id);
    const inputRows =
      stepIds.length > 0
        ? await this.db.select().from(recipeStepInputs).where(inArray(recipeStepInputs.recipeStepId, stepIds))
        : [];

    const inputsByStep = groupBy(inputRows, (input) => input.recipeStepId);
    const stepsByRecipe = groupBy(stepRows, (step) => step.recipeId);

    return rows.map((row) =>
      rowToRecipe(
        row,
        (stepsByRecipe.get(row.id) ?? []).map((step: RecipeStepRow) => ({
          step,
          inputs: inputsByStep.get(step.id) ?? [],
        })),
      ),
    );
  }
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) {
      bucket.push(item);
    } else {
      map.set(k, [item]);
    }
  }
  return map;
}
