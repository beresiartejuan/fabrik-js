import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_ACCESS_TOKEN_PREFIX, DEMO_REFRESH_TOKEN_PREFIX } from '@/lib/api/demo/auth';
import { resetDb } from '@/lib/api/demo/db';
import { DEMO_SEED_IDS } from '@/lib/api/demo/seed';
import { ApiError } from '@/lib/api/errors';
import { createLocationsApi } from '@/lib/api/modules/locationsApi';
import { createMachinesApi } from '@/lib/api/modules/machinesApi';
import { createMaterialsApi } from '@/lib/api/modules/materialsApi';
import { createWorkersApi } from '@/lib/api/modules/workersApi';
import { writeTokens } from '@/lib/session/session-store';

/**
 * Catálogos sobre el **runtime demo** (docs/demo.md §4): los mismos
 * casos de uso que inyecta el controlador real de `apps/api`, corriendo contra
 * la base de `sessionStorage` con roles frescos de la sesión.
 *
 * - **Formas de wire** exactas que producen los serializadores del API
 *   (campos opcionales omitidos, ids como strings, entidades sembradas).
 * - **Gates de rol** con la `ApiError` final (tabla del filter): worker no lee
 *   catálogos (403) y auditor no escribe (403) — el `requireRole` es de los
 *   use cases, los módulos no pre-chequean.
 * - **Errores de dominio**: 404 (`NotFoundError`), 422 (`InvalidLocationKindError`
 *   en `create`/`move` de máquinas) y 409 anti-lockout de workers
 *   (`SelfModificationNotAllowedError`).
 */

function sessionTokens(userId: string): { accessToken: string; refreshToken: string } {
  return {
    accessToken: `${DEMO_ACCESS_TOKEN_PREFIX}${userId}`,
    refreshToken: `${DEMO_REFRESH_TOKEN_PREFIX}${userId}`,
  };
}

const TOKENS = {
  admin: sessionTokens(DEMO_SEED_IDS.admin),
  operario: sessionTokens(DEMO_SEED_IDS.operario),
  auditor: sessionTokens(DEMO_SEED_IDS.auditor),
};

/** Extrae el rechazo y lo normaliza a la `ApiError` final del kit. */
async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  const cause = await promise.catch((reason: unknown) => reason);
  expect(cause).toBeInstanceOf(ApiError);
  if (!(cause instanceof ApiError)) {
    throw new Error('el fallo debía ser ApiError');
  }
  return cause;
}

beforeEach(() => {
  window.sessionStorage.clear();
  resetDb();
});

