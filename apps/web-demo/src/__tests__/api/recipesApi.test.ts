import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ACCESS_TOKEN_PREFIX, DEMO_REFRESH_TOKEN_PREFIX } from '@/lib/api/demo/auth';
import { resetDb } from '@/lib/api/demo/db';
import { DEMO_SEED_IDS } from '@/lib/api/demo/seed';
import { ApiError } from '@/lib/api/errors';
import { createRecipesApi } from '@/lib/api/modules/recipesApi';
import { writeTokens } from '@/lib/session/session-store';

/**
 * Recetas sobre el **runtime demo** (docs/demo.md §4): los mismos
 * casos de uso que inyecta `RecipesController`, con la traducción wire →
 * dominio de `toStepProps` (ids de material + `Quantity.create`) y las
 * invariants del agregado `Recipe` intactas (posiciones 1..N, I7, `steps`
 * reemplaza la lista completa en update).
 *
 * - Formas de wire EXACTAS (espejo de `serializeRecipe`): pasos con `id`
 *   generado por el dominio, ordenados por posición.
 * - `RecipeIntegrityError`/`InvalidQuantityError` → 422, `NotFoundError` → 404
 *   y gates de rol con la `ApiError` final (worker no lee ni escribe: 403).
 */

function sessionTokens(userId: string): { accessToken: string; refreshToken: string } {
  return {
    accessToken: `${DEMO_ACCESS_TOKEN_PREFIX}${userId}`,
    refreshToken: `${DEMO_REFRESH_TOKEN_PREFIX}${userId}`,
  };
}

const TOKENS = {
  admin: sessionTokens(DEMO_SEED_IDS.admin),
  operario: sessionTokens(DEMO_SEED_IDS.operario),
  auditor: sessionTokens(DEMO_SEED_IDS.auditor),
};

/** Extrae el rechazo y lo normaliza a la `ApiError` final del kit. */
async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  const cause = await promise.catch((reason: unknown) => reason);
  expect(cause).toBeInstanceOf(ApiError);
  if (!(cause instanceof ApiError)) {
    throw new Error('el fallo debía ser ApiError');
  }
  return cause;
}

/** Receta de un paso sobre los materiales sembrados (harina + agua → masa). */
const SINGLE_STEP = {
  position: 1,
  machineType: 'mixer',
  inputs: [
    { materialId: DEMO_SEED_IDS.harina, quantity: { amount: 2, unit: 'kg' as const } },
    { materialId: DEMO_SEED_IDS.agua, quantity: { amount: 1, unit: 'l' as const } },
  ],
  outputProductId: DEMO_SEED_IDS.masa,
  outputQuantity: { amount: 2, unit: 'kg' as const },
};

beforeEach(() => {
  window.sessionStorage.clear();
  resetDb();
});

