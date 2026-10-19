import {
  CompleteProduction,
  IncompatibleUnitError,
  LocationId,
  MachineId,
  Material,
  MaterialId,
  NotFoundError,
  Quantity,
  RecipeId,
  RecipeStepId,
  RecordTransformation,
  RegisterSupplyArrival,
  StartProduction,
  StoreBatch,
  UnauthorizedRoleError,
} from '@fabrik/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadDb } from '@/lib/api/demo/db';
import {
  clock,
  createDemoRegistry,
  type DemoActor,
  type DemoUseCases,
  demoActorFromWire,
  demoRegistry,
  toDomainActor,
} from '@/lib/api/demo/registry';
import { DEMO_SEED_IDS } from '@/lib/api/demo/seed';

/**
 * Registro del runtime DEMO: la composición de los 39 casos de uso (paridad de
 * `apps/api/src/domain/use-case.providers.ts`) sobre los repositorios demo, y el
 * flujo happy-path de producción de extremo a extremo, con los invariantes del
 * dominio actuando de verdad (sin atajos de fixtures).
 */

const ADMIN: DemoActor = { userId: DEMO_SEED_IDS.admin, role: 'admin' };
const OPERARIO: DemoActor = { userId: DEMO_SEED_IDS.operario, role: 'worker' };