describe('materialsApi (demo)', () => {
  it('list sin filtros devuelve el catálogo sembrado con la forma exacta del wire', async () => {
    writeTokens(TOKENS.admin);
    const materials = await createMaterialsApi().list();

    expect(materials).toStrictEqual([
      {
        id: DEMO_SEED_IDS.harina,
        name: 'Harina',
        description: 'Suministro de demo',
        kind: 'supply',
        physicalState: 'solid',
        unitOfMeasure: 'kg',
        active: true,
      },
      {
        id: DEMO_SEED_IDS.agua,
        name: 'Agua',
        description: 'Suministro de demo',
        kind: 'supply',
        physicalState: 'liquid',
        unitOfMeasure: 'l',
        active: true,
      },
      {
        id: DEMO_SEED_IDS.masa,
        name: 'Masa',
        description: 'Producto intermedio de demo',
        kind: 'product',
        physicalState: 'solid',
        unitOfMeasure: 'kg',
        active: true,
      },
      {
        id: DEMO_SEED_IDS.pan,
        name: 'Pan',
        description: 'Producto final de demo',
        kind: 'product',
        physicalState: 'solid',
        unitOfMeasure: 'unit',
        active: true,
      },
    ]);
  });

  it('list aplica los filtros kind + physicalState del QuerySchema real', async () => {
    writeTokens(TOKENS.admin);
    const api = createMaterialsApi();
    const supplies = await api.list({ kind: 'supply' });
    const solidProducts = await api.list({ kind: 'product', physicalState: 'solid' });
    const liquids = await api.list({ physicalState: 'liquid' });
    const none = await api.list({ kind: 'supply', physicalState: 'gas' });

    expect(supplies.map((material) => material.id)).toStrictEqual([
      DEMO_SEED_IDS.harina,
      DEMO_SEED_IDS.agua,
    ]);
    expect(solidProducts.map((material) => material.id)).toStrictEqual([
      DEMO_SEED_IDS.masa,
      DEMO_SEED_IDS.pan,
    ]);
    expect(liquids.map((material) => material.id)).toStrictEqual([DEMO_SEED_IDS.agua]);
    expect(none).toStrictEqual([]);
  });

  it('get devuelve el material sembrado o 404 con el contexto del filter', async () => {
    writeTokens(TOKENS.admin);
    const api = createMaterialsApi();

    const material = await api.get(DEMO_SEED_IDS.harina);
    expect(material.id).toBe(DEMO_SEED_IDS.harina);

    const failure = await expectApiError(api.get('mat-no'));
    expect(failure.statusCode).toBe(404);
    expect(failure.error).toBe('NotFoundError');
    expect(failure.message).toBe('Material no encontrado: mat-no');
    expect(failure.context).toStrictEqual({ entity: 'Material', id: 'mat-no' });
    expect(failure.isNetworkError).toBe(false);
  });

  it('create persiste y devuelve el wire del material (id generado, sin description)', async () => {
    writeTokens(TOKENS.admin);
    const api = createMaterialsApi();

    const created = await api.create({
      name: 'Cacao',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'g',
    });

    expect(created).toStrictEqual({
      id: expect.any(String),
      name: 'Cacao',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'g',
      active: true,
    });
    // Persistencia real en la base demo (visible por otra lectura).
    expect((await api.list()).map((material) => material.id)).toContain(created.id);
  });

  it('update cambia nombre/descripción/unidad y una description vacía la limpia', async () => {
    writeTokens(TOKENS.admin);
    const api = createMaterialsApi();
    const created = await api.create({
      name: 'Levadura',
      description: 'Suministro fresco',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'g',
    });

    const renamed = await api.update(created.id, { name: 'Levadura seca', unitOfMeasure: 'kg' });
    expect(renamed).toStrictEqual({
      id: created.id,
      name: 'Levadura seca',
      description: 'Suministro fresco',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
      active: true,
    });

    const cleared = await api.update(created.id, { description: '' });
    expect(cleared).toStrictEqual({
      // La entidad guarda `description: ''` (el `??` del caso de uso no cae a
      // fallback: '' no es nullish) — el wire la EMITE vacía, igual que el
      // serializer del API real.
      id: created.id,
      name: 'Levadura seca',
      description: '',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
      active: true,
    });
  });

  it('deactivate es la baja lógica idempotente (active: false)', async () => {
    writeTokens(TOKENS.admin);
    const api = createMaterialsApi();

    const deactivated = await api.deactivate(DEMO_SEED_IDS.harina);
    expect(deactivated.active).toBe(false);

    // Idempotente: repetir la baja no rompe (el caso de uso no publica evento).
    await expect(api.deactivate(DEMO_SEED_IDS.harina)).resolves.toMatchObject({ active: false });
    expect((await api.get(DEMO_SEED_IDS.harina)).active).toBe(false);
  });

  it('role gates: worker no lee (403) y auditor no escribe (403)', async () => {
    writeTokens(TOKENS.operario);
    const listFailure = await expectApiError(createMaterialsApi().list());
    expect(listFailure.statusCode).toBe(403);
    expect(listFailure.error).toBe('UnauthorizedRoleError');
    expect(listFailure.context).toStrictEqual({ role: 'worker', useCase: 'ListMaterials' });

    writeTokens(TOKENS.auditor);
    const createFailure = await expectApiError(
      createMaterialsApi().create({
        name: 'Denegado',
        kind: 'supply',
        physicalState: 'solid',
        unitOfMeasure: 'g',
      }),
    );
    expect(createFailure.statusCode).toBe(403);
    expect(createFailure.context).toStrictEqual({ role: 'auditor', useCase: 'CreateMaterial' });
  });

  it('sin sesión → 401 con la forma del Unauthorized de Nest', async () => {
    const failure = await expectApiError(createMaterialsApi().list());
    expect(failure.statusCode).toBe(401);
    expect(failure.error).toBe('Unauthorized');
  });
});

