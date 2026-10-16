import { describe, expect, it } from 'vitest';

import {
  CreateMaterial,
  DeactivateMaterial,
  GetMaterial,
  IncompatibleUnitError,
  ListMaterials,
  MaterialId,
  NotFoundError,
  UnauthorizedRoleError,
  UpdateMaterial,
  WorkerId,
  type Actor,
  type CreateMaterialCommand,
} from '../../index';
import { collectingEventBus, inMemoryRepositories } from '../../testing';

const ADMIN: Actor = { workerId: WorkerId.from('admin-1'), role: 'admin' };
const WORKER: Actor = { workerId: WorkerId.from('worker-1'), role: 'worker' };
const AUDITOR: Actor = { workerId: WorkerId.from('auditor-1'), role: 'auditor' };

const SUPPLY: CreateMaterialCommand = {
  name: 'Harina',
  kind: 'supply',
  physicalState: 'solid',
  unitOfMeasure: 'kg',
};

function setup() {
  const repos = inMemoryRepositories();
  const events = collectingEventBus();
  return {
    repos,
    events,
    create: new CreateMaterial({ materials: repos.materials, events }),
    update: new UpdateMaterial({ materials: repos.materials, events }),
    deactivate: new DeactivateMaterial({ materials: repos.materials, events }),
    get: new GetMaterial({ materials: repos.materials }),
    list: new ListMaterials({ materials: repos.materials }),
  };
}

describe('CreateMaterial', () => {
  it('crea, persiste y emite material.created (rol admin)', async () => {
    const { create, repos, events } = setup();

    const material = await create.execute(ADMIN, SUPPLY);

    expect(material.name).toBe('Harina');
    expect(material.active).toBe(true);
    await expect(repos.materials.findById(material.id)).resolves.toBe(material);
    expect(events.events.map((event) => event.name)).toEqual(['material.created']);
  });

  it('rechaza una unidad incoherente con el estado físico (I6)', async () => {
    const { create } = setup();

    await expect(
      create.execute(ADMIN, { ...SUPPLY, name: 'Leche', physicalState: 'liquid' }),
    ).rejects.toBeInstanceOf(IncompatibleUnitError);
  });

  it('rechaza al rol worker', async () => {
    const { create } = setup();

    await expect(create.execute(WORKER, SUPPLY)).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      role: 'worker',
      useCase: 'CreateMaterial',
    });
  });

  it('rechaza al rol auditor', async () => {
    const { create } = setup();

    await expect(create.execute(AUDITOR, SUPPLY)).rejects.toBeInstanceOf(UnauthorizedRoleError);
  });
});

