import { Recipe, RecipeStep } from '@fabrik/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aMaterial, aProduct, aRecipe, quantity } from './fixtures.js';
import { createTestDatabase, type TestDatabase } from './test-db.js';

describe('DrizzleRecipeRepository', () => {
  let ctx: TestDatabase;

  beforeEach(async () => {
    ctx = await createTestDatabase();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('findById devuelve null cuando no existe', async () => {
    const product = aProduct();
    await expect(ctx.repositories.recipes.findById(aRecipe(product.id).id)).resolves.toBeNull();
  });

  it('save + findById hacen round-trip de pasos e inputs', async () => {
    const harina = aMaterial({ name: 'Harina' });
    const azucar = aMaterial({ name: 'Azúcar' });
    const product = aProduct();

    const step1 = RecipeStep.create({
      position: 1,
      machineType: 'mixer',
      inputs: [{ materialId: harina.id, quantity: quantity(2, 'kg') }],
      outputProductId: product.id,
      outputQuantity: quantity(3, 'kg'),
    });
    const step2 = RecipeStep.create({
      position: 2,
      machineType: 'oven',
      inputs: [
        { materialId: azucar.id, quantity: quantity(1, 'kg') },
        { materialId: harina.id, quantity: quantity(1, 'kg') },
      ],
      outputProductId: product.id,
      outputQuantity: quantity(2, 'unit'),
    });
    const recipe = Recipe.create({
      name: 'Pan',
      outputProductId: product.id,
      outputQuantity: quantity(2, 'unit'),
      steps: [step1, step2],
    });
    await ctx.repositories.recipes.save(recipe);

    const found = await ctx.repositories.recipes.findById(recipe.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Pan');
    expect(found?.outputQuantity).toMatchObject({ amount: 2, unit: 'unit' });
    expect(found?.steps.map((s) => s.position)).toEqual([1, 2]);
    expect(found?.steps.map((s) => s.machineType)).toEqual(['mixer', 'oven']);
    expect(found?.steps[0]?.inputs[0]).toMatchObject({
      materialId: harina.id,
      quantity: { amount: 2, unit: 'kg' },
    });
    expect(found?.steps[1]?.inputs.map((i) => i.materialId)).toEqual([azucar.id, harina.id]);
  });

  it('save es upsert y reemplaza el grafo de pasos/inputs', async () => {
    const m1 = aMaterial({ name: 'Harina' });
    const m2 = aMaterial({ name: 'Azúcar' });
    const product = aProduct();
    const recipe = aRecipe(product.id);
    await ctx.repositories.recipes.save(recipe);

    const newStep = RecipeStep.create({
      position: 1,
      machineType: 'oven',
      inputs: [{ materialId: m2.id, quantity: quantity(5, 'kg') }],
      outputProductId: product.id,
      outputQuantity: quantity(1, 'unit'),
    });
    await ctx.repositories.recipes.save(
      Recipe.fromPersistence({
        id: recipe.id,
        name: 'Pan v2',
        outputProductId: product.id,
        outputQuantity: quantity(1, 'unit'),
        steps: [newStep],
      }),
    );

    expect(await ctx.repositories.recipes.list()).toHaveLength(1);
    const found = await ctx.repositories.recipes.findById(recipe.id);
    expect(found?.name).toBe('Pan v2');
    expect(found?.steps).toHaveLength(1);
    expect(found?.steps[0]?.machineType).toBe('oven');
    expect(found?.steps[0]?.inputs).toHaveLength(1);
    expect(found?.steps[0]?.inputs[0]?.materialId).toBe(m2.id);
    void m1;
  });

  it('list filtra por outputProductId', async () => {
    const pan = aProduct('Pan');
    const bizcocho = aProduct('Bizcocho');
    const recipePan = aRecipe(pan.id, undefined, { name: 'Receta pan' });
    const recipeBizcocho = aRecipe(bizcocho.id, undefined, { name: 'Receta bizcocho' });
    await ctx.repositories.recipes.save(recipePan);
    await ctx.repositories.recipes.save(recipeBizcocho);

    expect(await ctx.repositories.recipes.list()).toHaveLength(2);
    expect((await ctx.repositories.recipes.list({ outputProductId: pan.id })).map((r) => r.id)).toEqual([
      recipePan.id,
    ]);
  });
});