/** Cantidad de casos de uso por grupo (paridad exacta del wiring del API). */
const GROUP_SIZES: Record<keyof DemoUseCases, number> = {
  materials: 5,
  locations: 4,
  machines: 5,
  workers: 5,
  recipes: 4,
  assignments: 4,
  production: 5,
  traceability: 7,
};

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('composición del registro', () => {
  it('construye los 39 casos de uso, agrupados como los módulos del API', () => {
    const registry = createDemoRegistry();
    expect(Object.keys(registry.useCases)).toEqual(Object.keys(GROUP_SIZES));

    const all: { clsName: string; key: string }[] = [];
    for (const [group, expected] of Object.entries(GROUP_SIZES)) {
      const cases = registry.useCases[group as keyof DemoUseCases];
      expect(Object.keys(cases)).toHaveLength(expected);
      for (const [key, instance] of Object.entries(cases)) {
        all.push({ clsName: Object.getPrototypeOf(instance).constructor.name, key });
      }
    }
    // Paridad exacta con los factory providers de apps/api (39 en total).
    expect(all).toHaveLength(39);
    expect(Object.keys(registry.useCases.production)).toEqual([
      'RegisterSupplyArrival',
      'StartProduction',
      'RecordTransformation',
      'StoreBatch',
      'CompleteProduction',
    ]);
    expect(Object.keys(registry.useCases.traceability)).toEqual([
      'TraceBatch',
      'TraceForward',
      'GetStockByLocation',
      'GetStockMovements',
      'ListBatchEvents',
      'GetBatch',
      'ListBatches',
    ]);
  });

  it('cada instancia es de la clase que declara su clave (execute listo para llamar)', () => {
    const registry = createDemoRegistry();
    expect(registry.useCases.production.RegisterSupplyArrival).toBeInstanceOf(
      RegisterSupplyArrival,
    );
    expect(registry.useCases.production.RecordTransformation).toBeInstanceOf(RecordTransformation);
    expect(registry.useCases.production.StoreBatch).toBeInstanceOf(StoreBatch);
    expect(registry.useCases.production.CompleteProduction).toBeInstanceOf(CompleteProduction);
    expect(registry.useCases.production.StartProduction).toBeInstanceOf(StartProduction);
  });

  it('expone los 9 repositorios + unidad de trabajo + bus de eventos', () => {
    const registry = createDemoRegistry();
    expect(Object.keys(registry.repos).sort()).toEqual([
      'assignments',
      'batchEvents',
      'batches',
      'locations',
      'machines',
      'materials',
      'recipes',
      'stockMovements',
      'workers',
    ]);
    expect(Object.keys(registry.useCases)).toHaveLength(Object.keys(GROUP_SIZES).length);
  });

  it('el registro compartido (singleton) sirve la misma instancia compuesta', () => {
    expect(demoRegistry.useCases.production.StoreBatch).toBeInstanceOf(StoreBatch);
    expect(Object.keys(demoRegistry.repos)).toHaveLength(9);
  });

  it('clock() es el reloj del navegador', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T08:30:00.000Z'));
    try {
      expect(clock()).toEqual(new Date('2026-10-19T08:30:00.000Z'));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('actores del demo', () => {
  it('toDomainActor deriva el Actor del dominio desde el actor demo', () => {
    expect(toDomainActor(ADMIN)).toEqual({ workerId: DEMO_SEED_IDS.admin, role: 'admin' });
    expect(toDomainActor(OPERARIO)).toEqual({
      workerId: DEMO_SEED_IDS.operario,
      role: 'worker',
    });
  });

  it('demoActorFromWire deriva el actor demo desde la respuesta de login/me', () => {
    const wire = { workerId: 'usr-auditor', role: 'auditor' } as const;
    const actor: DemoActor = demoActorFromWire(wire);
    expect(actor).toEqual({ userId: 'usr-auditor', role: 'auditor' });
    expect(toDomainActor(actor)).toEqual(wire);
  });
});

describe('flujo de producción end-to-end con use cases reales', () => {
  it('arrival → start → transform → store → transform → store → complete', async () => {
    const registry = createDemoRegistry();
    const admin = toDomainActor(ADMIN);
    const operario = toDomainActor(OPERARIO);

    // 1. Arribos de harina y agua al almacén (actor admin).
    const harinaBatch = await registry.useCases.production.RegisterSupplyArrival.execute(admin, {
      materialId: MaterialId.from(DEMO_SEED_IDS.harina),
      quantity: Quantity.create(2, 'kg'),
      locationId: LocationId.from(DEMO_SEED_IDS.almacen),
    });
    const aguaBatch = await registry.useCases.production.RegisterSupplyArrival.execute(admin, {
      materialId: MaterialId.from(DEMO_SEED_IDS.agua),
      quantity: Quantity.create(1, 'l'),
      locationId: LocationId.from(DEMO_SEED_IDS.almacen),
    });
    expect(harinaBatch.status).toBe('stored');
    expect(aguaBatch.status).toBe('stored');

    // 2. Inicio de la orden (solo admin): lote raíz con la cantidad planificada.
    const root = await registry.useCases.production.StartProduction.execute(admin, {
      recipeId: RecipeId.from(DEMO_SEED_IDS.panArtesanal),
    });
    expect(root.status).toBe('in_progress');
    expect(root.materialId).toBe(DEMO_SEED_IDS.pan);
    expect(root.quantity).toEqual(Quantity.create(1, 'unit'));
    expect(root.recipeId).toBe(DEMO_SEED_IDS.panArtesanal);

    // 3. Transformar es solo `worker`: un admin recibe el guard del dominio.
    await expect(
      registry.useCases.production.RecordTransformation.execute(admin, {
        machineId: MachineId.from(DEMO_SEED_IDS.mezcladora),
        workerId: operario.workerId,
        inputs: [],
        outputs: [],
      }),
    ).rejects.toBeInstanceOf(UnauthorizedRoleError);

    // Paso 1 con el operario: harina 2 kg + agua 1 l → masa 2 kg (mezcladora).
    const event1 = await registry.useCases.production.RecordTransformation.execute(operario, {
      machineId: MachineId.from(DEMO_SEED_IDS.mezcladora),
      workerId: operario.workerId,
      recipeStepId: RecipeStepId.from(DEMO_SEED_IDS.paso1),
      inputs: [
        { batchId: harinaBatch.id, quantity: Quantity.create(2, 'kg') },
        { batchId: aguaBatch.id, quantity: Quantity.create(1, 'l') },
      ],
      outputs: [
        { materialId: MaterialId.from(DEMO_SEED_IDS.masa), quantity: Quantity.create(2, 'kg') },
      ],
      observation: 'Mezclado del histórico',
    });
    expect(event1.recipeStepId).toBe(DEMO_SEED_IDS.paso1);
    expect(event1.inputs).toHaveLength(2);
    expect(event1.workerId).toBe(operario.workerId);
    expect(event1.machineId).toBe(DEMO_SEED_IDS.mezcladora);

    // Lectura de apoyo con paridad del ProductionController: los lotes de output
    // se resuelven con el filtro `originBatchEventId`.
    const [masaBatch] = await registry.useCases.traceability.ListBatches.execute(admin, {
      filter: { originBatchEventId: event1.id },
    });
    expect(masaBatch.status).toBe('in_progress');
    expect(masaBatch.originBatchEventId).toBe(event1.id);
    expect(masaBatch.materialId).toBe(DEMO_SEED_IDS.masa);

    // Invariante I6: un output con unidad incompatible con el material → error
    // del dominio (nada se escribe ni se publica).
    const publishedBeforeFailure = registry.events.published.length;
    await expect(
      registry.useCases.production.RecordTransformation.execute(operario, {
        machineId: MachineId.from(DEMO_SEED_IDS.mezcladora),
        workerId: operario.workerId,
        inputs: [],
        outputs: [
          { materialId: MaterialId.from(DEMO_SEED_IDS.masa), quantity: Quantity.create(2, 'l') },
        ],
      }),
    ).rejects.toBeInstanceOf(IncompatibleUnitError);
    expect(registry.events.published.length).toBe(publishedBeforeFailure);
    // Sin escritura: 2 arribos + lote raíz + la masa del paso 1 exitoso.
    expect(loadDb().batches).toHaveLength(4);

    // 4. Almacenar masa (actor operario, roles A/W).
    const storedMasa = await registry.useCases.production.StoreBatch.execute(operario, {
      batchId: masaBatch.id,
      locationId: LocationId.from(DEMO_SEED_IDS.almacen),
    });
    expect(storedMasa.status).toBe('stored');

    // 5. Paso 2 con el operario: masa 2 kg → 1 unidad de pan.
    const event2 = await registry.useCases.production.RecordTransformation.execute(operario, {
      machineId: MachineId.from(DEMO_SEED_IDS.mezcladora),
      workerId: operario.workerId,
      recipeStepId: RecipeStepId.from(DEMO_SEED_IDS.paso2),
      inputs: [{ batchId: masaBatch.id, quantity: Quantity.create(2, 'kg') }],
      outputs: [
        { materialId: MaterialId.from(DEMO_SEED_IDS.pan), quantity: Quantity.create(1, 'unit') },
      ],
      observation: 'Formado y horneado del histórico',
    });
    const [panBatch] = await registry.useCases.traceability.ListBatches.execute(admin, {
      filter: { originBatchEventId: event2.id },
    });
    const storedPan = await registry.useCases.production.StoreBatch.execute(operario, {
      batchId: panBatch.id,
      locationId: LocationId.from(DEMO_SEED_IDS.almacen),
    });
    expect(storedPan.status).toBe('stored');
    expect(storedPan.materialId).toBe(DEMO_SEED_IDS.pan);

    // 6. Cierre de la orden (actor admin) sobre el lote raíz.
    const completed = await registry.useCases.production.CompleteProduction.execute(admin, {
      batchId: root.id,
    });
    expect(completed.status).toBe('completed');

    // --- Estado final de la base -------------------------------------------------
    const data = loadDb();
    expect(data.batches).toHaveLength(5); // 2 arribos + raíz + masa + pan
    expect(data.batchEvents).toHaveLength(2);
    // 2 supply_in + 3 consumed (harina, agua, masa) + 2 produced (masa, pan):
    expect(data.stockMovements).toHaveLength(7);

    // Stock del almacén (GetStockByLocation): arribos sin salidas + outputs
    // almacenados por los StoreBatch.
    const stockAlmacen = await registry.useCases.traceability.GetStockByLocation.execute(admin, {
      locationId: LocationId.from(DEMO_SEED_IDS.almacen),
    });
    const byMaterial = new Map(stockAlmacen.map((entry) => [entry.materialId as string, entry]));
    expect(byMaterial.get(DEMO_SEED_IDS.harina)).toEqual({
      materialId: DEMO_SEED_IDS.harina,
      amount: 2,
      unit: 'kg',
    });
    expect(byMaterial.get(DEMO_SEED_IDS.agua)).toEqual({
      materialId: DEMO_SEED_IDS.agua,
      amount: 1,
      unit: 'l',
    });
    expect(byMaterial.get(DEMO_SEED_IDS.masa)).toEqual({
      materialId: DEMO_SEED_IDS.masa,
      amount: 2,
      unit: 'kg',
    });
    expect(byMaterial.get(DEMO_SEED_IDS.pan)).toEqual({
      materialId: DEMO_SEED_IDS.pan,
      amount: 1,
      unit: 'unit',
    });

    // Consumos: descuentos en el lugar de la máquina (paridad del comportamiento
    // real con I5 diferido — el stock consumido sale en la planta).
    const stockPlanta = await registry.useCases.traceability.GetStockByLocation.execute(admin, {
      locationId: LocationId.from(DEMO_SEED_IDS.produccion),
    });
    const plantaByMaterial = new Map(
      stockPlanta.map((entry) => [entry.materialId as string, entry]),
    );
    expect(plantaByMaterial.get(DEMO_SEED_IDS.harina)).toEqual({
      materialId: DEMO_SEED_IDS.harina,
      amount: -2,
      unit: 'kg',
    });
    expect(plantaByMaterial.get(DEMO_SEED_IDS.agua)).toEqual({
      materialId: DEMO_SEED_IDS.agua,
      amount: -1,
      unit: 'l',
    });

    // Movimientos en el almacén: orden de llegada (2 insumos, 2 producciones).
    const movements = await registry.useCases.traceability.GetStockMovements.execute(admin, {
      locationId: LocationId.from(DEMO_SEED_IDS.almacen),
    });
    expect(movements.map((movement) => movement.reason)).toEqual([
      'supply_in',
      'supply_in',
      'produced',
      'produced',
    ]);

    // Eventos de dominio publicados en el bus (inspección del registro).
    const published = registry.events.published.map((event) => event.name);
    expect(published).toContain('supply.arrived');
    expect(published).toContain('batch.created');
    expect(published).toContain('batch.transformed');
    expect(published).toContain('batch.stored');
    expect(published).toContain('production.completed');
  });

  it('los guardas de rol y los errores del dominio se mantienen con actores demo', async () => {
    const registry = createDemoRegistry();
    const admin = toDomainActor(ADMIN);
    const auditor = toDomainActor({ userId: DEMO_SEED_IDS.auditor, role: 'auditor' });

    // StartProduction es solo admin:
    await expect(
      registry.useCases.production.StartProduction.execute(auditor, {
        recipeId: RecipeId.from(DEMO_SEED_IDS.panArtesanal),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedRoleError);

    // Receta inexistente → NotFoundError del dominio (la capa de módulos la
    // mapeará a HTTP 404):
    await expect(
      registry.useCases.production.StartProduction.execute(admin, {
        recipeId: RecipeId.from('rec-nope'),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Sin datos, los reads no siembran nada por su cuenta (base vacía).
    expect(await registry.useCases.traceability.ListBatches.execute(admin, {})).toEqual([]);
    expect(
      await registry.useCases.traceability.GetStockByLocation.execute(admin, {
        locationId: LocationId.from(DEMO_SEED_IDS.almacen),
      }),
    ).toEqual([]);
  });

  it('el alta de una material dentro de la unidad de trabajo queda aplicada', async () => {
    const registry = createDemoRegistry();
    const result = await registry.unitOfWork.run(async (repos) => {
      await repos.materials.save(
        Material.create({
          name: 'Sal',
          kind: 'supply',
          physicalState: 'solid',
          unitOfMeasure: 'g',
        }),
      );
      return repos.materials.list();
    });
    expect(result.map((material) => material.name)).toContain('Sal');
  });
});
