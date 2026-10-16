import { describe, expect, it } from 'vitest';

import {
  MaterialId,
  Quantity,
  Recipe,
  RecipeId,
  RecipeIntegrityError,
  RecipeStep,
  RecipeStepId,
} from '../../index';

const SUPPLY_ID = MaterialId.from('supply-1');
const INTERMEDIATE_ID = MaterialId.from('intermediate-1');
const PRODUCT_ID = MaterialId.from('product-1');

function step(position: number, outputProductId = INTERMEDIATE_ID): RecipeStep {
  return RecipeStep.create({
    position,
    machineType: 'mixer',
    inputs: [{ materialId: SUPPLY_ID, quantity: Quantity.create(2, 'kg') }],
    outputProductId,
    outputQuantity: Quantity.create(2, 'kg'),
  });
}

function baseProps(steps: readonly RecipeStep[]) {
  return {
    name: 'Pan',
    outputProductId: PRODUCT_ID,
    outputQuantity: Quantity.create(1, 'kg'),
    steps,
  };
}

describe('RecipeStep', () => {
  it('create genera id y congela los inputs', () => {
    const recipeStep = step(1);
    expect(typeof recipeStep.id).toBe('string');
    expect(recipeStep.inputs).toHaveLength(1);
    expect(Object.isFrozen(recipeStep)).toBe(true);
    expect(Object.isFrozen(recipeStep.inputs)).toBe(true);
    expect(Object.isFrozen(recipeStep.inputs[0])).toBe(true);
  });

  it('fromPersistence conserva el id del paso', () => {
    const id = RecipeStepId.from('step-1');
    const recipeStep = RecipeStep.fromPersistence({
      id,
      position: 1,
      machineType: 'mixer',
      inputs: [],
      outputProductId: PRODUCT_ID,
      outputQuantity: Quantity.create(1, 'kg'),
    });
    expect(recipeStep.id).toBe(id);
  });
});

describe('Recipe', () => {
  it('crea una receta válida y ordena los pasos por position', () => {
    const second = step(2, PRODUCT_ID);
    const first = step(1);
    const recipe = Recipe.create(baseProps([second, first]));
    expect(recipe.steps.map((s) => s.position)).toEqual([1, 2]);
    expect(recipe.steps[1].outputProductId).toBe(PRODUCT_ID);
    expect(Object.isFrozen(recipe)).toBe(true);
    expect(Object.isFrozen(recipe.steps)).toBe(true);
  });

  it('rechaza recetas sin pasos', () => {
    expect(() => Recipe.create(baseProps([]))).toThrow(RecipeIntegrityError);
  });

  it('rechaza posiciones no consecutivas', () => {
    expect(() => Recipe.create(baseProps([step(1), step(3, PRODUCT_ID)]))).toThrow(
      RecipeIntegrityError,
    );
  });

  it('rechaza posiciones que no empiezan en 1', () => {
    expect(() => Recipe.create(baseProps([step(2, PRODUCT_ID)]))).toThrow(RecipeIntegrityError);
  });

  it('rechaza que el output del último paso no coincida con el de la receta (I7)', () => {
    expect(() => Recipe.create(baseProps([step(1, PRODUCT_ID), step(2)]))).toThrow(
      RecipeIntegrityError,
    );
  });

  it('fromPersistence valida la integridad y conserva el id', () => {
    const id = RecipeId.from('recipe-1');
    const recipe = Recipe.fromPersistence({ ...baseProps([step(1, PRODUCT_ID)]), id });
    expect(recipe.id).toBe(id);
  });
});
