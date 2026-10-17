import type { Recipe } from '../entities/index.js';
import type { RecipeFilter, RecipeRepository } from '../ports/index.js';
import type { RecipeId } from '../value-objects/index.js';

import { InMemoryStore } from './in-memory-store.js';

function matches(recipe: Recipe, filter?: RecipeFilter): boolean {
  if (filter?.outputProductId !== undefined && recipe.outputProductId !== filter.outputProductId) {
    return false;
  }
  return true;
}

/** Fake en memoria de `RecipeRepository` para tests (save = upsert). */
export class InMemoryRecipeRepository implements RecipeRepository {
  private readonly store = new InMemoryStore<RecipeId, Recipe>();

  async findById(id: RecipeId): Promise<Recipe | null> {
    return this.store.get(id);
  }

  async list(filter?: RecipeFilter): Promise<readonly Recipe[]> {
    return this.store.all().filter((recipe) => matches(recipe, filter));
  }

  async save(recipe: Recipe): Promise<void> {
    this.store.upsert(recipe);
  }

  /** Vacía el almacén (solo tests). */
  clear(): void {
    this.store.clear();
  }
}
