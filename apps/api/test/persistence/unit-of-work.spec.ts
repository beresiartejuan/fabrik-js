import { LocationId } from '@fabrik/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aMaterial, aStockMovement } from './fixtures.js';
import { createTestDatabase, type TestDatabase } from './test-db.js';

describe('DrizzleUnitOfWork', () => {
  let ctx: TestDatabase;

  beforeEach(async () => {
    ctx = await createTestDatabase();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('hace commit cuando la función resuelve y devuelve su resultado', async () => {
    const material = aMaterial();

    const result = await ctx.unitOfWork.run(async (repos) => {
      await repos.materials.save(material);
      const inside = await repos.materials.findById(material.id);
      expect(inside?.id).toBe(material.id);
      return 'ok';
    });

    expect(result).toBe('ok');
    const persisted = await ctx.repositories.materials.findById(material.id);
    expect(persisted?.name).toBe('Harina');
  });

  it('hace rollback cuando la función lanza (nada queda persistido)', async () => {
    const material = aMaterial();

    await expect(
      ctx.unitOfWork.run(async (repos) => {
        await repos.materials.save(material);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await ctx.repositories.materials.list()).toEqual([]);
  });

  it('hace rollback de escrituras en varios repositorios', async () => {
    const locationId = LocationId.create();
    const material = aMaterial();
    const movement = aStockMovement({
      locationId,
      materialId: material.id,
      delta: { amount: 5, unit: 'kg' },
      reason: 'supply_in',
    });

    await expect(
      ctx.unitOfWork.run(async (repos) => {
        await repos.materials.save(material);
        await repos.stockMovements.add(movement);
        throw new Error('falla de negocio');
      }),
    ).rejects.toThrow('falla de negocio');

    expect(await ctx.repositories.materials.list()).toEqual([]);
    expect(await ctx.repositories.stockMovements.listByLocation(locationId)).toEqual([]);
  });

  it('hace commit de escrituras en varios repositorios', async () => {
    const locationId = LocationId.create();
    const material = aMaterial();
    const movement = aStockMovement({
      locationId,
      materialId: material.id,
      delta: { amount: 5, unit: 'kg' },
      reason: 'supply_in',
    });

    await ctx.unitOfWork.run(async (repos) => {
      await repos.materials.save(material);
      await repos.stockMovements.add(movement);
    });

    expect(await ctx.repositories.materials.list()).toHaveLength(1);
    expect(await ctx.repositories.stockMovements.listByLocation(locationId)).toHaveLength(1);
  });

  it('propaga el error original al llamador', async () => {
    const error = new Error('error de dominio');
    await expect(
      ctx.unitOfWork.run(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});
