import { describe, expect, it } from 'vitest';

import {
  type Actor,
  CreateWorker,
  DeactivateWorker,
  GetWorker,
  ListWorkers,
  NotFoundError,
  UnauthorizedRoleError,
  UpdateWorker,
  WorkerId,
} from '../../index.js';
import { inMemoryRepositories } from '../../testing/index.js';

const ADMIN: Actor = { workerId: WorkerId.from('admin-1'), role: 'admin' };
const WORKER: Actor = { workerId: WorkerId.from('worker-1'), role: 'worker' };
const AUDITOR: Actor = { workerId: WorkerId.from('auditor-1'), role: 'auditor' };

function setup() {
  const repos = inMemoryRepositories();
  return {
    repos,
    create: new CreateWorker({ workers: repos.workers }),
    update: new UpdateWorker({ workers: repos.workers }),
    deactivate: new DeactivateWorker({ workers: repos.workers }),
    get: new GetWorker({ workers: repos.workers }),
    list: new ListWorkers({ workers: repos.workers }),
  };
}

describe('CreateWorker', () => {
  it('crea y persiste un trabajador activo (rol admin)', async () => {
    const { create, repos } = setup();

    const worker = await create.execute(ADMIN, { name: 'Beto', role: 'worker' });

    expect(worker.active).toBe(true);
    expect(worker.role).toBe('worker');
    await expect(repos.workers.findById(worker.id)).resolves.toBe(worker);
  });

  it('rechaza al rol worker', async () => {
    const { create } = setup();

    await expect(create.execute(WORKER, { name: 'X', role: 'worker' })).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      role: 'worker',
      useCase: 'CreateWorker',
    });
  });

  it('rechaza al rol auditor', async () => {
    const { create } = setup();

    await expect(create.execute(AUDITOR, { name: 'X', role: 'worker' })).rejects.toBeInstanceOf(
      UnauthorizedRoleError,
    );
  });
});

describe('UpdateWorker', () => {
  it('actualiza nombre y rol con copy-on-write', async () => {
    const { create, update, repos } = setup();
    const worker = await create.execute(ADMIN, { name: 'Beto', role: 'worker' });

    const updated = await update.execute(ADMIN, {
      id: worker.id,
      name: 'Alberto',
      role: 'auditor',
    });

    expect(updated.name).toBe('Alberto');
    expect(updated.role).toBe('auditor');
    expect(updated.id).toBe(worker.id);
    expect(worker.role).toBe('worker'); // inmutable
    await expect(repos.workers.findById(worker.id)).resolves.toBe(updated);
  });

  it('lanza NotFoundError si el trabajador no existe', async () => {
    const { update } = setup();

    await expect(
      update.execute(ADMIN, { id: WorkerId.create(), name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza al rol worker', async () => {
    const { create, update } = setup();
    const worker = await create.execute(ADMIN, { name: 'Beto', role: 'worker' });

    await expect(update.execute(WORKER, { id: worker.id, name: 'X' })).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'UpdateWorker',
    });
  });

  it('rechaza al rol auditor', async () => {
    const { create, update } = setup();
    const worker = await create.execute(ADMIN, { name: 'Beto', role: 'worker' });

    await expect(update.execute(AUDITOR, { id: worker.id })).rejects.toBeInstanceOf(
      UnauthorizedRoleError,
    );
  });
});

describe('DeactivateWorker', () => {
  it('da de baja al trabajador (idempotente)', async () => {
    const { create, deactivate, repos } = setup();
    const worker = await create.execute(ADMIN, { name: 'Beto', role: 'worker' });

    const inactive = await deactivate.execute(ADMIN, { id: worker.id });

    expect(inactive.active).toBe(false);
    await expect(repos.workers.findById(worker.id)).resolves.toBe(inactive);
    await expect(deactivate.execute(ADMIN, { id: worker.id })).resolves.toBe(inactive);
  });

  it('lanza NotFoundError si el trabajador no existe', async () => {
    const { deactivate } = setup();

    await expect(deactivate.execute(ADMIN, { id: WorkerId.create() })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rechaza al rol worker', async () => {
    const { create, deactivate } = setup();
    const worker = await create.execute(ADMIN, { name: 'Beto', role: 'worker' });

    await expect(deactivate.execute(WORKER, { id: worker.id })).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'DeactivateWorker',
    });
  });

  it('rechaza al rol auditor', async () => {
    const { create, deactivate } = setup();
    const worker = await create.execute(ADMIN, { name: 'Beto', role: 'worker' });

    await expect(deactivate.execute(AUDITOR, { id: worker.id })).rejects.toBeInstanceOf(
      UnauthorizedRoleError,
    );
  });
});

describe('GetWorker / ListWorkers (roles A, Au)', () => {
  it('GetWorker devuelve el trabajador para admin y auditor', async () => {
    const { create, get } = setup();
    const worker = await create.execute(ADMIN, { name: 'Beto', role: 'worker' });

    await expect(get.execute(ADMIN, { id: worker.id })).resolves.toBe(worker);
    await expect(get.execute(AUDITOR, { id: worker.id })).resolves.toBe(worker);
  });

  it('GetWorker lanza NotFoundError si no existe', async () => {
    const { get } = setup();

    await expect(get.execute(ADMIN, { id: WorkerId.create() })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('GetWorker rechaza al rol worker', async () => {
    const { create, get } = setup();
    const worker = await create.execute(ADMIN, { name: 'Beto', role: 'worker' });

    await expect(get.execute(WORKER, { id: worker.id })).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'GetWorker',
    });
  });

  it('ListWorkers filtra por rol y admite al auditor', async () => {
    const { create, list, deactivate } = setup();
    const beto = await create.execute(ADMIN, { name: 'Beto', role: 'worker' });
    await create.execute(ADMIN, { name: 'Ana', role: 'admin' });

    await expect(list.execute(ADMIN, {})).resolves.toHaveLength(2);
    await expect(list.execute(AUDITOR, { filter: { role: 'worker' } })).resolves.toHaveLength(1);

    await deactivate.execute(ADMIN, { id: beto.id });
    await expect(list.execute(ADMIN, { filter: { active: false } })).resolves.toHaveLength(1);
  });

  it('ListWorkers rechaza al rol worker', async () => {
    const { list } = setup();

    await expect(list.execute(WORKER, {})).rejects.toBeInstanceOf(UnauthorizedRoleError);
  });
});
