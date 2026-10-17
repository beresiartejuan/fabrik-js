import { Machine } from '@fabrik/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aLocation, aMachine } from './fixtures.js';
import { createTestDatabase, type TestDatabase } from './test-db.js';

describe('DrizzleMachineRepository', () => {
  let ctx: TestDatabase;

  beforeEach(async () => {
    ctx = await createTestDatabase();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('findById devuelve null cuando no existe', async () => {
    await expect(ctx.repositories.machines.findById(aMachine(aLocation().id).id)).resolves.toBeNull();
  });

  it('save + findById hacen round-trip (status por defecto idle)', async () => {
    const location = aLocation({ kind: 'production' });
    const machine = aMachine(location.id, { name: 'Amasadora', type: 'mixer' });
    await ctx.repositories.machines.save(machine);

    const found = await ctx.repositories.machines.findById(machine.id);
    expect(found).toMatchObject({
      id: machine.id,
      name: 'Amasadora',
      type: 'mixer',
      locationId: location.id,
      status: 'idle',
    });
  });

  it('save es upsert por id (transición de estado)', async () => {
    const location = aLocation({ kind: 'production' });
    const machine = aMachine(location.id);
    await ctx.repositories.machines.save(machine);
    await ctx.repositories.machines.save(machine.start());

    const listed = await ctx.repositories.machines.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.status).toBe('running');
  });

  it('list filtra por locationId, status y type', async () => {
    const line1 = aLocation({ name: 'L1', kind: 'production' });
    const line2 = aLocation({ name: 'L2', kind: 'production' });
    const oven = aMachine(line1.id, { name: 'Horno', type: 'oven' });
    const mixer = aMachine(line1.id, { name: 'Amasadora', type: 'mixer' }).start();
    const otherOven = aMachine(line2.id, { name: 'Horno 2', type: 'oven' });
    await ctx.repositories.machines.save(oven);
    await ctx.repositories.machines.save(mixer);
    await ctx.repositories.machines.save(otherOven);

    expect(await ctx.repositories.machines.list()).toHaveLength(3);
    expect((await ctx.repositories.machines.list({ locationId: line1.id })).map((m) => m.id).sort()).toEqual(
      [oven.id, mixer.id].sort(),
    );
    expect((await ctx.repositories.machines.list({ type: 'oven' })).map((m) => m.id).sort()).toEqual(
      [oven.id, otherOven.id].sort(),
    );
    expect((await ctx.repositories.machines.list({ status: 'running' })).map((m) => m.id)).toEqual([
      mixer.id,
    ]);
    expect(
      (await ctx.repositories.machines.list({ locationId: line1.id, type: 'mixer' })).map((m) => m.id),
    ).toEqual([mixer.id]);
  });

  it('save usa fromPersistence y no create (mismo id en upsert)', async () => {
    const location = aLocation({ kind: 'production' });
    const machine = aMachine(location.id);
    await ctx.repositories.machines.save(machine);
    const persisted = await ctx.repositories.machines.findById(machine.id);
    await ctx.repositories.machines.save(
      Machine.fromPersistence({
        id: machine.id,
        name: 'Renombrada',
        type: machine.type,
        locationId: machine.locationId,
        status: machine.status,
      }),
    );

    expect(persisted).not.toBeNull();
    expect((await ctx.repositories.machines.findById(machine.id))?.name).toBe('Renombrada');
  });
});
