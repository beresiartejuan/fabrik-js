import { describe, expect, it } from 'vitest';

import {
  CreateLocation,
  GetLocation,
  ListLocations,
  LocationId,
  NotFoundError,
  UnauthorizedRoleError,
  UpdateLocation,
  WorkerId,
  type Actor,
} from '../../index.js';
import { inMemoryRepositories } from '../../testing/index.js';

const ADMIN: Actor = { workerId: WorkerId.from('admin-1'), role: 'admin' };
const WORKER: Actor = { workerId: WorkerId.from('worker-1'), role: 'worker' };
const AUDITOR: Actor = { workerId: WorkerId.from('auditor-1'), role: 'auditor' };

function setup() {
  const repos = inMemoryRepositories();
  return {
    repos,
    create: new CreateLocation({ locations: repos.locations }),
    update: new UpdateLocation({ locations: repos.locations }),
    get: new GetLocation({ locations: repos.locations }),
    list: new ListLocations({ locations: repos.locations }),
  };
}

describe('CreateLocation', () => {
  it('crea y persiste un lugar (rol admin)', async () => {
    const { create, repos } = setup();

    const location = await create.execute(ADMIN, { name: 'Sala 1', kind: 'production' });

    expect(location.kind).toBe('production');
    await expect(repos.locations.findById(location.id)).resolves.toBe(location);
  });

  it('rechaza al rol worker', async () => {
    const { create } = setup();

    await expect(
      create.execute(WORKER, { name: 'Sala 1', kind: 'production' }),
    ).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      role: 'worker',
      useCase: 'CreateLocation',
    });
  });

  it('rechaza al rol auditor', async () => {
    const { create } = setup();

    await expect(
      create.execute(AUDITOR, { name: 'Sala 1', kind: 'production' }),
    ).rejects.toBeInstanceOf(UnauthorizedRoleError);
  });
});

describe('UpdateLocation', () => {
  it('renombra conservando el kind (copy-on-write)', async () => {
    const { create, update, repos } = setup();
    const location = await create.execute(ADMIN, { name: 'Sala 1', kind: 'production' });

    const updated = await update.execute(ADMIN, { id: location.id, name: 'Sala Norte' });

    expect(updated.name).toBe('Sala Norte');
    expect(updated.kind).toBe('production');
    expect(updated.id).toBe(location.id);
    expect(location.name).toBe('Sala 1'); // inmutable
    await expect(repos.locations.findById(location.id)).resolves.toBe(updated);
  });

  it('lanza NotFoundError si el lugar no existe', async () => {
    const { update } = setup();

    await expect(
      update.execute(ADMIN, { id: LocationId.create(), name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza al rol worker', async () => {
    const { create, update } = setup();
    const location = await create.execute(ADMIN, { name: 'Sala 1', kind: 'production' });

    await expect(update.execute(WORKER, { id: location.id, name: 'X' })).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'UpdateLocation',
    });
  });

  it('rechaza al rol auditor', async () => {
    const { create, update } = setup();
    const location = await create.execute(ADMIN, { name: 'Sala 1', kind: 'production' });

    await expect(update.execute(AUDITOR, { id: location.id })).rejects.toBeInstanceOf(
      UnauthorizedRoleError,
    );
  });
});

describe('GetLocation / ListLocations (roles A, Au)', () => {
  it('GetLocation devuelve el lugar para admin y auditor', async () => {
    const { create, get } = setup();
    const location = await create.execute(ADMIN, { name: 'Depósito', kind: 'storage' });

    await expect(get.execute(ADMIN, { id: location.id })).resolves.toBe(location);
    await expect(get.execute(AUDITOR, { id: location.id })).resolves.toBe(location);
  });

  it('GetLocation lanza NotFoundError si no existe', async () => {
    const { get } = setup();

    await expect(get.execute(ADMIN, { id: LocationId.create() })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('GetLocation rechaza al rol worker', async () => {
    const { create, get } = setup();
    const location = await create.execute(ADMIN, { name: 'Sala 1', kind: 'production' });

    await expect(get.execute(WORKER, { id: location.id })).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'GetLocation',
    });
  });

  it('ListLocations filtra por kind y admite al auditor', async () => {
    const { create, list } = setup();
    await create.execute(ADMIN, { name: 'Sala 1', kind: 'production' });
    await create.execute(ADMIN, { name: 'Depósito', kind: 'storage' });

    await expect(list.execute(ADMIN, {})).resolves.toHaveLength(2);
    await expect(list.execute(AUDITOR, { filter: { kind: 'storage' } })).resolves.toHaveLength(1);
  });

  it('ListLocations rechaza al rol worker', async () => {
    const { list } = setup();

    await expect(list.execute(WORKER, {})).rejects.toBeInstanceOf(UnauthorizedRoleError);
  });
});
