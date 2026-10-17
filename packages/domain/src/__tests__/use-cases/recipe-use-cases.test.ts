import { describe, expect, it } from 'vitest';

import {
  type Actor,
  CreateRecipe,
  type CreateRecipeCommand,
  GetRecipe,
  ListRecipes,
  MaterialId,
  NotFoundError,
  Quantity,
  RecipeId,
  RecipeIntegrityError,
  type RecipeStepProps,
  UnauthorizedRoleError,
  UpdateRecipe,
  WorkerId,
} from '../../index.js';
import { inMemoryRepositories } from '../../testing/index.js';

const ADMIN: Actor = { workerId: WorkerId.from('admin-1'), role: 'admin' };
const WORKER: Actor = { workerId: WorkerId.from('worker-1'), role: 'worker' };
const AUDITOR: Actor = { workerId: WorkerId.from('auditor-1'), role: 'auditor' };

const SUPPLY_ID = MaterialId.from('supply-1');
const INTERMEDIATE_ID = MaterialId.from('intermediate-1');
const PRODUCT_ID = MaterialId.from('product-1');

function step(position: number, outputProductId = INTERMEDIATE_ID): RecipeStepProps {
  return {
    position,
    machineType: 'mixer',
    inputs: [{ materialId: SUPPLY_ID, quantity: Quantity.create(2, 'kg') }],
    outputProductId,
    outputQuantity: Quantity.create(2, 'kg'),
  };
}

const VALID_RECIPE: CreateRecipeCommand = {
  name: 'Pan',
  outputProductId: PRODUCT_ID,
  outputQuantity: Quantity.create(1, 'kg'),
  steps: [step(1), step(2, PRODUCT_ID)],
};

function setup() {
  const repos = inMemoryRepositories();
  return {
    repos,
    create: new CreateRecipe({ recipes: repos.recipes }),
    update: new UpdateRecipe({ recipes: repos.recipes }),
    get: new GetRecipe({ recipes: repos.recipes }),
    list: new ListRecipes({ recipes: repos.recipes }),
  };
}

describe('CreateRecipe', () => {
  it('crea una receta válida, ordena los pasos y la persiste', async () => {
    const { create, repos } = setup();

    const recipe = await create.execute(ADMIN, VALID_RECIPE);

    expect(recipe.steps.map((recipeStep) => recipeStep.position)).toEqual([1, 2]);
    await expect(repos.recipes.findById(recipe.id)).resolves.toBe(recipe);
  });

  it('rechaza una receta que rompe I7', async () => {
    const { create } = setup();

    await expect(
      create.execute(ADMIN, {
        ...VALID_RECIPE,
        steps: [step(1), step(2, INTERMEDIATE_ID)],
      }),
    ).rejects.toBeInstanceOf(RecipeIntegrityError);
  });

  it('rechaza posiciones no consecutivas', async () => {
    const { create } = setup();

    await expect(
      create.execute(ADMIN, { ...VALID_RECIPE, steps: [step(1), step(3, PRODUCT_ID)] }),
    ).rejects.toBeInstanceOf(RecipeIntegrityError);
  });

  it('rechaza al rol worker', async () => {
    const { create } = setup();

    await expect(create.execute(WORKER, VALID_RECIPE)).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      role: 'worker',
      useCase: 'CreateRecipe',
    });
  });

  it('rechaza al rol auditor', async () => {
    const { create } = setup();

    await expect(create.execute(AUDITOR, VALID_RECIPE)).rejects.toBeInstanceOf(
      UnauthorizedRoleError,
    );
  });
});

describe('UpdateRecipe', () => {
  it('actualiza el nombre y persiste (copy-on-write)', async () => {
    const { create, update, repos } = setup();
    const recipe = await create.execute(ADMIN, VALID_RECIPE);

    const updated = await update.execute(ADMIN, { id: recipe.id, name: 'Pan integral' });

    expect(updated.name).toBe('Pan integral');
    expect(updated.steps).toEqual(recipe.steps);
    expect(recipe.name).toBe('Pan'); // inmutable
    await expect(repos.recipes.findById(recipe.id)).resolves.toBe(updated);
  });

  it('rechaza una actualización de pasos que rompe I7', async () => {
    const { create, update } = setup();
    const recipe = await create.execute(ADMIN, VALID_RECIPE);

    await expect(
      update.execute(ADMIN, { id: recipe.id, steps: [step(1), step(2, INTERMEDIATE_ID)] }),
    ).rejects.toBeInstanceOf(RecipeIntegrityError);
  });

  it('lanza NotFoundError si la receta no existe', async () => {
    const { update } = setup();

    await expect(
      update.execute(ADMIN, { id: RecipeId.create(), name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza al rol worker', async () => {
    const { create, update } = setup();
    const recipe = await create.execute(ADMIN, VALID_RECIPE);

    await expect(update.execute(WORKER, { id: recipe.id, name: 'X' })).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'UpdateRecipe',
    });
  });

  it('rechaza al rol auditor', async () => {
    const { create, update } = setup();
    const recipe = await create.execute(ADMIN, VALID_RECIPE);

    await expect(update.execute(AUDITOR, { id: recipe.id })).rejects.toBeInstanceOf(
      UnauthorizedRoleError,
    );
  });
});

describe('GetRecipe / ListRecipes (roles A, Au)', () => {
  it('GetRecipe devuelve la receta para admin y auditor', async () => {
    const { create, get } = setup();
    const recipe = await create.execute(ADMIN, VALID_RECIPE);

    await expect(get.execute(ADMIN, { id: recipe.id })).resolves.toBe(recipe);
    await expect(get.execute(AUDITOR, { id: recipe.id })).resolves.toBe(recipe);
  });

  it('GetRecipe lanza NotFoundError si no existe', async () => {
    const { get } = setup();

    await expect(get.execute(ADMIN, { id: RecipeId.create() })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('GetRecipe rechaza al rol worker', async () => {
    const { create, get } = setup();
    const recipe = await create.execute(ADMIN, VALID_RECIPE);

    await expect(get.execute(WORKER, { id: recipe.id })).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'GetRecipe',
    });
  });

  it('ListRecipes filtra por producto de salida y admite al auditor', async () => {
    const { create, list } = setup();
    await create.execute(ADMIN, VALID_RECIPE);

    await expect(list.execute(ADMIN, {})).resolves.toHaveLength(1);
    await expect(
      list.execute(AUDITOR, { filter: { outputProductId: PRODUCT_ID } }),
    ).resolves.toHaveLength(1);
    await expect(
      list.execute(AUDITOR, { filter: { outputProductId: SUPPLY_ID } }),
    ).resolves.toHaveLength(0);
  });

  it('ListRecipes rechaza al rol worker', async () => {
    const { list } = setup();

    await expect(list.execute(WORKER, {})).rejects.toBeInstanceOf(UnauthorizedRoleError);
  });
});
