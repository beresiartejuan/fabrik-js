import {
  Assignment,
  AssignmentId,
  type AssignmentRepository,
  Batch,
  BatchEvent,
  BatchEventId,
  BatchId,
  type BatchRepository,
  Location,
  LocationId,
  type LocationRepository,
  Machine,
  MachineId,
  type MachineRepository,
  Material,
  MaterialId,
  type MaterialRepository,
  Quantity,
  Recipe,
  RecipeId,
  type RecipeRepository,
  RecipeStepId,
  type Repositories,
  StockMovement,
  StockMovementId,
  type StockMovementRepository,
  TimeSlot,
  Worker,
  WorkerId,
  type WorkerRepository,
} from '@fabrik/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { loadDb, readRaw, saveDb } from '@/lib/api/demo/db';
import { recipeFromWire } from '@/lib/api/demo/mappers';
import {
  createDemoRepositories,
  DemoAssignmentRepository,
  DemoBatchEventRepository,
  DemoBatchRepository,
  DemoLocationRepository,
  DemoMachineRepository,
  DemoMaterialRepository,
  DemoRecipeRepository,
  DemoStockMovementRepository,
  DemoUnitOfWork,
  DemoWorkerRepository,
} from '@/lib/api/demo/repos';
import { buildSeed, DEMO_SEED_IDS } from '@/lib/api/demo/seed';

/**
 * Adaptadores de los 9 puertos sobre la base demo de `sessionStorage`: CRUD con
 * fidelidad de rehidratación (entidad → fila wire → entidad), write-through
 * inmediato, filtros con paridad del adaptador Drizzle y clonación profunda
 * (nada comparte referencias mutables entre llamadas).
 */

