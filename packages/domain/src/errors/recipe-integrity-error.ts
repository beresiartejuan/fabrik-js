import type { RecipeId } from '../value-objects/ids';

import { DomainError } from './domain-error';

// Invariante I7: el output de la receta debe coincidir con el output de su último paso.
export class RecipeIntegrityError extends DomainError {
  readonly recipeId: RecipeId;
  readonly reason: string;

  constructor(recipeId: RecipeId, reason: string) {
    super(`Receta ${recipeId} inconsistente: ${reason}`);
    this.name = 'RecipeIntegrityError';
    this.recipeId = recipeId;
    this.reason = reason;
  }
}
