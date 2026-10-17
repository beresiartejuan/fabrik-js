import { Location } from '@fabrik/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aLocation } from './fixtures.js';
import { createTestDatabase, type TestDatabase } from './test-db.js';

describe('DrizzleLocationRepository', () => {
  let ctx: TestDatabase;

  beforeEach(async () => {
    ctx = await createTestDatabase();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('findById devuelve null cuando no existe', async () => {
    await expect(ctx.repositories.locations.findById(aLocation().id)).resolves.toBeNull();
  });

  it('save + findById hacen round-trip', async () => {
    const location = aLocation({ name: 'Línea 1', kind: 'production' });
    await ctx.repositories.locations.save(location);

    const found = await ctx.repositories.locations.findById(location.id);
    expect(found).toMatchObject({ id: location.id, name: 'Línea 1', kind: 'production' });
  });

  it('save es upsert por id', async () => {
    const location = aLocation();
    await ctx.repositories.locations.save(location);
    await ctx.repositories.locations.save(
      Location.fromPersistence({ id: location.id, name: 'Depósito 2', kind: location.kind }),
    );

    const listed = await ctx.repositories.locations.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe('Depósito 2');
  });

  it('list filtra por kind', async () => {
    const storage = aLocation();
    const production = aLocation({ name: 'Línea 1', kind: 'production' });
    await ctx.repositories.locations.save(storage);
    await ctx.repositories.locations.save(production);

    expect(await ctx.repositories.locations.list()).toHaveLength(2);
    expect((await ctx.repositories.locations.list({ kind: 'storage' })).map((l) => l.id)).toEqual([
      storage.id,
    ]);
    expect((await ctx.repositories.locations.list({ kind: 'production' })).map((l) => l.id)).toEqual(
      [production.id],
    );
  });
});
