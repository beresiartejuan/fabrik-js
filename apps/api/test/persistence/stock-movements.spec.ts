import { LocationId, StockMovement } from '@fabrik/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aMaterial, aStockMovement } from './fixtures.js';
import { createTestDatabase, type TestDatabase } from './test-db.js';

describe('DrizzleStockMovementRepository (append-only)', () => {
  let ctx: TestDatabase;

  const locationId = LocationId.create();
  const otherLocation = LocationId.create();
  const material = aMaterial();
  const otherMaterial = aMaterial({ name: 'Sal', unitOfMeasure: 'g' });
  const ts = new Date('2026-01-01T10:00:00.000Z');

  beforeEach(async () => {
    ctx = await createTestDatabase();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('listByLocation devuelve vacío cuando no hay movimientos', async () => {
    expect(await ctx.repositories.stockMovements.listByLocation(locationId)).toEqual([]);
  });

  it('add + listByLocation (con y sin filtro de material)', async () => {
    const inMaterial = aStockMovement({
      locationId,
      materialId: material.id,
      delta: { amount: 10, unit: 'kg' },
      reason: 'supply_in',
      timestamp: ts,
    });
    const outMaterial = aStockMovement({
      locationId,
      materialId: otherMaterial.id,
      delta: { amount: 500, unit: 'g' },
      reason: 'supply_in',
      timestamp: ts,
    });
    await ctx.repositories.stockMovements.add(inMaterial);
    await ctx.repositories.stockMovements.add(outMaterial);

    expect(
      (await ctx.repositories.stockMovements.listByLocation(locationId)).map((m) => m.id).sort(),
    ).toEqual([inMaterial.id, outMaterial.id].sort());
    expect(
      (await ctx.repositories.stockMovements.listByLocation(locationId, material.id)).map(
        (m) => m.id,
      ),
    ).toEqual([inMaterial.id]);
  });

  it('sumByLocationAndMaterial devuelve null sin movimientos', async () => {
    await expect(
      ctx.repositories.stockMovements.sumByLocationAndMaterial(locationId, material.id),
    ).resolves.toBeNull();
  });

  it('sumByLocationAndMaterial suma deltas con signo', async () => {
    await ctx.repositories.stockMovements.add(
      aStockMovement({
        locationId,
        materialId: material.id,
        delta: { amount: 10, unit: 'kg' },
        reason: 'supply_in',
        timestamp: ts,
      }),
    );
    await ctx.repositories.stockMovements.add(
      aStockMovement({
        locationId,
        materialId: material.id,
        delta: { amount: -4, unit: 'kg' },
        reason: 'transfer_out',
        timestamp: ts,
      }),
    );

    const total = await ctx.repositories.stockMovements.sumByLocationAndMaterial(
      locationId,
      material.id,
    );
    expect(total).toMatchObject({ amount: 6, unit: 'kg' });
  });

  it('sumByLocationAndMaterial aísla lugar y material', async () => {
    await ctx.repositories.stockMovements.add(
      aStockMovement({
        locationId,
        materialId: material.id,
        delta: { amount: 10, unit: 'kg' },
        reason: 'supply_in',
        timestamp: ts,
      }),
    );
    await ctx.repositories.stockMovements.add(
      aStockMovement({
        locationId: otherLocation,
        materialId: material.id,
        delta: { amount: 99, unit: 'kg' },
        reason: 'supply_in',
        timestamp: ts,
      }),
    );
    await ctx.repositories.stockMovements.add(
      aStockMovement({
        locationId,
        materialId: otherMaterial.id,
        delta: { amount: 100, unit: 'g' },
        reason: 'supply_in',
        timestamp: ts,
      }),
    );

    const total = await ctx.repositories.stockMovements.sumByLocationAndMaterial(
      locationId,
      material.id,
    );
    expect(total).toMatchObject({ amount: 10, unit: 'kg' });
  });

  it('add es idempotente por id (no duplica la suma)', async () => {
    const movement = aStockMovement({
      locationId,
      materialId: material.id,
      delta: { amount: 10, unit: 'kg' },
      reason: 'supply_in',
      timestamp: ts,
    });
    await ctx.repositories.stockMovements.add(movement);
    await ctx.repositories.stockMovements.add(
      StockMovement.fromPersistence({
        id: movement.id,
        locationId,
        materialId: material.id,
        delta: { amount: 2, unit: 'kg' },
        reason: 'supply_in',
        timestamp: ts,
      }),
    );

    expect(await ctx.repositories.stockMovements.listByLocation(locationId)).toHaveLength(1);
    const total = await ctx.repositories.stockMovements.sumByLocationAndMaterial(
      locationId,
      material.id,
    );
    expect(total).toMatchObject({ amount: 2, unit: 'kg' });
  });
});