describe('UpdateMaterial', () => {
  it('actualiza nombre y unidad con copy-on-write y emite material.updated', async () => {
    const { create, update, repos, events } = setup();
    const material = await create.execute(ADMIN, SUPPLY);
    events.clear();

    const updated = await update.execute(ADMIN, {
      id: material.id,
      name: 'Harina 000',
      unitOfMeasure: 'g',
    });

    expect(updated.name).toBe('Harina 000');
    expect(updated.unitOfMeasure).toBe('g');
    expect(updated.id).toBe(material.id);
    expect(material.name).toBe('Harina'); // inmutable
    await expect(repos.materials.findById(material.id)).resolves.toBe(updated);
    expect(events.events.map((event) => event.name)).toEqual(['material.updated']);
  });

  it('lanza NotFoundError si el material no existe', async () => {
    const { update } = setup();

    await expect(
      update.execute(ADMIN, { id: MaterialId.create(), name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza un cambio de unidad incoherente con el estado físico (I6)', async () => {
    const { create, update } = setup();
    const material = await create.execute(ADMIN, SUPPLY);

    await expect(
      update.execute(ADMIN, { id: material.id, unitOfMeasure: 'l' }),
    ).rejects.toBeInstanceOf(IncompatibleUnitError);
  });

  it('rechaza al rol worker', async () => {
    const { create, update } = setup();
    const material = await create.execute(ADMIN, SUPPLY);

    await expect(update.execute(WORKER, { id: material.id, name: 'X' })).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'UpdateMaterial',
    });
  });

  it('rechaza al rol auditor', async () => {
    const { create, update } = setup();
    const material = await create.execute(ADMIN, SUPPLY);

    await expect(update.execute(AUDITOR, { id: material.id })).rejects.toBeInstanceOf(
      UnauthorizedRoleError,
    );
  });
});

describe('DeactivateMaterial', () => {
  it('da de baja (active = false) y emite material.updated', async () => {
    const { create, deactivate, repos, events } = setup();
    const material = await create.execute(ADMIN, SUPPLY);
    events.clear();

    const inactive = await deactivate.execute(ADMIN, { id: material.id });

    expect(inactive.active).toBe(false);
    await expect(repos.materials.findById(material.id)).resolves.toBe(inactive);
    expect(events.events.map((event) => event.name)).toEqual(['material.updated']);
  });

  it('es idempotente: repetir la baja no vuelve a emitir', async () => {
    const { create, deactivate, events } = setup();
    const material = await create.execute(ADMIN, SUPPLY);
    await deactivate.execute(ADMIN, { id: material.id });
    events.clear();

    const again = await deactivate.execute(ADMIN, { id: material.id });

    expect(again.active).toBe(false);
    expect(events.events).toHaveLength(0);
  });

  it('lanza NotFoundError si el material no existe', async () => {
    const { deactivate } = setup();

    await expect(deactivate.execute(ADMIN, { id: MaterialId.create() })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rechaza al rol worker', async () => {
    const { create, deactivate } = setup();
    const material = await create.execute(ADMIN, SUPPLY);

    await expect(deactivate.execute(WORKER, { id: material.id })).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'DeactivateMaterial',
    });
  });

  it('rechaza al rol auditor', async () => {
    const { create, deactivate } = setup();
    const material = await create.execute(ADMIN, SUPPLY);

    await expect(deactivate.execute(AUDITOR, { id: material.id })).rejects.toBeInstanceOf(
      UnauthorizedRoleError,
    );
  });
});

describe('GetMaterial / ListMaterials (roles A, Au)', () => {
  it('GetMaterial devuelve el material para admin y auditor', async () => {
    const { create, get } = setup();
    const material = await create.execute(ADMIN, SUPPLY);

    await expect(get.execute(ADMIN, { id: material.id })).resolves.toBe(material);
    await expect(get.execute(AUDITOR, { id: material.id })).resolves.toBe(material);
  });

  it('GetMaterial lanza NotFoundError si no existe', async () => {
    const { get } = setup();

    await expect(get.execute(ADMIN, { id: MaterialId.create() })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('GetMaterial rechaza al rol worker', async () => {
    const { create, get } = setup();
    const material = await create.execute(ADMIN, SUPPLY);

    await expect(get.execute(WORKER, { id: material.id })).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'GetMaterial',
    });
  });

  it('ListMaterials filtra por kind y admite al auditor', async () => {
    const { create, list } = setup();
    await create.execute(ADMIN, SUPPLY);
    await create.execute(ADMIN, {
      name: 'Agua',
      kind: 'supply',
      physicalState: 'liquid',
      unitOfMeasure: 'l',
    });
    await create.execute(ADMIN, {
      name: 'Caja',
      kind: 'product',
      physicalState: 'solid',
      unitOfMeasure: 'unit',
    });

    await expect(list.execute(ADMIN, {})).resolves.toHaveLength(3);
    await expect(list.execute(AUDITOR, { filter: { kind: 'supply' } })).resolves.toHaveLength(2);
    await expect(list.execute(AUDITOR, { filter: { kind: 'product' } })).resolves.toHaveLength(1);
  });

  it('ListMaterials rechaza al rol worker', async () => {
    const { list } = setup();

    await expect(list.execute(WORKER, {})).rejects.toBeInstanceOf(UnauthorizedRoleError);
  });
});
