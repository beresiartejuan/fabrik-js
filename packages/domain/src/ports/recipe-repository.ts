import type { Recipe } from '../entities/recipe.js';
import type { MaterialId, RecipeId } from '../value-objects/ids.js';

// Filtro explícito y pequeño para `list`.
export interface RecipeFilter {
  readonly outputProductId?: MaterialId;
}

/**
 * Persistencia del catálogo de recetas (docs/04, `CreateRecipe`/`UpdateRecipe`).
 * `save` es upsert por `id`; `findById` devuelve `null` si no existe.
 */
export interface RecipeRepository {
  findById(id: RecipeId): Promise<Recipe | null>;
  list(filter?: RecipeFilter): Promise<readonly Recipe[]>;
  save(recipe: Recipe): Promise<void>;
}
