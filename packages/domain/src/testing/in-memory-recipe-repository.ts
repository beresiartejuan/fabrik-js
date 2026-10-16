import type { Recipe } from '../entities';
import type { RecipeFilter, RecipeRepository } from '../ports';
import type { RecipeId } from '../value-objects';

import { InMemoryStore } from './in-memory-store';

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
