import { describe, expect, it } from 'vitest';

import {
  CreateMachine,
  GetMachine,
  InvalidLocationKindError,
  ListMachines,
  Location,
  LocationId,
  MachineId,
  NotFoundError,
  UnauthorizedRoleError,
  UpdateMachine,
  WorkerId,
  MoveMachine,
  type Actor,
} from '../../index';
import { collectingEventBus, inMemoryRepositories } from '../../testing';

const ADMIN: Actor = { workerId: WorkerId.from('admin-1'), role: 'admin' };
const WORKER: Actor = { workerId: WorkerId.from('worker-1'), role: 'worker' };
const AUDITOR: Actor = { workerId: WorkerId.from('auditor-1'), role: 'auditor' };

function setup() {
  const repos = inMemoryRepositories();
  const events = collectingEventBus();
  return {
    repos,
    events,
    create: new CreateMachine({ machines: repos.machines, locations: repos.locations, events }),
    update: new UpdateMachine({ machines: repos.machines }),
    move: new MoveMachine({ machines: repos.machines, locations: repos.locations, events }),
    get: new GetMachine({ machines: repos.machines }),
    list: new ListMachines({ machines: repos.machines }),
  };
}

async function seedProduction(repos: ReturnType<typeof setup>['repos']): Promise<Location> {
  const location = Location.create({ name: 'Sala 1', kind: 'production' });
  await repos.locations.save(location);
  return location;
}

