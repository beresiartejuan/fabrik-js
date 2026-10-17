import { BatchEventId, RecipeId } from '@fabrik/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aBatch, aMaterial, quantity } from './fixtures.js';
import { createTestDatabase, type TestDatabase } from './test-db.js';

describe('DrizzleBatchRepository', () => {
  let ctx: TestDatabase;

  beforeEach(async () => {
    ctx = await createTestDatabase();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('findById devuelve null cuando no existe', async () => {
    const material = aMaterial();
    await expect(
      ctx.repositories.batches.findById(aBatch(material.id).id),
    ).resolves.toBeNull();
  });

  it('save + findById hacen round-trip (incluye recipeId/originBatchEventId)', async () => {
    const material = aMaterial();
    const recipeId = RecipeId.create();
    const originEventId = BatchEventId.create();
    const batch = aBatch(material.id, {
      recipeId,
      originBatchEventId: originEventId,
      quantity: quantity(5, 'kg'),
    });
    await ctx.repositories.batches.save(batch);

    const found = await ctx.repositories.batches.findById(batch.id);
    expect(found).toMatchObject({
      id: batch.id,
      materialId: material.id,
      recipeId,
      originBatchEventId: originEventId,
      status: 'in_progress',
    });
    expect(found?.quantity).toMatchObject({ amount: 5, unit: 'kg' });
  });

  it('save es upsert por id (transición de estado)', async () => {
    const material = aMaterial();
    const batch = aBatch(material.id);
    await ctx.repositories.batches.save(batch);
    await ctx.repositories.batches.save(batch.complete());

    const listed = await ctx.repositories.batches.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.status).toBe('completed');
  });

  it('findByMaterial filtra por material', async () => {
    const pan = aMaterial({
      name: 'Pan',
      kind: 'product',
      unitOfMeasure: 'unit',
    });
    const harina = aMaterial();
    const batchPan = aBatch(pan.id, { quantity: quantity(3, 'unit') });
    const batchHarina = aBatch(harina.id);
    await ctx.repositories.batches.save(batchPan);
    await ctx.repositories.batches.save(batchHarina);

    expect(
      (await ctx.repositories.batches.findByMaterial!(pan.id)).map((b) => b.id),
    ).toEqual([batchPan.id]);
  });

  it('list filtra por materialId, status, recipeId y originBatchEventId', async () => {
    const material = aMaterial();
    const otherMaterial = aMaterial({ name: 'Sal', unitOfMeasure: 'g' });
    const recipeId = RecipeId.create();
    const originEventId = BatchEventId.create();

    const storedFromRecipe = aBatch(material.id, {
      recipeId,
      originBatchEventId: originEventId,
    }).store();
    const completed = aBatch(material.id).complete();
    const supply = aBatch(otherMaterial.id, { quantity: quantity(100, 'g') });
    await ctx.repositories.batches.save(storedFromRecipe);
    await ctx.repositories.batches.save(completed);
    await ctx.repositories.batches.save(supply);

    expect(await ctx.repositories.batches.list()).toHaveLength(3);
    expect(
      (await ctx.repositories.batches.list({ status: 'stored' })).map(
        (b) => b.id,
      ),
    ).toEqual([storedFromRecipe.id]);
    expect(
      (await ctx.repositories.batches.list({ status: 'completed' })).map(
        (b) => b.id,
      ),
    ).toEqual([completed.id]);
    expect(
      (
        await ctx.repositories.batches.list({ materialId: otherMaterial.id })
      ).map((b) => b.id),
    ).toEqual([supply.id]);
    expect(
      (await ctx.repositories.batches.list({ recipeId })).map((b) => b.id),
    ).toEqual([storedFromRecipe.id]);
    expect(
      (
        await ctx.repositories.batches.list({
          originBatchEventId: originEventId,
        })
      ).map((b) => b.id),
    ).toEqual([storedFromRecipe.id]);
    expect(
      (
        await ctx.repositories.batches.list({
          materialId: material.id,
          status: 'completed',
        })
      ).map((b) => b.id),
    ).toEqual([completed.id]);
  });
});
