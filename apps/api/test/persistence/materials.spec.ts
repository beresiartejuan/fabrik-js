import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aMaterial, aProduct } from './fixtures.js';
import { createTestDatabase, type TestDatabase } from './test-db.js';

describe('DrizzleMaterialRepository', () => {
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
      ctx.repositories.materials.findById(material.id),
    ).resolves.toBeNull();
  });

  it('save + findById hacen round-trip del material', async () => {
    const material = aMaterial({ description: 'Harina 000' });
    await ctx.repositories.materials.save(material);

    const found = await ctx.repositories.materials.findById(material.id);
    expect(found).not.toBeNull();
    expect(found).toMatchObject({
      id: material.id,
      name: 'Harina',
      description: 'Harina 000',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
      active: true,
    });
  });

  it('save es upsert por id', async () => {
    const material = aMaterial();
    await ctx.repositories.materials.save(material);
    await ctx.repositories.materials.save(material.deactivate());

    const listed = await ctx.repositories.materials.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.active).toBe(false);
  });

  it('list filtra por kind y physicalState', async () => {
    const supply = aMaterial();
    const liquid = aMaterial({
      name: 'Leche',
      physicalState: 'liquid',
      unitOfMeasure: 'l',
    });
    const product = aProduct();
    await ctx.repositories.materials.save(supply);
    await ctx.repositories.materials.save(liquid);
    await ctx.repositories.materials.save(product);

    expect(await ctx.repositories.materials.list()).toHaveLength(3);

    const supplies = await ctx.repositories.materials.list({ kind: 'supply' });
    expect(supplies.map((m) => m.id).sort()).toEqual(
      [supply.id, liquid.id].sort(),
    );

    const products = await ctx.repositories.materials.list({ kind: 'product' });
    expect(products.map((m) => m.id)).toEqual([product.id]);

    const liquids = await ctx.repositories.materials.list({
      physicalState: 'liquid',
    });
    expect(liquids.map((m) => m.id)).toEqual([liquid.id]);

    const solidSupplies = await ctx.repositories.materials.list({
      kind: 'supply',
      physicalState: 'solid',
    });
    expect(solidSupplies.map((m) => m.id)).toEqual([supply.id]);
  });

  it('existsByName detecta nombres existentes', async () => {
    await ctx.repositories.materials.save(aMaterial({ name: 'Azúcar' }));

    await expect(
      ctx.repositories.materials.existsByName!('Azúcar'),
    ).resolves.toBe(true);
    await expect(ctx.repositories.materials.existsByName!('Sal')).resolves.toBe(
      false,
    );
  });
});
