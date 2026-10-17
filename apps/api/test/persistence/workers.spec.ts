import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aWorker } from './fixtures.js';
import { createTestDatabase, type TestDatabase } from './test-db.js';

describe('DrizzleWorkerRepository', () => {
  let ctx: TestDatabase;

  beforeEach(async () => {
    ctx = await createTestDatabase();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('findById devuelve null cuando no existe', async () => {
    await expect(ctx.repositories.workers.findById(aWorker().id)).resolves.toBeNull();
  });

  it('save + findById hacen round-trip (active por defecto)', async () => {
    const worker = aWorker({ name: 'Ana', role: 'worker' });
    await ctx.repositories.workers.save(worker);

    const found = await ctx.repositories.workers.findById(worker.id);
    expect(found).toMatchObject({ id: worker.id, name: 'Ana', role: 'worker', active: true });
  });

  it('save es upsert por id (baja lógica)', async () => {
    const worker = aWorker();
    await ctx.repositories.workers.save(worker);
    await ctx.repositories.workers.save(worker.deactivate());

    const listed = await ctx.repositories.workers.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.active).toBe(false);
  });

  it('list filtra por role y active', async () => {
    const admin = aWorker({ name: 'Admin', role: 'admin' });
    const active = aWorker({ name: 'Activo' });
    const inactive = aWorker({ name: 'Inactivo' }).deactivate();
    await ctx.repositories.workers.save(admin);
    await ctx.repositories.workers.save(active);
    await ctx.repositories.workers.save(inactive);

    expect(await ctx.repositories.workers.list()).toHaveLength(3);
    expect((await ctx.repositories.workers.list({ role: 'admin' })).map((w) => w.id)).toEqual([
      admin.id,
    ]);
    expect((await ctx.repositories.workers.list({ active: false })).map((w) => w.id)).toEqual([
      inactive.id,
    ]);
    expect(
      (await ctx.repositories.workers.list({ role: 'worker', active: true })).map((w) => w.id),
    ).toEqual([active.id]);
  });
});
