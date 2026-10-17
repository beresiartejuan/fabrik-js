import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createE2EApp, type E2EContext } from '../support/e2e-app.js';

/** E2E del recurso `recipes` (Fase 4, docs/09): CRUD + integridad (I7) + RBAC. */
describe('Recipes (e2e)', () => {
  let ctx: E2EContext;
  let flourId: string;
  let productId: string;

  beforeAll(async () => {
    ctx = await createE2EApp();

    const create = (body: Record<string, unknown>) =>
      request(ctx.app.getHttpServer())
        .post('/materials')
        .set('Authorization', ctx.auth('admin'))
        .send(body)
        .expect(201);

    flourId = (
      await create({
        name: 'Harina 000',
        kind: 'supply',
        physicalState: 'solid',
        unitOfMeasure: 'kg',
      })
    ).body.id as string;
    productId = (
      await create({
        name: 'Pan',
        kind: 'product',
        physicalState: 'solid',
        unitOfMeasure: 'unit',
      })
    ).body.id as string;
  });

  afterAll(async () => {
    await ctx.close();
  });

  function recipeBody(name: string, lastStepOutputProductId: string) {
    return {
      name,
      outputProductId: productId,
      outputQuantity: { amount: 1, unit: 'unit' },
      steps: [
        {
          position: 1,
          machineType: 'mixer',
          inputs: [{ materialId: flourId, quantity: { amount: 2, unit: 'kg' } }],
          outputProductId: lastStepOutputProductId,
          outputQuantity: { amount: 1, unit: 'unit' },
        },
      ],
    };
  }

  it('CRUD: create → list → get → update', async () => {
    const server = ctx.app.getHttpServer();

    const created = await request(server)
      .post('/recipes')
      .set('Authorization', ctx.auth('admin'))
      .send(recipeBody('Pan', productId))
      .expect(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({
      name: 'Pan',
      outputProductId: productId,
      outputQuantity: { amount: 1, unit: 'unit' },
    });
    expect(created.body.steps).toHaveLength(1);
    expect(created.body.steps[0]).toMatchObject({
      position: 1,
      machineType: 'mixer',
      inputs: [{ materialId: flourId, quantity: { amount: 2, unit: 'kg' } }],
    });

    const list = await request(server)
      .get(`/recipes?outputProductId=${productId}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect((list.body as { id: string }[]).map((r) => r.id)).toContain(id);

    const fetched = await request(server)
      .get(`/recipes/${id}`)
      .set('Authorization', ctx.auth('admin'))
      .expect(200);
    expect(fetched.body).toMatchObject({ id, name: 'Pan' });

    const updated = await request(server)
      .patch(`/recipes/${id}`)
      .set('Authorization', ctx.auth('admin'))
      .send({ name: 'Pan Integral', outputQuantity: { amount: 2, unit: 'unit' } })
      .expect(200);
    expect(updated.body).toMatchObject({
      id,
      name: 'Pan Integral',
      outputQuantity: { amount: 2, unit: 'unit' },
    });
  });

  it('create donde el output del último paso no coincide con la receta → 422 (I7)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/recipes')
      .set('Authorization', ctx.auth('admin'))
      .send(recipeBody('Receta Incoherente', flourId))
      .expect(422);
    expect(response.body).toMatchObject({ statusCode: 422, error: 'RecipeIntegrityError' });
  });

  it('un worker no puede crear recetas → 403', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/recipes')
      .set('Authorization', ctx.auth('worker'))
      .send(recipeBody('Intrusa', productId))
      .expect(403);
    expect(response.body).toMatchObject({ statusCode: 403, error: 'UnauthorizedRoleError' });
  });

  it('un auditor puede leer recetas → 200', async () => {
    await request(ctx.app.getHttpServer())
      .get('/recipes')
      .set('Authorization', ctx.auth('auditor'))
      .expect(200);
  });
});