describe('recipesApi (demo) — lecturas', () => {
  it('list devuelve el wire de la receta sembrada (pasos ordenados por posición)', async () => {
    writeTokens(TOKENS.admin);
    const recipes = await createRecipesApi().list({ outputProductId: DEMO_SEED_IDS.pan });

    expect(recipes).toStrictEqual([
      {
        id: DEMO_SEED_IDS.panArtesanal,
        name: 'Pan artesanal',
        outputProductId: DEMO_SEED_IDS.pan,
        outputQuantity: { amount: 1, unit: 'unit' },
        steps: [
          {
            id: DEMO_SEED_IDS.paso1,
            position: 1,
            machineType: 'mixer',
            inputs: [
              { materialId: DEMO_SEED_IDS.harina, quantity: { amount: 2, unit: 'kg' } },
              { materialId: DEMO_SEED_IDS.agua, quantity: { amount: 1, unit: 'l' } },
            ],
            outputProductId: DEMO_SEED_IDS.masa,
            outputQuantity: { amount: 2, unit: 'kg' },
          },
          {
            id: DEMO_SEED_IDS.paso2,
            position: 2,
            machineType: 'mixer',
            inputs: [{ materialId: DEMO_SEED_IDS.masa, quantity: { amount: 2, unit: 'kg' } }],
            outputProductId: DEMO_SEED_IDS.pan,
            outputQuantity: { amount: 1, unit: 'unit' },
          },
        ],
      },
    ]);
  });

  it('list sin filtro devuelve todo; filtro por producto desconocido → vacía', async () => {
    writeTokens(TOKENS.admin);
    const api = createRecipesApi();

    expect((await api.list()).map((recipe) => recipe.id)).toStrictEqual([
      DEMO_SEED_IDS.panArtesanal,
    ]);
    expect(await api.list({ outputProductId: 'mat-no' })).toStrictEqual([]);
  });

  it('get exacto y 404 con el contexto del filter para id desconocido', async () => {
    writeTokens(TOKENS.admin);
    const api = createRecipesApi();

    const recipe = await api.get(DEMO_SEED_IDS.panArtesanal);
    expect(recipe.id).toBe(DEMO_SEED_IDS.panArtesanal);
    expect(recipe.steps).toHaveLength(2);

    const failure = await expectApiError(api.get('rec-no'));
    expect(failure.statusCode).toBe(404);
    expect(failure.error).toBe('NotFoundError');
    expect(failure.context).toStrictEqual({ entity: 'Recipe', id: 'rec-no' });
  });

  it('gates de rol: worker no lee (403), auditor lee (A/Au)', async () => {
    writeTokens(TOKENS.operario);
    const listFailure = await expectApiError(createRecipesApi().list());
    expect(listFailure.statusCode).toBe(403);
    expect(listFailure.context).toStrictEqual({ role: 'worker', useCase: 'ListRecipes' });

    writeTokens(TOKENS.auditor);
    await expect(createRecipesApi().list()).resolves.toHaveLength(1);
    const createFailure = await expectApiError(
      createRecipesApi().create({
        name: 'X',
        outputProductId: DEMO_SEED_IDS.pan,
        outputQuantity: { amount: 1, unit: 'unit' },
        steps: [SINGLE_STEP],
      }),
    );
    expect(createFailure.statusCode).toBe(403);
    expect(createFailure.context).toStrictEqual({ role: 'auditor', useCase: 'CreateRecipe' });
  });
});

describe('recipesApi (demo) — create (invariants del agregado)', () => {
  it('create devuelve el wire con paso e ids generados por el dominio', async () => {
    writeTokens(TOKENS.admin);
    const api = createRecipesApi();

    const created = await api.create({
      name: 'Masa rápida',
      outputProductId: DEMO_SEED_IDS.masa,
      outputQuantity: { amount: 2, unit: 'kg' },
      steps: [{ ...SINGLE_STEP, position: 2, machineType: 'oven' }, SINGLE_STEP],
    });

    expect(created).toStrictEqual({
      id: expect.any(String),
      name: 'Masa rápida',
      outputProductId: DEMO_SEED_IDS.masa,
      outputQuantity: { amount: 2, unit: 'kg' },
      // El agregado ordena los pasos por posición (la entrada venía al revés).
      steps: [
        { ...SINGLE_STEP, id: expect.any(String) },
        { ...SINGLE_STEP, id: expect.any(String), position: 2, machineType: 'oven' },
      ],
    });
    // Persistencia real (visible por otra lectura).
    expect((await api.list()).map((recipe) => recipe.id)).toContain(created.id);
  });

  it('posiciones no consecutivas → 422 RecipeIntegrityError (razón del agregado)', async () => {
    writeTokens(TOKENS.admin);
    const failure = await expectApiError(
      createRecipesApi().create({
        name: 'Saltos',
        outputProductId: DEMO_SEED_IDS.masa,
        outputQuantity: { amount: 2, unit: 'kg' },
        steps: [{ ...SINGLE_STEP, position: 3 }],
      }),
    );

    expect(failure.statusCode).toBe(422);
    expect(failure.error).toBe('RecipeIntegrityError');
    expect(failure.context).toStrictEqual({
      recipeId: expect.any(String),
      reason:
        'las posiciones deben ser consecutivas empezando en 1 (se esperaba 1 y se encontró 3)',
    });
  });

  it('I7: el output del último paso debe coincidir con el output de la receta (422)', async () => {
    writeTokens(TOKENS.admin);
    const failure = await expectApiError(
      createRecipesApi().create({
        name: 'Incoherente',
        outputProductId: DEMO_SEED_IDS.pan,
        outputQuantity: { amount: 1, unit: 'unit' },
        steps: [{ ...SINGLE_STEP, outputProductId: DEMO_SEED_IDS.masa }],
      }),
    );

    expect(failure.statusCode).toBe(422);
    expect(failure.error).toBe('RecipeIntegrityError');
    expect((failure.context as { readonly reason: string; readonly recipeId: string }).reason).toBe(
      'el output del último paso debe coincidir con el output de la receta (I7)',
    );
  });

  it('steps vacía → 422 (la lista vacía da el error del dominio, no un 400)', async () => {
    writeTokens(TOKENS.admin);
    const failure = await expectApiError(
      createRecipesApi().create({
        name: 'Sin pasos',
        outputProductId: DEMO_SEED_IDS.pan,
        outputQuantity: { amount: 1, unit: 'unit' },
        steps: [],
      }),
    );

    expect(failure.statusCode).toBe(422);
    expect(failure.error).toBe('RecipeIntegrityError');
    expect((failure.context as { readonly reason: string; readonly recipeId: string }).reason).toBe(
      'la receta debe tener al menos un paso',
    );
  });

  it('cantidad inválida (0 / negativa) → 422 InvalidQuantityError sin context', async () => {
    writeTokens(TOKENS.admin);
    const api = createRecipesApi();

    const zero = await expectApiError(
      api.create({
        name: 'Masa cero',
        outputProductId: DEMO_SEED_IDS.masa,
        outputQuantity: { amount: 0, unit: 'kg' },
        steps: [SINGLE_STEP],
      }),
    );
    expect(zero.statusCode).toBe(422);
    expect(zero.error).toBe('InvalidQuantityError');
    expect(zero.context).toBeUndefined();

    const negativeInput = await expectApiError(
      api.create({
        name: 'Input negativo',
        outputProductId: DEMO_SEED_IDS.masa,
        outputQuantity: { amount: 2, unit: 'kg' },
        steps: [
          {
            ...SINGLE_STEP,
            inputs: [{ materialId: DEMO_SEED_IDS.harina, quantity: { amount: -1, unit: 'kg' } }],
          },
        ],
      }),
    );
    expect(negativeInput.statusCode).toBe(422);
    expect(negativeInput.error).toBe('InvalidQuantityError');
  });
});