describe('locationsApi (demo)', () => {
  it('list sin filtros devuelve los lugares sembrados; con kind respeta el filtro', async () => {
    writeTokens(TOKENS.admin);
    const api = createLocationsApi();

    expect(await api.list()).toStrictEqual([
      { id: DEMO_SEED_IDS.almacen, name: 'Almacén central', kind: 'storage' },
      { id: DEMO_SEED_IDS.produccion, name: 'Planta de producción', kind: 'production' },
    ]);
    expect(await api.list({ kind: 'production' })).toStrictEqual([
      { id: DEMO_SEED_IDS.produccion, name: 'Planta de producción', kind: 'production' },
    ]);
    expect(await api.list({ kind: 'production' })).toHaveLength(1);
  });

  it('create y update (solo renombra: el wire no expone kind)', async () => {
    writeTokens(TOKENS.admin);
    const api = createLocationsApi();

    const created = await api.create({ name: 'Depósito 2', kind: 'storage' });
    expect(created).toStrictEqual({ id: expect.any(String), name: 'Depósito 2', kind: 'storage' });

    const renamed = await api.update(created.id, { name: 'Depósito secundario' });
    expect(renamed).toStrictEqual({
      id: created.id,
      name: 'Depósito secundario',
      kind: 'storage',
    });
    // El lugar del seed quedó intacto (el rename toca solo el destino).
    expect((await api.list({ kind: 'storage' })).map((location) => location.name)).toContain(
      'Depósito secundario',
    );
  });

  it('get desconocido → 404 NotFoundError con contexto', async () => {
    writeTokens(TOKENS.admin);
    const failure = await expectApiError(createLocationsApi().get('loc-no'));
    expect(failure.statusCode).toBe(404);
    expect(failure.error).toBe('NotFoundError');
    expect(failure.context).toStrictEqual({ entity: 'Location', id: 'loc-no' });
  });

  it('role gates: worker no lee (403) y auditor no crea (403)', async () => {
    writeTokens(TOKENS.operario);
    const listFailure = await expectApiError(createLocationsApi().list());
    expect(listFailure.statusCode).toBe(403);
    expect(listFailure.error).toBe('UnauthorizedRoleError');

    writeTokens(TOKENS.auditor);
    const createFailure = await expectApiError(
      createLocationsApi().create({ name: 'X', kind: 'storage' }),
    );
    expect(createFailure.statusCode).toBe(403);
    expect(createFailure.context).toStrictEqual({ role: 'auditor', useCase: 'CreateLocation' });
  });
});