beforeEach(() => {
  window.sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// Entidades de prueba (ids legibles, como el seed)
// ---------------------------------------------------------------------------

function extraMaterial(props?: Partial<Parameters<typeof Material.create>[0]>): Material {
  return Material.fromPersistence({
    id: MaterialId.from('mat-test'),
    name: 'Levadura',
    description: 'Suministro de test',
    kind: 'supply',
    physicalState: 'solid',
    unitOfMeasure: 'g',
    active: true,
    ...props,
  });
}

describe('DemoMaterialRepository (MaterialRepository)', () => {
  it('es una implementación del puerto', () => {
    const repo: MaterialRepository = new DemoMaterialRepository();
    expect(repo).toBeInstanceOf(DemoMaterialRepository);
  });

  it('save + findById: roundtrip con rehidratación fiel', async () => {
    const repo: MaterialRepository = new DemoMaterialRepository();
    const material = extraMaterial();

    await repo.save(material);
    const loaded = await repo.findById(MaterialId.from('mat-test'));

    expect(loaded).toBeInstanceOf(Material);
    expect(loaded).toEqual(material);
    expect(loaded?.active).toBe(true);
  });

  it('findById desconocido → null (el NotFoundError lo lanza el use case)', async () => {
    const repo = new DemoMaterialRepository();
    expect(await repo.findById(MaterialId.from('mat-inexistente'))).toBeNull();
  });

  it('save es upsert: re-`save` del mismo id reemplaza la fila', async () => {
    const repo = new DemoMaterialRepository();
    await repo.save(extraMaterial());
    await repo.save(extraMaterial({ name: 'Levadura fresca' }));

    expect(loadDb().materials.filter((candidate) => candidate.id === 'mat-test')).toHaveLength(1);
    expect(await repo.findById(MaterialId.from('mat-test'))).toEqual(
      extraMaterial({ name: 'Levadura fresca' }),
    );
  });

  it('list con filtros kind/physicalState (paridad del adaptador Drizzle)', async () => {
    const repo: MaterialRepository = new DemoMaterialRepository();

    expect((await repo.list()).length).toBe(4); // solo el seed
    expect((await repo.list({ kind: 'supply' })).map((material) => material.id).sort()).toEqual([
      DEMO_SEED_IDS.agua,
      DEMO_SEED_IDS.harina,
    ]);
    expect((await repo.list({ kind: 'supply', physicalState: 'liquid' })).map((m) => m.id)).toEqual(
      [DEMO_SEED_IDS.agua],
    );
    expect((await repo.list({ kind: 'product', physicalState: 'solid' })).length).toBe(2);
    expect(await repo.list({ physicalState: 'gas' })).toEqual([]);
  });

  it('existsByName: unicidad de nombre (método opcional del puerto)', async () => {
    const repo = new DemoMaterialRepository();
    expect(await repo.existsByName('Harina')).toBe(true);
    expect(await repo.existsByName('Levadura')).toBe(false);

    await repo.save(extraMaterial());
    expect(await repo.existsByName('Levadura')).toBe(true);
  });

  it('write-through: la fila nueva queda persistida en el storage', async () => {
    const repo = new DemoMaterialRepository();
    await repo.save(extraMaterial());
    expect(readRaw()?.data.materials.filter((row) => row.id === 'mat-test')).toHaveLength(1);
  });
});

describe('DemoLocationRepository (LocationRepository)', () => {
  it('roundtrip + filtro por kind', async () => {
    const repo: LocationRepository = new DemoLocationRepository();
    const location = Location.fromPersistence({
      id: LocationId.from('loc-test'),
      name: 'Cámara de frío',
      kind: 'storage',
    });

    await repo.save(location);
    const loaded = await repo.findById(LocationId.from('loc-test'));
    expect(loaded).toEqual(location);
    expect(await repo.findById(LocationId.from('loc-nope'))).toBeNull();

    expect((await repo.list({ kind: 'storage' })).map((l) => l.id)).toContain('loc-test');
    expect((await repo.list({ kind: 'production' })).map((l) => l.id)).toEqual([
      DEMO_SEED_IDS.produccion,
    ]);
  });
});

describe('DemoMachineRepository (MachineRepository)', () => {
  it('roundtrip + list con filtros location/status/type', async () => {
    const repo: MachineRepository = new DemoMachineRepository();
    const machine = Machine.fromPersistence({
      id: MachineId.from('maq-test'),
      name: 'Horno',
      type: 'oven',
      locationId: LocationId.from(DEMO_SEED_IDS.produccion),
      status: 'running',
    });

    await repo.save(machine);
    const loaded = await repo.findById(MachineId.from('maq-test'));
    expect(loaded).toEqual(machine);
    expect(loaded?.status).toBe('running');

    expect((await repo.list({ type: 'oven' })).map((m) => m.id)).toEqual(['maq-test']);
    expect((await repo.list({ type: 'mixer' })).map((m) => m.id)).toEqual([
      DEMO_SEED_IDS.mezcladora,
    ]);
    expect((await repo.list({ status: 'running' })).map((m) => m.id)).toEqual(['maq-test']);
    expect((await repo.list({ status: 'idle' })).map((m) => m.id)).toEqual([
      DEMO_SEED_IDS.mezcladora,
    ]);
    expect((await repo.list({ locationId: LocationId.from(DEMO_SEED_IDS.almacen) })).length).toBe(
      0,
    );
    expect(
      (await repo.list({ locationId: LocationId.from(DEMO_SEED_IDS.produccion) })).length,
    ).toBe(2);
  });

  it('save de una entidad con transición (upsert) persiste el nuevo estado', async () => {
    const repo = new DemoMachineRepository();
    const machine = await repo.findById(MachineId.from(DEMO_SEED_IDS.mezcladora));
    expect(machine?.status).toBe('idle');
    const running = machine?.start() as Machine;
    await repo.save(running);
    expect((await repo.findById(MachineId.from(DEMO_SEED_IDS.mezcladora)))?.status).toBe('running');
  });
});

describe('DemoWorkerRepository (WorkerRepository)', () => {
  it('roundtrip + list con filtros role/active', async () => {
    const repo: WorkerRepository = new DemoWorkerRepository();
    const worker = Worker.fromPersistence({
      id: WorkerId.from('usr-test'),
      name: 'prueba',
      role: 'worker',
      active: true,
    });

    await repo.save(worker);
    expect(await repo.findById(WorkerId.from('usr-test'))).toEqual(worker);
    expect(await repo.findById(WorkerId.from('usr-nope'))).toBeNull();

    expect((await repo.list({ role: 'admin' })).map((w) => w.id)).toEqual([DEMO_SEED_IDS.admin]);
    expect((await repo.list({ active: true })).length).toBe(4);
    expect((await repo.list({ role: 'worker', active: true })).length).toBe(2);

    const deactivated = (await repo.findById(WorkerId.from('usr-test')))?.deactivate() as Worker;
    await repo.save(deactivated);
    expect((await repo.list({ active: false })).map((w) => w.id)).toEqual(['usr-test']);
  });
});

describe('DemoRecipeRepository (RecipeRepository)', () => {
  it('roundtrip: pasos rehidratados en orden y fidelidad con el seed', async () => {
    const repo: RecipeRepository = new DemoRecipeRepository();
    const seedRecipe = buildSeed().recipes[0];

    const recipe = await repo.findById(RecipeId.from(DEMO_SEED_IDS.panArtesanal));
    expect(recipe).toBeInstanceOf(Recipe);
    recipe?.steps.forEach((step, index) => {
      expect(step.position).toBe(index + 1);
    });
    expect(recipe?.name).toBe('Pan artesanal');
    expect(recipe?.steps).toEqual(recipeFromWire(seedRecipe).steps);
  });

  it('upsert: re guardar una receta modificada persiste el cambio', async () => {
    const repo: RecipeRepository = new DemoRecipeRepository();
    const recipe = (await repo.findById(RecipeId.from(DEMO_SEED_IDS.panArtesanal))) as Recipe;

    const renamed = Recipe.fromPersistence({
      id: recipe.id,
      name: 'Pan artesanal v2',
      outputProductId: recipe.outputProductId,
      outputQuantity: recipe.outputQuantity,
      steps: recipe.steps,
    });
    await repo.save(renamed);
    expect((await repo.findById(RecipeId.from(DEMO_SEED_IDS.panArtesanal)))?.name).toBe(
      'Pan artesanal v2',
    );
  });

  it('list con filtro por producto de salida', async () => {
    const repo = new DemoRecipeRepository();
    expect(
      (await repo.list({ outputProductId: MaterialId.from(DEMO_SEED_IDS.pan) })).map((r) => r.id),
    ).toEqual([DEMO_SEED_IDS.panArtesanal]);
    expect((await repo.list({ outputProductId: MaterialId.from(DEMO_SEED_IDS.masa) })).length).toBe(
      0,
    );
  });
});

describe('DemoAssignmentRepository (AssignmentRepository)', () => {
  it('save + findById + findByWorker + findByMachine', async () => {
    const repo = new DemoAssignmentRepository() satisfies AssignmentRepository;
    const assignment = Assignment.fromPersistence({
      id: AssignmentId.from('asg-test'),
      workerId: WorkerId.from(DEMO_SEED_IDS.auditor),
      machineId: MachineId.from(DEMO_SEED_IDS.mezcladora),
      slot: TimeSlot.create([1, 3], '08:00', '16:00'),
    });

    await repo.save(assignment);
    const loaded = await repo.findById(AssignmentId.from('asg-test'));
    expect(loaded).toEqual(assignment);
    expect(loaded?.slot.equals(TimeSlot.create([1, 3], '08:00', '16:00'))).toBe(true);

    expect(
      (await repo.findByWorker(WorkerId.from(DEMO_SEED_IDS.auditor))).map((a) => a.id),
    ).toEqual(['asg-test']);
    expect(
      (await repo.findByMachine(MachineId.from(DEMO_SEED_IDS.mezcladora))).map((a) => a.id),
    ).toEqual([DEMO_SEED_IDS.asignacionOperario, 'asg-test']);
    expect(await repo.findByWorker(WorkerId.from(DEMO_SEED_IDS.admin))).toEqual([]);
  });

  it('delete elimina la fila de verdad', async () => {
    const repo = new DemoAssignmentRepository();
    const seedId = DEMO_SEED_IDS.asignacionOperario;
    expect(await repo.findById(AssignmentId.from(seedId))).not.toBeNull();

    await repo.delete(AssignmentId.from(seedId));
    expect(await repo.findById(AssignmentId.from(seedId))).toBeNull();
    expect(loadDb().assignments).toEqual([]);
  });
});

describe('DemoBatchRepository (BatchRepository)', () => {
  const HARINA = MaterialId.from(DEMO_SEED_IDS.harina);

  function seedBatches(repo: BatchRepository): Promise<unknown> {
    // Tres lotes: un suministro stored, una orden in_progress y un lote
    // derivado de un evento (el filtro `originBatchEventId` de la API).
    return Promise.all([
      repo.save(
        Batch.fromPersistence({
          id: BatchId.from('bat-almacen'),
          materialId: HARINA,
          quantity: Quantity.create(2, 'kg'),
          status: 'stored',
        }),
      ),
      repo.save(
        Batch.fromPersistence({
          id: BatchId.from('bat-orden'),
          materialId: MaterialId.from(DEMO_SEED_IDS.pan),
          quantity: Quantity.create(1, 'unit'),
          recipeId: RecipeId.from(DEMO_SEED_IDS.panArtesanal),
          status: 'in_progress',
        }),
      ),
      repo.save(
        Batch.fromPersistence({
          id: BatchId.from('bat-derivado'),
          materialId: MaterialId.from(DEMO_SEED_IDS.masa),
          quantity: Quantity.create(2, 'kg'),
          originBatchEventId: BatchEventId.from('evt-1'),
          status: 'in_progress',
        }),
      ),
    ]);
  }

  it('implementa el puerto con el método opcional findByMaterial', async () => {
    const repo: BatchRepository = new DemoBatchRepository();
    expect(repo.findByMaterial).toBeTypeOf('function');
    await seedBatches(repo);
    // Atajo de `list({ materialId })` (misma lectura del adaptador Drizzle).
    const shortcut = await repo.findByMaterial?.(MaterialId.from(DEMO_SEED_IDS.masa));
    expect(shortcut?.map((batch) => batch.id)).toEqual(['bat-derivado']);
  });

  it('save + findById roundtrip (recipeId y originBatchEventId opcionales)', async () => {
    const repo: BatchRepository = new DemoBatchRepository();
    await seedBatches(repo);

    const stored = await repo.findById(BatchId.from('bat-almacen'));
    expect(stored).toEqual(
      Batch.fromPersistence({
        id: BatchId.from('bat-almacen'),
        materialId: HARINA,
        quantity: Quantity.create(2, 'kg'),
        status: 'stored',
      }),
    );
    // Opcionales rehidratados como ids del dominio:
    const derived = await repo.findById(BatchId.from('bat-derivado'));
    expect(derived?.originBatchEventId).toBe('evt-1');
    const order = await repo.findById(BatchId.from('bat-orden'));
    expect(order?.recipeId).toBe(DEMO_SEED_IDS.panArtesanal);
    expect(await repo.findById(BatchId.from('bat-nope'))).toBeNull();
  });

  it('list con filtro status: los tres estados usados por /produccion', async () => {
    const repo: BatchRepository = new DemoBatchRepository();
    await seedBatches(repo);

    expect((await repo.list({ status: 'stored' })).map((batch) => batch.id)).toEqual([
      'bat-almacen',
    ]);
    expect((await repo.list({ status: 'in_progress' })).map((batch) => batch.id).sort()).toEqual([
      'bat-derivado',
      'bat-orden',
    ]);
    expect(await repo.list({ status: 'completed' })).toEqual([]);
    expect((await repo.list()).length).toBe(3);
  });

  it('list con filtro originBatchEventId (lectura de apoyo del ProductionController)', async () => {
    const repo: BatchRepository = new DemoBatchRepository();
    await seedBatches(repo);

    const outputs = await repo.list({ originBatchEventId: BatchEventId.from('evt-1') });
    expect(outputs.map((batch) => batch.id)).toEqual(['bat-derivado']);
    expect(await repo.list({ originBatchEventId: BatchEventId.from('evt-otro') })).toEqual([]);
  });

  it('list combina filtros y persiste transiciones de estado (upsert)', async () => {
    const repo: BatchRepository = new DemoBatchRepository();
    await seedBatches(repo);

    expect((await repo.list({ materialId: HARINA, status: 'stored' })).length).toBe(1);
    const batch = (await repo.findById(BatchId.from('bat-almacen'))) as Batch;
    const resumed = batch.resume();
    await repo.save(resumed);
    expect(await repo.list({ status: 'stored' })).toEqual([]);
    expect(await repo.findById(BatchId.from('bat-almacen'))).toEqual(resumed);
  });
});

describe('DemoBatchEventRepository (BatchEventRepository, append-only)', () => {
  function buildEvent(
    id: string,
    props?: { timestamp?: Date; observation?: string; recipeStepId?: string },
  ): BatchEvent {
    return BatchEvent.fromPersistence({
      id: BatchEventId.from(id),
      machineId: MachineId.from(DEMO_SEED_IDS.mezcladora),
      workerId: WorkerId.from(DEMO_SEED_IDS.operario),
      locationId: LocationId.from(DEMO_SEED_IDS.produccion),
      ...(props?.recipeStepId ? { recipeStepId: RecipeStepId.from(props.recipeStepId) } : {}),
      inputs: [
        {
          batchId: BatchId.from('bat-harina'),
          materialId: MaterialId.from(DEMO_SEED_IDS.harina),
          quantity: Quantity.create(2, 'kg'),
        },
      ],
      outputs: [
        {
          materialId: MaterialId.from(DEMO_SEED_IDS.masa),
          quantity: Quantity.create(2, 'kg'),
        },
      ],
      ...(props?.observation ? { observation: props.observation } : {}),
      timestamp: props?.timestamp ?? new Date('2026-01-15T10:30:00.000Z'),
    });
  }

  it('add + findById con rehidratación fiel (cantidades, timestamp ISO)', async () => {
    const repo = new DemoBatchEventRepository();
    const event = buildEvent('evt-1', { observation: 'Mezcla', recipeStepId: DEMO_SEED_IDS.paso1 });

    await repo.add(event);
    const loaded = await repo.findById(BatchEventId.from('evt-1'));

    expect(loaded).toBeInstanceOf(BatchEvent);
    expect(loaded?.machineId).toBe(event.machineId);
    expect(loaded?.workerId).toBe(event.workerId);
    expect(loaded?.locationId).toBe(event.locationId);
    expect(loaded?.recipeStepId).toBe(DEMO_SEED_IDS.paso1);
    expect(loaded?.inputs).toEqual(event.inputs);
    expect(loaded?.outputs).toEqual(event.outputs);
    expect(loaded?.observation).toBe('Mezcla');
    expect(loaded?.timestamp).toEqual(new Date('2026-01-15T10:30:00.000Z'));
    // La fila persistida lleva el timestamp como ISO 8601 (wire).
    expect(readRaw()?.data.batchEvents[0].timestamp).toBe('2026-01-15T10:30:00.000Z');
  });

  it('add es idempotente por id (re-add reemplaza, como en Drizzle)', async () => {
    const repo = new DemoBatchEventRepository();
    await repo.add(buildEvent('evt-1'));
    await repo.add(buildEvent('evt-1', { observation: 'Re-intentado' }));

    expect(loadDb().batchEvents).toHaveLength(1);
    expect((await repo.findById(BatchEventId.from('evt-1')))?.observation).toBe('Re-intentado');
  });

  it('listBy filtra por machineId/workerId', async () => {
    const repo = new DemoBatchEventRepository();
    await repo.add(buildEvent('evt-1'));
    await repo.add(buildEvent('evt-2', { timestamp: new Date('2026-01-15T11:00:00.000Z') }));
    // Un evento en otra máquina/worker para que los filtros discriminen.
    await repo.add(
      BatchEvent.fromPersistence({
        id: BatchEventId.from('evt-otro'),
        machineId: MachineId.from('maq-otra'),
        workerId: WorkerId.from(DEMO_SEED_IDS.admin),
        locationId: LocationId.from(DEMO_SEED_IDS.produccion),
        inputs: [],
        outputs: [],
        timestamp: new Date('2026-01-15T09:00:00.000Z'),
      }),
    );

    expect((await repo.listBy()).length).toBe(3);
    expect(
      (await repo.listBy({ machineId: MachineId.from(DEMO_SEED_IDS.mezcladora) })).length,
    ).toBe(2);
    expect((await repo.listBy({ machineId: MachineId.from('maq-otra') })).map((e) => e.id)).toEqual(
      ['evt-otro'],
    );
    expect((await repo.listBy({ workerId: WorkerId.from(DEMO_SEED_IDS.admin) })).length).toBe(1);
  });

  it('listBy con materialId: matches en inputs O outputs', async () => {
    const repo = new DemoBatchEventRepository();
    await repo.add(buildEvent('evt-harina'));
    await repo.add(
      BatchEvent.fromPersistence({
        id: BatchEventId.from('evt-agua'),
        machineId: MachineId.from(DEMO_SEED_IDS.mezcladora),
        workerId: WorkerId.from(DEMO_SEED_IDS.operario),
        locationId: LocationId.from(DEMO_SEED_IDS.produccion),
        inputs: [],
        outputs: [
          {
            materialId: MaterialId.from(DEMO_SEED_IDS.agua),
            quantity: Quantity.create(1, 'l'),
          },
        ],
        timestamp: new Date('2026-01-15T11:00:00.000Z'),
      }),
    );

    const harinaEvents = await repo.listBy({ materialId: MaterialId.from(DEMO_SEED_IDS.harina) });
    expect(harinaEvents.map((event) => event.id)).toEqual(['evt-harina']);
    const aguaEvents = await repo.listBy({ materialId: MaterialId.from(DEMO_SEED_IDS.agua) });
    expect(aguaEvents.map((event) => event.id)).toEqual(['evt-agua']);
  });

  it('listBy con dateRange inclusivo [from, to]', async () => {
    const repo = new DemoBatchEventRepository();
    await repo.add(buildEvent('evt-1')); // 10:30
    await repo.add(buildEvent('evt-2', { timestamp: new Date('2026-01-15T12:00:00.000Z') }));

    expect(
      (
        await repo.listBy({
          dateRange: { from: new Date('2026-01-15T10:30:00.000Z') }, // borde inferior: incluido
        })
      ).length,
    ).toBe(2);
    expect(
      (
        await repo.listBy({
          dateRange: {
            from: new Date('2026-01-15T10:00:00.000Z'),
            to: new Date('2026-01-15T12:00:00.000Z'),
          },
        })
      ).length,
    ).toBe(2); // ambos extremos inclusivos (límites gte/lte de Drizzle)
    expect(
      (
        await repo.listBy({
          dateRange: { to: new Date('2026-01-15T10:00:00.000Z') },
        })
      ).length,
    ).toBe(0);
  });

  it('listByInputBatchId: eventos que consumen un lote (traza hacia adelante)', async () => {
    const repo = new DemoBatchEventRepository();
    await repo.add(buildEvent('evt-1'));
    const consumers = await repo.listByInputBatchId(BatchId.from('bat-harina'));
    expect(consumers.map((event) => event.id)).toEqual(['evt-1']);
    expect(await repo.listByInputBatchId(BatchId.from('bat-otro'))).toEqual([]);
  });
});

describe('DemoStockMovementRepository (StockMovementRepository, append-only)', () => {
  function buildMovement(
    id: string,
    props: {
      locationId: string;
      materialId: string;
      amount: number;
      unit: 'kg' | 'l';
      reason: StockMovement['reason'];
      batchEventId?: string;
    },
  ): StockMovement {
    return StockMovement.fromPersistence({
      id: StockMovementId.from(id),
      locationId: LocationId.from(props.locationId),
      materialId: MaterialId.from(props.materialId),
      delta: { amount: props.amount, unit: props.unit },
      reason: props.reason,
      ...(props.batchEventId ? { batchEventId: BatchEventId.from(props.batchEventId) } : {}),
      timestamp: new Date('2026-01-15T10:30:00.000Z'),
    });
  }

  it('add + listByLocation con filtro material opcional', async () => {
    const repo: StockMovementRepository = new DemoStockMovementRepository();
    await repo.add(
      buildMovement('mov-1', {
        locationId: DEMO_SEED_IDS.almacen,
        materialId: DEMO_SEED_IDS.harina,
        amount: 2,
        unit: 'kg',
        reason: 'supply_in',
      }),
    );
    await repo.add(
      buildMovement('mov-2', {
        locationId: DEMO_SEED_IDS.produccion,
        materialId: DEMO_SEED_IDS.harina,
        amount: -2,
        unit: 'kg',
        reason: 'consumed',
        batchEventId: 'evt-1',
      }),
    );

    const allAlmacen = await repo.listByLocation(LocationId.from(DEMO_SEED_IDS.almacen));
    expect(allAlmacen.map((movement) => movement.id)).toEqual(['mov-1']);
    expect(
      (
        await repo.listByLocation(
          LocationId.from(DEMO_SEED_IDS.almacen),
          MaterialId.from(DEMO_SEED_IDS.harina),
        )
      ).map((movement) => movement.id),
    ).toEqual(['mov-1']);
    expect(
      (
        await repo.listByLocation(
          LocationId.from(DEMO_SEED_IDS.almacen),
          MaterialId.from(DEMO_SEED_IDS.masa),
        )
      ).length,
    ).toBe(0);
  });

  it('sumByLocationAndMaterial: suma firmada con la unidad de la primera fila', async () => {
    const repo = new DemoStockMovementRepository();
    await repo.add(
      buildMovement('mov-1', {
        locationId: DEMO_SEED_IDS.almacen,
        materialId: DEMO_SEED_IDS.harina,
        amount: 10,
        unit: 'kg',
        reason: 'supply_in',
      }),
    );
    await repo.add(
      buildMovement('mov-2', {
        locationId: DEMO_SEED_IDS.almacen,
        materialId: DEMO_SEED_IDS.harina,
        amount: -3,
        unit: 'kg',
        reason: 'manual_adjustment',
      }),
    );

    const total = await repo.sumByLocationAndMaterial(
      LocationId.from(DEMO_SEED_IDS.almacen),
      MaterialId.from(DEMO_SEED_IDS.harina),
    );
    expect(total).toEqual({ amount: 7, unit: 'kg' });
    expect(
      await repo.sumByLocationAndMaterial(
        LocationId.from(DEMO_SEED_IDS.almacen),
        MaterialId.from(DEMO_SEED_IDS.masa),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unit of work
// ---------------------------------------------------------------------------

describe('DemoUnitOfWork', () => {
  it('run entrega a fn los 9 repositorios y propaga el resultado', async () => {
    const unitOfWork = new DemoUnitOfWork();
    const result = await unitOfWork.run<{ count: number }>(async (repos) => {
      expect(Object.keys(repos).sort()).toEqual([
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
      return { count: Object.keys(repos).length };
    });
    expect(result).toEqual({ count: 9 });
  });

  it('run con repositorios propios entrega exactamente esa instancia', async () => {
    const repos: Repositories = createDemoRepositories();
    const unitOfWork = new DemoUnitOfWork(repos);
    await unitOfWork.run(async (delivered) => {
      expect(delivered).toBe(repos);
      return null;
    });
  });

  it('errores de fn se propagan al llamador (sin rollback: decisión deliberada)', async () => {
    const unitOfWork = new DemoUnitOfWork();
    await expect(
      unitOfWork.run(async (repos) => {
        await repos.locations.save(
          Location.fromPersistence({
            id: LocationId.from('loc-parcial'),
            name: 'Escritura previa',
            kind: 'storage',
          }),
        );
        throw new Error('falla a mitad de unidad');
      }),
    ).rejects.toThrow('falla a mitad de unidad');
    // Comportamiento aceptado del demo: la escritura previa ya quedó aplicada.
    expect(loadDb().locations.map((location) => location.id)).toContain('loc-parcial');
  });
});

// ---------------------------------------------------------------------------
// Deep-clone: nada comparte referencias mutables entre llamadas
// ---------------------------------------------------------------------------

describe('clonación profunda de los adaptadores', () => {
  it('dos lecturas del mismo id devuelven instancias frescas (sin caché compartida)', async () => {
    const repo = new DemoMaterialRepository();
    const first = await repo.findById(MaterialId.from(DEMO_SEED_IDS.harina));
    const second = await repo.findById(MaterialId.from(DEMO_SEED_IDS.harina));
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it('mutar el array devuelto por list no corrompe el storage', async () => {
    const repo = new DemoMaterialRepository();
    const list = await repo.list();
    expect(list).toHaveLength(4);
    (list as unknown as Material[]).pop();
    expect(list).toHaveLength(3);
    expect(await repo.list()).toHaveLength(4);
  });

  it('mutar el objeto leído de saveDb en un consumidor no toca el storage (disciplina db.ts)', async () => {
    const repo = new DemoWorkerRepository();
    const worker = (await repo.findById(WorkerId.from(DEMO_SEED_IDS.admin))) as Worker;
    // Las entidades del dominio son congeladas: cualquier mutación directo al
    // objeto lanza (o es ignorada), y el storage queda íntegro.
    expect(Object.isFrozen(worker)).toBe(true);
    expect((await repo.list()).length).toBe(3);
  });

  it('las entidades rehidratadas están congeladas (entidades del dominio)', async () => {
    const repos = createDemoRepositories();
    const material = await repos.materials.findById(MaterialId.from(DEMO_SEED_IDS.harina));
    expect(Object.isFrozen(material)).toBe(true);
    const assignment = await repos.assignments.findById(
      AssignmentId.from(DEMO_SEED_IDS.asignacionOperario),
    );
    expect(Object.isFrozen(assignment)).toBe(true);
    expect(Object.isFrozen(assignment?.slot)).toBe(true);
  });

  it('roundtrip entidad → save → load → rehydrate es fiel, por puerto', async () => {
    // Material con descripción y flags:
    const materials = new DemoMaterialRepository();
    const material = Material.fromPersistence({
      id: MaterialId.from('mat-fidelidad'),
      name: 'Fidelidad',
      description: 'Fidelidad de test',
      kind: 'product',
      physicalState: 'liquid',
      unitOfMeasure: 'ml',
      active: true,
    });
    await materials.save(material);
    expect(await materials.findById(material.id)).toEqual(material);

    // Location:
    const locations = new DemoLocationRepository();
    const location = Location.fromPersistence({
      id: LocationId.from('loc-fidelidad'),
      name: 'Cámara',
      kind: 'storage',
    });
    await locations.save(location);
    expect(await locations.findById(location.id)).toEqual(location);

    // Machine con un estado distinto del default:
    const machines = new DemoMachineRepository();
    const machine = Machine.fromPersistence({
      id: MachineId.from('maq-fidelidad'),
      name: 'Horno',
      type: 'oven',
      locationId: LocationId.from(DEMO_SEED_IDS.produccion),
      status: 'maintenance',
    });
    await machines.save(machine);
    expect(await machines.findById(machine.id)).toEqual(machine);

    // Worker inactivo:
    const workers = new DemoWorkerRepository();
    const worker = Worker.fromPersistence({
      id: WorkerId.from('usr-fidelidad'),
      name: 'Fidelidad',
      role: 'worker',
      active: false,
    });
    await workers.save(worker);
    expect(await workers.findById(worker.id)).toEqual(worker);

    // Assignment con TimeSlot no trivial:
    const assignments = new DemoAssignmentRepository();
    const assignment = Assignment.fromPersistence({
      id: AssignmentId.from('asg-fidelidad'),
      workerId: WorkerId.from('usr-fidelidad'),
      machineId: MachineId.from(DEMO_SEED_IDS.mezcladora),
      slot: TimeSlot.create([0, 2, 4], '06:30', '12:00'),
    });
    await assignments.save(assignment);
    expect(await assignments.findById(assignment.id)).toEqual(assignment);
    expect((await assignments.findByWorker(assignment.workerId)).length).toBe(1);

    // Batch con los dos opcionales:
    const batches = new DemoBatchRepository();
    const batch = Batch.fromPersistence({
      id: BatchId.from('bat-fidelidad'),
      materialId: MaterialId.from(DEMO_SEED_IDS.masa),
      quantity: Quantity.create(2, 'kg'),
      recipeId: RecipeId.from(DEMO_SEED_IDS.panArtesanal),
      originBatchEventId: BatchEventId.from('evt-fidelidad'),
      status: 'stored',
    });
    await batches.save(batch);
    expect(await batches.findById(batch.id)).toEqual(batch);

    // BatchEvent con inputs y outputs:
    const events = new DemoBatchEventRepository();
    const event = BatchEvent.fromPersistence({
      id: BatchEventId.from('evt-fidelidad'),
      machineId: MachineId.from(DEMO_SEED_IDS.mezcladora),
      workerId: WorkerId.from(DEMO_SEED_IDS.operario),
      locationId: LocationId.from(DEMO_SEED_IDS.produccion),
      recipeStepId: RecipeStepId.from(DEMO_SEED_IDS.paso1),
      inputs: [
        {
          batchId: BatchId.from('bat-fidelidad'),
          materialId: MaterialId.from(DEMO_SEED_IDS.harina),
          quantity: Quantity.create(2, 'kg'),
        },
      ],
      outputs: [
        {
          materialId: MaterialId.from(DEMO_SEED_IDS.masa),
          quantity: Quantity.create(2, 'kg'),
        },
      ],
      observation: 'Fidelidad',
      timestamp: new Date('2026-03-10T08:00:00.000Z'),
    });
    await events.add(event);
    expect(await events.findById(event.id)).toEqual(event);

    // StockMovement con batchEventId y delta negativo:
    const movements = new DemoStockMovementRepository();
    const movement = StockMovement.fromPersistence({
      id: StockMovementId.from('mov-fidelidad'),
      locationId: LocationId.from(DEMO_SEED_IDS.produccion),
      materialId: MaterialId.from(DEMO_SEED_IDS.harina),
      delta: { amount: -2, unit: 'kg' },
      reason: 'consumed',
      batchEventId: BatchEventId.from('evt-fidelidad'),
      timestamp: new Date('2026-03-10T08:00:00.000Z'),
    });
    await movements.add(movement);
    expect(await movements.listByLocation(movement.locationId)).toEqual([movement]);

    // Receta del seed vía repositorio: la fidelidad la cubre el roundtrip de
    // `save`/`findById` del upsert de arriba (el seed es constante).
    const recipes = new DemoRecipeRepository();
    const recipe = (await recipes.findById(RecipeId.from(DEMO_SEED_IDS.panArtesanal))) as Recipe;
    await recipes.save(recipe);
    expect(await recipes.findById(recipe.id)).toEqual(recipe);
  });

  it('saveDb aplicado por el repositorio respeta el resto de la base', async () => {
    // Write-through de una colección no toca las otras (paridad Drizzle: los
    // upsets son por tabla).
    loadDb();
    const before = readRaw();
    const repo = new DemoMaterialRepository();
    await repo.save(extraMaterial());

    const after = readRaw();
    expect(after?.data.workers).toEqual(before?.data.workers);
    expect(after?.data.recipes).toEqual(before?.data.recipes);
    expect(after?.data.materials.length).toBe((before?.data.materials.length ?? 0) + 1);
  });

  it('saveDb directo del test refleja lo que después rehidrata el repo', async () => {
    // Sincronía repos ↔ db: `saveDb` (con rows de wire) es legible por `findById`.
    const data = loadDb();
    saveDb({
      ...data,
      materials: data.materials.filter((candidate) => candidate.id !== DEMO_SEED_IDS.agua),
    });
    const repo = new DemoMaterialRepository();
    expect(await repo.findById(MaterialId.from(DEMO_SEED_IDS.agua))).toBeNull();
    expect((await repo.list()).length).toBe(3);
  });
});