describe('recipesApi (demo) — update (steps reemplaza la lista completa)', () => {
  it('update del nombre mantiene los pasos (mismos ids de la receta sembrada)', async () => {
    writeTokens(TOKENS.admin);
    const api = createRecipesApi();

    const updated = await api.update(DEMO_SEED_IDS.panArtesanal, { name: 'Pan premium' });
    expect(updated.name).toBe('Pan premium');
    expect(updated.steps.map((step) => step.id)).toStrictEqual([
      DEMO_SEED_IDS.paso1,
      DEMO_SEED_IDS.paso2,
    ]);
  });

  it('update con steps REEMPLAZA (ids nuevos, sin rastro de los viejos)', async () => {
    writeTokens(TOKENS.admin);
    const api = createRecipesApi();

    const updated = await api.update(DEMO_SEED_IDS.panArtesanal, {
      steps: [
        {
          position: 1,
          machineType: 'mixer',
          inputs: [{ materialId: DEMO_SEED_IDS.masa, quantity: { amount: 2, unit: 'kg' } }],
          outputProductId: DEMO_SEED_IDS.pan,
          outputQuantity: { amount: 1, unit: 'unit' },
        },
      ],
    });

    expect(updated.outputProductId).toBe(DEMO_SEED_IDS.pan);
    expect(updated.steps).toHaveLength(1);
    expect(updated.steps[0]).toMatchObject({
      position: 1,
      machineType: 'mixer',
      outputProductId: DEMO_SEED_IDS.pan,
    });
    const ids = updated.steps.map((step) => step.id);
    expect(ids).not.toContain(DEMO_SEED_IDS.paso1);
    expect(ids).not.toContain(DEMO_SEED_IDS.paso2);
    // Persistido: una lectura posterior ve la lista reemplazada.
    expect((await api.get(DEMO_SEED_IDS.panArtesanal)).steps).toHaveLength(1);
  });

  it('update con steps vacía → 422; update de receta inexistente → 404', async () => {
    writeTokens(TOKENS.admin);
    const api = createRecipesApi();

    const fourTwentyTwo = await expectApiError(
      api.update(DEMO_SEED_IDS.panArtesanal, { steps: [] }),
    );
    expect(fourTwentyTwo.statusCode).toBe(422);
    expect(fourTwentyTwo.error).toBe('RecipeIntegrityError');

    const fourOhFour = await expectApiError(api.update('rec-no', { name: 'X' }));
    expect(fourOhFour.statusCode).toBe(404);
    expect(fourOhFour.context).toStrictEqual({ entity: 'Recipe', id: 'rec-no' });
  });
});