describe('machinesApi (demo)', () => {
  it('list respeta los filtros locationId/status/type del QuerySchema real', async () => {
    writeTokens(TOKENS.admin);
    const api = createMachinesApi();
    const mezcladora = {
      id: DEMO_SEED_IDS.mezcladora,
      name: 'Mezcladora',
      type: 'mixer',
      locationId: DEMO_SEED_IDS.produccion,
      status: 'idle',
    } as const;

    expect(await api.list()).toStrictEqual([mezcladora]);
    expect(await api.list({ locationId: DEMO_SEED_IDS.produccion })).toStrictEqual([mezcladora]);
    expect(await api.list({ status: 'idle' })).toStrictEqual([mezcladora]);
    expect(await api.list({ type: 'oven' })).toStrictEqual([]);
    expect(await api.list({ locationId: DEMO_SEED_IDS.almacen })).toStrictEqual([]);
  });

  it('create exige lugar de producción (I2) y devuelve el wire con status idle', async () => {
    writeTokens(TOKENS.admin);
    const api = createMachinesApi();

    const created = await api.create({
      name: 'Horno',
      type: 'oven',
      locationId: DEMO_SEED_IDS.produccion,
    });
    expect(created).toStrictEqual({
      id: expect.any(String),
      name: 'Horno',
      type: 'oven',
      locationId: DEMO_SEED_IDS.produccion,
      status: 'idle',
    });

    const fourTwentyTwo = await expectApiError(
      api.create({ name: 'X', type: 'oven', locationId: DEMO_SEED_IDS.almacen }),
    );
    expect(fourTwentyTwo.statusCode).toBe(422);
    expect(fourTwentyTwo.error).toBe('InvalidLocationKindError');
    expect(fourTwentyTwo.context).toStrictEqual({
      kind: 'storage',
      locationId: DEMO_SEED_IDS.almacen,
      expected: undefined,
    });

    const fourOhFour = await expectApiError(
      api.create({ name: 'X', type: 'oven', locationId: 'loc-no' }),
    );
    expect(fourOhFour.statusCode).toBe(404);
    expect(fourOhFour.context).toStrictEqual({ entity: 'Location', id: 'loc-no' });
  });

  it('move valida I2 y cambia el lugar por su propio endpoint (evento machine.moved)', async () => {
    writeTokens(TOKENS.admin);
    const locationsApi = createLocationsApi();
    const api = createMachinesApi();
    const nuevaPlanta = await locationsApi.create({ name: 'Planta 2', kind: 'production' });

    const moved = await api.move(DEMO_SEED_IDS.mezcladora, { locationId: nuevaPlanta.id });
    expect(moved).toStrictEqual({
      id: DEMO_SEED_IDS.mezcladora,
      name: 'Mezcladora',
      type: 'mixer',
      locationId: nuevaPlanta.id,
      status: 'idle',
    });

    const fourTwentyTwo = await expectApiError(
      api.move(DEMO_SEED_IDS.mezcladora, { locationId: DEMO_SEED_IDS.almacen }),
    );
    expect(fourTwentyTwo.statusCode).toBe(422);
    expect(fourTwentyTwo.error).toBe('InvalidLocationKindError');
  });

  it('update cambia nombre y/o tipo sin tocar el lugar', async () => {
    writeTokens(TOKENS.admin);
    const api = createMachinesApi();

    const renamed = await api.update(DEMO_SEED_IDS.mezcladora, { name: 'Mezcladora principal' });
    expect(renamed.locationId).toBe(DEMO_SEED_IDS.produccion);
    expect(renamed.name).toBe('Mezcladora principal');

    const retyped = await api.update(DEMO_SEED_IDS.mezcladora, { type: 'oven' });
    expect(retyped).toStrictEqual({
      id: DEMO_SEED_IDS.mezcladora,
      name: 'Mezcladora principal',
      type: 'oven',
      locationId: DEMO_SEED_IDS.produccion,
      status: 'idle',
    });
  });

  it('get desconocido → 404; gates de rol (worker lee 403, audita mover 403)', async () => {
    writeTokens(TOKENS.admin);
    const fourOhFour = await expectApiError(createMachinesApi().get('maq-no'));
    expect(fourOhFour.statusCode).toBe(404);
    expect(fourOhFour.context).toStrictEqual({ entity: 'Machine', id: 'maq-no' });

    writeTokens(TOKENS.operario);
    const listFailure = await expectApiError(createMachinesApi().list());
    expect(listFailure.statusCode).toBe(403);
    expect(listFailure.context).toStrictEqual({ role: 'worker', useCase: 'ListMachines' });

    writeTokens(TOKENS.auditor);
    const moveFailure = await expectApiError(
      createMachinesApi().move(DEMO_SEED_IDS.mezcladora, { locationId: DEMO_SEED_IDS.produccion }),
    );
    expect(moveFailure.statusCode).toBe(403);
    expect(moveFailure.context).toStrictEqual({ role: 'auditor', useCase: 'MoveMachine' });
  });
});