describe('CreateMachine', () => {
  it('crea una máquina en un lugar de producción y emite machine.created', async () => {
    const { create, repos, events } = setup();
    const location = await seedProduction(repos);

    const machine = await create.execute(ADMIN, {
      name: 'Mezcladora',
      type: 'mixer',
      locationId: location.id,
    });

    expect(machine.status).toBe('idle');
    await expect(repos.machines.findById(machine.id)).resolves.toBe(machine);
    expect(events.events.map((event) => event.name)).toEqual(['machine.created']);
    expect(events.events[0]).toMatchObject({ payload: { locationId: location.id } });
  });

  it('rechaza crear en un lugar de almacenamiento (I2)', async () => {
    const { create, repos } = setup();
    const storage = Location.create({ name: 'Depósito', kind: 'storage' });
    await repos.locations.save(storage);

    await expect(
      create.execute(ADMIN, { name: 'M', type: 'mixer', locationId: storage.id }),
    ).rejects.toBeInstanceOf(InvalidLocationKindError);
  });

  it('lanza NotFoundError si el lugar no existe', async () => {
    const { create } = setup();

    await expect(
      create.execute(ADMIN, { name: 'M', type: 'mixer', locationId: LocationId.create() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza al rol worker', async () => {
    const { create, repos } = setup();
    const location = await seedProduction(repos);

    await expect(
      create.execute(WORKER, { name: 'M', type: 'mixer', locationId: location.id }),
    ).rejects.toMatchObject({ name: 'UnauthorizedRoleError', useCase: 'CreateMachine' });
  });

  it('rechaza al rol auditor', async () => {
    const { create, repos } = setup();
    const location = await seedProduction(repos);

    await expect(
      create.execute(AUDITOR, { name: 'M', type: 'mixer', locationId: location.id }),
    ).rejects.toBeInstanceOf(UnauthorizedRoleError);
  });
});

describe('UpdateMachine', () => {
  it('actualiza nombre y tipo sin emitir eventos', async () => {
    const { create, update, repos, events } = setup();
    const location = await seedProduction(repos);
    const machine = await create.execute(ADMIN, {
      name: 'Mezcladora',
      type: 'mixer',
      locationId: location.id,
    });
    events.clear();

    const updated = await update.execute(ADMIN, { id: machine.id, name: 'Mezcladora 2', type: 'blender' });

    expect(updated.name).toBe('Mezcladora 2');
    expect(updated.type).toBe('blender');
    expect(updated.locationId).toBe(location.id);
    await expect(repos.machines.findById(machine.id)).resolves.toBe(updated);
    expect(events.events).toHaveLength(0);
  });

  it('lanza NotFoundError si la máquina no existe', async () => {
    const { update } = setup();

    await expect(
      update.execute(ADMIN, { id: MachineId.create(), name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza al rol worker', async () => {
    const { create, update, repos } = setup();
    const location = await seedProduction(repos);
    const machine = await create.execute(ADMIN, {
      name: 'M',
      type: 'mixer',
      locationId: location.id,
    });

    await expect(update.execute(WORKER, { id: machine.id, name: 'X' })).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'UpdateMachine',
    });
  });

  it('rechaza al rol auditor', async () => {
    const { create, update, repos } = setup();
    const location = await seedProduction(repos);
    const machine = await create.execute(ADMIN, {
      name: 'M',
      type: 'mixer',
      locationId: location.id,
    });

    await expect(update.execute(AUDITOR, { id: machine.id })).rejects.toBeInstanceOf(
      UnauthorizedRoleError,
    );
  });
});

describe('MoveMachine', () => {
  it('mueve a otro lugar de producción usando moveTo y emite machine.moved', async () => {
    const { create, move, repos, events } = setup();
    const origin = await seedProduction(repos);
    const destination = Location.create({ name: 'Sala 2', kind: 'production' });
    await repos.locations.save(destination);
    const machine = await create.execute(ADMIN, {
      name: 'M',
      type: 'mixer',
      locationId: origin.id,
    });
    events.clear();

    const moved = await move.execute(ADMIN, { id: machine.id, locationId: destination.id });

    expect(moved.locationId).toBe(destination.id);
    await expect(repos.machines.findById(machine.id)).resolves.toBe(moved);
    expect(events.events.map((event) => event.name)).toEqual(['machine.moved']);
  });

  it('rechaza mover a un lugar de almacenamiento (I2)', async () => {
    const { create, move, repos } = setup();
    const origin = await seedProduction(repos);
    const storage = Location.create({ name: 'Depósito', kind: 'storage' });
    await repos.locations.save(storage);
    const machine = await create.execute(ADMIN, {
      name: 'M',
      type: 'mixer',
      locationId: origin.id,
    });

    await expect(
      move.execute(ADMIN, { id: machine.id, locationId: storage.id }),
    ).rejects.toBeInstanceOf(InvalidLocationKindError);
  });

  it('lanza NotFoundError si la máquina o el lugar no existen', async () => {
    const { create, move, repos } = setup();
    const origin = await seedProduction(repos);
    const machine = await create.execute(ADMIN, {
      name: 'M',
      type: 'mixer',
      locationId: origin.id,
    });

    await expect(
      move.execute(ADMIN, { id: MachineId.create(), locationId: origin.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      move.execute(ADMIN, { id: machine.id, locationId: LocationId.create() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza al rol worker', async () => {
    const { create, move, repos } = setup();
    const origin = await seedProduction(repos);
    const machine = await create.execute(ADMIN, {
      name: 'M',
      type: 'mixer',
      locationId: origin.id,
    });

    await expect(
      move.execute(WORKER, { id: machine.id, locationId: origin.id }),
    ).rejects.toMatchObject({ name: 'UnauthorizedRoleError', useCase: 'MoveMachine' });
  });

  it('rechaza al rol auditor', async () => {
    const { create, move, repos } = setup();
    const origin = await seedProduction(repos);
    const machine = await create.execute(ADMIN, {
      name: 'M',
      type: 'mixer',
      locationId: origin.id,
    });

    await expect(
      move.execute(AUDITOR, { id: machine.id, locationId: origin.id }),
    ).rejects.toBeInstanceOf(UnauthorizedRoleError);
  });
});

describe('GetMachine / ListMachines (roles A, Au)', () => {
  it('GetMachine devuelve la máquina para admin y auditor', async () => {
    const { create, get, repos } = setup();
    const location = await seedProduction(repos);
    const machine = await create.execute(ADMIN, {
      name: 'M',
      type: 'mixer',
      locationId: location.id,
    });

    await expect(get.execute(ADMIN, { id: machine.id })).resolves.toBe(machine);
    await expect(get.execute(AUDITOR, { id: machine.id })).resolves.toBe(machine);
  });

  it('GetMachine lanza NotFoundError si no existe', async () => {
    const { get } = setup();

    await expect(get.execute(ADMIN, { id: MachineId.create() })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('GetMachine rechaza al rol worker', async () => {
    const { create, get, repos } = setup();
    const location = await seedProduction(repos);
    const machine = await create.execute(ADMIN, {
      name: 'M',
      type: 'mixer',
      locationId: location.id,
    });

    await expect(get.execute(WORKER, { id: machine.id })).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'GetMachine',
    });
  });

  it('ListMachines filtra por lugar y admite al auditor', async () => {
    const { create, list, repos } = setup();
    const location = await seedProduction(repos);
    await create.execute(ADMIN, { name: 'M1', type: 'mixer', locationId: location.id });
    await create.execute(ADMIN, { name: 'M2', type: 'oven', locationId: location.id });

    await expect(list.execute(ADMIN, {})).resolves.toHaveLength(2);
    await expect(list.execute(AUDITOR, { filter: { type: 'oven' } })).resolves.toHaveLength(1);
  });

  it('ListMachines rechaza al rol worker', async () => {
    const { list } = setup();

    await expect(list.execute(WORKER, {})).rejects.toBeInstanceOf(UnauthorizedRoleError);
  });
});