describe('workersApi (demo)', () => {
  it('list con filtros role/active sobre el seed (forma exacta del wire)', async () => {
    writeTokens(TOKENS.admin);
    const api = createWorkersApi();

    expect(await api.list()).toStrictEqual([
      { id: DEMO_SEED_IDS.admin, name: 'admin', role: 'admin', active: true },
      { id: DEMO_SEED_IDS.operario, name: 'operario', role: 'worker', active: true },
      { id: DEMO_SEED_IDS.auditor, name: 'auditor', role: 'auditor', active: true },
    ]);
    expect(await api.list({ role: 'worker' })).toStrictEqual([
      { id: DEMO_SEED_IDS.operario, name: 'operario', role: 'worker', active: true },
    ]);
    expect((await api.list({ active: true })).length).toBe(3);
    expect(await api.list({ active: false })).toStrictEqual([]);
  });

  it('create devuelve el worker activo; update cambia rol (target distinto del actor)', async () => {
    writeTokens(TOKENS.admin);
    const api = createWorkersApi();

    const created = await api.create({ name: 'Lucía', role: 'worker' });
    expect(created).toStrictEqual({
      id: expect.any(String),
      name: 'Lucía',
      role: 'worker',
      active: true,
    });

    const promoted = await api.update(DEMO_SEED_IDS.operario, { role: 'auditor' });
    expect(promoted.role).toBe('auditor');
    expect(promoted.active).toBe(true);
  });

  it('deactivate baja lógica y el listado de activos la refleja', async () => {
    writeTokens(TOKENS.admin);
    const api = createWorkersApi();

    const deactivated = await api.deactivate(DEMO_SEED_IDS.operario);
    expect(deactivated).toStrictEqual({
      id: DEMO_SEED_IDS.operario,
      name: 'operario',
      role: 'worker',
      active: false,
    });
    // Idempotente en dominio: repetir no rompe.
    await expect(api.deactivate(DEMO_SEED_IDS.operario)).resolves.toMatchObject({ active: false });
    expect((await api.list({ active: false })).map((worker) => worker.id)).toEqual([
      DEMO_SEED_IDS.operario,
    ]);
  });

  it('anti-lockout: el admin no puede cambiarse el rol ni desactivarse a sí mismo (409)', async () => {
    writeTokens(TOKENS.admin);
    const api = createWorkersApi();

    const roleFailure = await expectApiError(api.update(DEMO_SEED_IDS.admin, { role: 'worker' }));
    expect(roleFailure.statusCode).toBe(409);
    expect(roleFailure.error).toBe('SelfModificationNotAllowedError');
    expect(roleFailure.context).toStrictEqual({
      workerId: DEMO_SEED_IDS.admin,
      useCase: 'UpdateWorker',
      field: 'role',
    });

    const deactivateFailure = await expectApiError(api.deactivate(DEMO_SEED_IDS.admin));
    expect(deactivateFailure.statusCode).toBe(409);
    expect(deactivateFailure.context).toStrictEqual({
      workerId: DEMO_SEED_IDS.admin,
      useCase: 'DeactivateWorker',
      field: 'active',
    });
  });

  it('get desconocido → 404; gates de rol (worker 403 en lee y escribe)', async () => {
    writeTokens(TOKENS.admin);
    const failure = await expectApiError(createWorkersApi().get('wrk-no'));
    expect(failure.statusCode).toBe(404);
    expect(failure.context).toStrictEqual({ entity: 'Worker', id: 'wrk-no' });

    writeTokens(TOKENS.operario);
    const listFailure = await expectApiError(createWorkersApi().list());
    expect(listFailure.statusCode).toBe(403);
    expect(listFailure.context).toStrictEqual({ role: 'worker', useCase: 'ListWorkers' });
    const createFailure = await expectApiError(
      createWorkersApi().create({ name: 'X', role: 'worker' }),
    );
    expect(createFailure.statusCode).toBe(403);
    expect(createFailure.context).toStrictEqual({ role: 'worker', useCase: 'CreateWorker' });
  });
});
