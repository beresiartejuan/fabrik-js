import { describe, expect, it } from 'vitest';

import {
  Assignment,
  AssignmentId,
  Batch,
  BatchEvent,
  BatchEventId,
  BatchId,
  Location,
  LocationId,
  Machine,
  MachineId,
  Material,
  MaterialId,
  Quantity,
  Recipe,
  RecipeStep,
  StockMovement,
  TimeSlot,
  Worker,
  WorkerId,
  type AssignmentRepository,
  type BatchEventRepository,
  type BatchRepository,
  type LocationRepository,
  type MachineRepository,
  type MaterialRepository,
  type RecipeRepository,
  type Repositories,
  type StockMovementRepository,
  type UnitOfWork,
  type WorkerRepository,
} from '../index';
import {
  InMemoryAssignmentRepository,
  InMemoryBatchEventRepository,
  InMemoryBatchRepository,
  InMemoryLocationRepository,
  InMemoryMachineRepository,
  InMemoryMaterialRepository,
  InMemoryRecipeRepository,
  InMemoryStockMovementRepository,
  InMemoryUnitOfWork,
  InMemoryWorkerRepository,
  inMemoryRepositories,
} from '../testing';

const SUPPLY_ID = MaterialId.from('material-supply');
const PRODUCT_ID = MaterialId.from('material-product');
const OTHER_MATERIAL_ID = MaterialId.from('material-other');
const MACHINE_ID = MachineId.from('machine-1');
const LOCATION_ID = LocationId.from('location-1');
const WORKER_ID = WorkerId.from('worker-1');
const BATCH_EVENT_ID = BatchEventId.from('batch-event-1');

function supplyMaterial(): Material {
  return Material.create({
    name: 'Harina',
    kind: 'supply',
    physicalState: 'solid',
    unitOfMeasure: 'kg',
  });
}

function sampleRecipe(): Recipe {
  const step = RecipeStep.create({
    position: 1,
    machineType: 'mixer',
    inputs: [{ materialId: SUPPLY_ID, quantity: Quantity.create(2, 'kg') }],
    outputProductId: PRODUCT_ID,
    outputQuantity: Quantity.create(1, 'kg'),
  });
  return Recipe.create({
    name: 'Mezcla base',
    outputProductId: PRODUCT_ID,
    outputQuantity: Quantity.create(1, 'kg'),
    steps: [step],
  });
}

describe('Fakes in-memory satisfacen sus puertos', () => {
  it('cada fake es asignable al tipo de su interfaz', () => {
    const implementations: readonly object[] = [
      new InMemoryMaterialRepository() satisfies MaterialRepository,
      new InMemoryMachineRepository() satisfies MachineRepository,
      new InMemoryWorkerRepository() satisfies WorkerRepository,
      new InMemoryLocationRepository() satisfies LocationRepository,
      new InMemoryRecipeRepository() satisfies RecipeRepository,
      new InMemoryBatchRepository() satisfies BatchRepository,
      new InMemoryBatchEventRepository() satisfies BatchEventRepository,
      new InMemoryAssignmentRepository() satisfies AssignmentRepository,
      new InMemoryStockMovementRepository() satisfies StockMovementRepository,
    ];
    expect(implementations).toHaveLength(9);
  });

  it('inMemoryRepositories arma el agregado completo', () => {
    const repos: Repositories = inMemoryRepositories();
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
  });
});

describe('InMemoryMaterialRepository', () => {
  it('save + findById hacen round-trip y findById ausente devuelve null', async () => {
    const repo: MaterialRepository = new InMemoryMaterialRepository();
    const material = supplyMaterial();
    await repo.save(material);
    await expect(repo.findById(material.id)).resolves.toBe(material);
    await expect(repo.findById(MaterialId.create())).resolves.toBeNull();
  });

  it('save es upsert por id (no duplica)', async () => {
    const repo = new InMemoryMaterialRepository();
    const material = supplyMaterial();
    await repo.save(material);
    await repo.save(
      Material.fromPersistence({
        id: material.id,
        name: 'Harina 000',
        kind: material.kind,
        physicalState: material.physicalState,
        unitOfMeasure: material.unitOfMeasure,
      }),
    );
    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect((await repo.findById(material.id))?.name).toBe('Harina 000');
  });

  it('list filtra por kind y physicalState', async () => {
    const repo = new InMemoryMaterialRepository();
    await repo.save(supplyMaterial());
    await repo.save(
      Material.create({ name: 'Agua', kind: 'supply', physicalState: 'liquid', unitOfMeasure: 'l' }),
    );
    await repo.save(
      Material.create({ name: 'Caja', kind: 'product', physicalState: 'solid', unitOfMeasure: 'unit' }),
    );

    expect(await repo.list()).toHaveLength(3);
    expect(await repo.list({ kind: 'supply' })).toHaveLength(2);
    expect(await repo.list({ physicalState: 'solid' })).toHaveLength(2);
    expect(await repo.list({ kind: 'product', physicalState: 'solid' })).toHaveLength(1);
  });

  it('existsByName detecta nombres repetidos', async () => {
    const repo = new InMemoryMaterialRepository();
    await repo.save(supplyMaterial());
    await expect(repo.existsByName('Harina')).resolves.toBe(true);
    await expect(repo.existsByName('Inexistente')).resolves.toBe(false);
  });
});

describe('InMemoryMachineRepository', () => {
  it('save + findById y lista filtrada por lugar/estado/tipo', async () => {
    const repo: MachineRepository = new InMemoryMachineRepository();
    const machine = Machine.create({ name: 'Mezcladora', type: 'mixer', locationId: LOCATION_ID });
    await repo.save(machine);
    await repo.save(Machine.create({ name: 'Horno', type: 'oven', locationId: LocationId.from('l2') }));

    await expect(repo.findById(machine.id)).resolves.toBe(machine);
    expect(await repo.list()).toHaveLength(2);
    expect(await repo.list({ locationId: LOCATION_ID })).toHaveLength(1);
    expect(await repo.list({ type: 'oven' })).toHaveLength(1);

    await repo.save(machine.start());
    expect(await repo.list({ status: 'running' })).toHaveLength(1);
  });

  it('findById ausente devuelve null', async () => {
    const repo = new InMemoryMachineRepository();
    await expect(repo.findById(MachineId.create())).resolves.toBeNull();
  });
});

describe('InMemoryWorkerRepository', () => {
  it('save + findById y lista filtrada por rol/activo', async () => {
    const repo: WorkerRepository = new InMemoryWorkerRepository();
    const admin = Worker.create({ name: 'Ana', role: 'admin' });
    const worker = Worker.create({ name: 'Beto', role: 'worker' });
    await repo.save(admin);
    await repo.save(worker);
    await repo.save(worker.deactivate());

    await expect(repo.findById(admin.id)).resolves.toBe(admin);
    expect(await repo.list({ role: 'worker' })).toHaveLength(1);
    expect(await repo.list({ active: false })).toHaveLength(1);
    expect(await repo.list({ role: 'auditor' })).toHaveLength(0);
  });

  it('findById ausente devuelve null', async () => {
    const repo = new InMemoryWorkerRepository();
    await expect(repo.findById(WorkerId.create())).resolves.toBeNull();
  });
});

describe('InMemoryLocationRepository', () => {
  it('save + findById y lista filtrada por kind', async () => {
    const repo: LocationRepository = new InMemoryLocationRepository();
    const production = Location.create({ name: 'Sala 1', kind: 'production' });
    await repo.save(production);
    await repo.save(Location.create({ name: 'Depósito', kind: 'storage' }));

    await expect(repo.findById(production.id)).resolves.toBe(production);
    expect(await repo.list({ kind: 'production' })).toHaveLength(1);
    expect(await repo.list({ kind: 'storage' })).toHaveLength(1);
  });
});

describe('InMemoryRecipeRepository', () => {
  it('save + findById y lista filtrada por producto de salida', async () => {
    const repo: RecipeRepository = new InMemoryRecipeRepository();
    const recipe = sampleRecipe();
    await repo.save(recipe);
    await expect(repo.findById(recipe.id)).resolves.toBe(recipe);
    expect(await repo.list({ outputProductId: PRODUCT_ID })).toHaveLength(1);
    expect(await repo.list({ outputProductId: OTHER_MATERIAL_ID })).toHaveLength(0);
  });
});

describe('InMemoryBatchRepository', () => {
  it('save + findById, findByMaterial y list por estado', async () => {
    const repo: InMemoryBatchRepository = new InMemoryBatchRepository();
    const batch = Batch.create({ materialId: SUPPLY_ID, quantity: Quantity.create(5, 'kg') });
    await repo.save(batch);
    await repo.save(Batch.create({ materialId: PRODUCT_ID, quantity: Quantity.create(1, 'kg') }));

    await expect(repo.findById(batch.id)).resolves.toBe(batch);
    expect(await repo.findByMaterial(SUPPLY_ID)).toHaveLength(1);
    expect(await repo.list({ materialId: PRODUCT_ID })).toHaveLength(1);
    expect(await repo.list({ status: 'in_progress' })).toHaveLength(2);

    await repo.save(batch.complete());
    expect(await repo.list({ status: 'completed' })).toHaveLength(1);
  });

  it('list filtra por originBatchEventId (trazabilidad hacia adelante)', async () => {
    const repo = new InMemoryBatchRepository();
    const otherEventId = BatchEventId.from('batch-event-2');
    await repo.save(
      Batch.create({
        materialId: PRODUCT_ID,
        quantity: Quantity.create(1, 'kg'),
        originBatchEventId: BATCH_EVENT_ID,
      }),
    );
    await repo.save(
      Batch.create({
        materialId: PRODUCT_ID,
        quantity: Quantity.create(2, 'kg'),
        originBatchEventId: otherEventId,
      }),
    );
    await repo.save(Batch.create({ materialId: SUPPLY_ID, quantity: Quantity.create(5, 'kg') }));

    expect(await repo.list()).toHaveLength(3);
    const fromFirstEvent = await repo.list({ originBatchEventId: BATCH_EVENT_ID });
    expect(fromFirstEvent).toHaveLength(1);
    expect(fromFirstEvent[0]?.quantity.amount).toBe(1);
    expect(await repo.list({ originBatchEventId: otherEventId })).toHaveLength(1);
    expect(await repo.list({ originBatchEventId: BatchEventId.create() })).toHaveLength(0);
  });

  it('findById ausente devuelve null', async () => {
    const repo = new InMemoryBatchRepository();
    await expect(repo.findById(BatchId.create())).resolves.toBeNull();
  });
});

describe('InMemoryBatchEventRepository (append-only)', () => {
  const early = new Date('2026-05-01T10:00:00.000Z');
  const late = new Date('2026-05-02T10:00:00.000Z');

  function event(timestamp: Date): BatchEvent {
    return BatchEvent.create({
      machineId: MACHINE_ID,
      workerId: WORKER_ID,
      locationId: LOCATION_ID,
      inputs: [{ batchId: BatchId.create(), materialId: SUPPLY_ID, quantity: Quantity.create(1, 'kg') }],
      outputs: [{ materialId: PRODUCT_ID, quantity: Quantity.create(1, 'kg') }],
      timestamp,
    });
  }

  it('add + findById hacen round-trip', async () => {
    const repo: BatchEventRepository = new InMemoryBatchEventRepository();
    const first = event(early);
    await repo.add(first);
    await expect(repo.findById(first.id)).resolves.toBe(first);
    await expect(repo.findById(BatchEventId.create())).resolves.toBeNull();
  });

  it('listBy filtra por máquina y worker', async () => {
    const repo = new InMemoryBatchEventRepository();
    await repo.add(event(early));
    expect(await repo.listBy({ machineId: MACHINE_ID })).toHaveLength(1);
    expect(await repo.listBy({ workerId: WorkerId.create() })).toHaveLength(0);
  });

  it('listBy filtra por material (inputs u outputs)', async () => {
    const repo = new InMemoryBatchEventRepository();
    await repo.add(event(early));
    expect(await repo.listBy({ materialId: SUPPLY_ID })).toHaveLength(1);
    expect(await repo.listBy({ materialId: PRODUCT_ID })).toHaveLength(1);
    expect(await repo.listBy({ materialId: OTHER_MATERIAL_ID })).toHaveLength(0);
  });

  it('listBy filtra por rango de fechas inclusivo', async () => {
    const repo = new InMemoryBatchEventRepository();
    await repo.add(event(early));
    await repo.add(event(late));
    expect(await repo.listBy({ dateRange: { from: early } })).toHaveLength(2);
    expect(await repo.listBy({ dateRange: { from: new Date('2026-05-02') } })).toHaveLength(1);
    expect(await repo.listBy({ dateRange: { to: early } })).toHaveLength(1);
  });

  it('listByInputBatchId devuelve solo eventos que consumen ese batch en inputs', async () => {
    const repo = new InMemoryBatchEventRepository();
    const consumedBatch = BatchId.from('batch-consumed');
    const otherBatch = BatchId.from('batch-other');
    const consumer = BatchEvent.create({
      machineId: MACHINE_ID,
      workerId: WORKER_ID,
      locationId: LOCATION_ID,
      inputs: [
        { batchId: consumedBatch, materialId: SUPPLY_ID, quantity: Quantity.create(1, 'kg') },
        { batchId: otherBatch, materialId: OTHER_MATERIAL_ID, quantity: Quantity.create(2, 'kg') },
      ],
      outputs: [],
      timestamp: early,
    });
    const producer = BatchEvent.create({
      machineId: MACHINE_ID,
      workerId: WORKER_ID,
      locationId: LOCATION_ID,
      inputs: [],
      outputs: [
        { batchId: consumedBatch, materialId: PRODUCT_ID, quantity: Quantity.create(1, 'kg') },
      ],
      timestamp: late,
    });
    await repo.add(consumer);
    await repo.add(producer);

    await expect(repo.listByInputBatchId(consumedBatch)).resolves.toEqual([consumer]);
    await expect(repo.listByInputBatchId(otherBatch)).resolves.toEqual([consumer]);
    await expect(repo.listByInputBatchId(BatchId.from('batch-absent'))).resolves.toHaveLength(0);
  });
});

describe('InMemoryAssignmentRepository', () => {
  function assignment(workerId: WorkerId, machineId: MachineId, day: 1 | 2): Assignment {
    return Assignment.create({
      workerId,
      machineId,
      slot: TimeSlot.create([day], '08:00', '12:00'),
    });
  }

  it('save + consultas por worker y máquina', async () => {
    const repo: AssignmentRepository = new InMemoryAssignmentRepository();
    const first = assignment(WORKER_ID, MACHINE_ID, 1);
    await repo.save(first);
    await repo.save(assignment(WORKER_ID, MachineId.from('machine-2'), 2));
    await repo.save(assignment(WorkerId.from('worker-2'), MACHINE_ID, 1));

    await expect(repo.findById(first.id)).resolves.toBe(first);
    await expect(repo.findById(AssignmentId.create())).resolves.toBeNull();
    expect(await repo.findByWorker(WORKER_ID)).toHaveLength(2);
    expect(await repo.findByMachine(MACHINE_ID)).toHaveLength(2);
    await expect(repo.findByWorker(WorkerId.from('nobody'))).resolves.toHaveLength(0);
  });

  it('delete elimina por id', async () => {
    const repo = new InMemoryAssignmentRepository();
    const first = assignment(WORKER_ID, MACHINE_ID, 1);
    await repo.save(first);
    await repo.delete(first.id);
    await expect(repo.findByWorker(WORKER_ID)).resolves.toHaveLength(0);
  });
});

describe('InMemoryStockMovementRepository (append-only)', () => {
  const OTHER_LOCATION_ID = LocationId.from('location-2');

  function movement(
    locationId: LocationId,
    materialId: MaterialId,
    amount: number,
    reason: 'produced' | 'consumed',
  ): StockMovement {
    return StockMovement.create({
      locationId,
      materialId,
      delta: { amount, unit: 'kg' },
      reason,
      batchEventId: BATCH_EVENT_ID,
    });
  }

  async function seed(repo: StockMovementRepository): Promise<void> {
    await repo.add(movement(LOCATION_ID, SUPPLY_ID, 10, 'produced'));
    await repo.add(movement(LOCATION_ID, SUPPLY_ID, -3, 'consumed'));
    await repo.add(movement(LOCATION_ID, PRODUCT_ID, 5, 'produced'));
    await repo.add(movement(OTHER_LOCATION_ID, SUPPLY_ID, 7, 'produced'));
  }

  it('add + listByLocation (con y sin material)', async () => {
    const repo: StockMovementRepository = new InMemoryStockMovementRepository();
    await seed(repo);
    expect(await repo.listByLocation(LOCATION_ID)).toHaveLength(3);
    expect(await repo.listByLocation(LOCATION_ID, SUPPLY_ID)).toHaveLength(2);
    await expect(repo.listByLocation(OTHER_LOCATION_ID)).resolves.toHaveLength(1);
  });

  it('sumByLocationAndMaterial agrega deltas incluyendo negativos', async () => {
    const repo = new InMemoryStockMovementRepository();
    await seed(repo);
    await expect(repo.sumByLocationAndMaterial(LOCATION_ID, SUPPLY_ID)).resolves.toEqual({
      amount: 7,
      unit: 'kg',
    });
    await expect(repo.sumByLocationAndMaterial(LOCATION_ID, PRODUCT_ID)).resolves.toEqual({
      amount: 5,
      unit: 'kg',
    });
    await expect(repo.sumByLocationAndMaterial(OTHER_LOCATION_ID, SUPPLY_ID)).resolves.toEqual({
      amount: 7,
      unit: 'kg',
    });
  });

  it('sumByLocationAndMaterial devuelve null sin movimientos', async () => {
    const repo = new InMemoryStockMovementRepository();
    await expect(repo.sumByLocationAndMaterial(LOCATION_ID, SUPPLY_ID)).resolves.toBeNull();
  });

  it('add conserva el orden de inserción', async () => {
    const repo = new InMemoryStockMovementRepository();
    const first = movement(LOCATION_ID, SUPPLY_ID, 10, 'produced');
    const second = movement(LOCATION_ID, SUPPLY_ID, -3, 'consumed');
    await repo.add(first);
    await repo.add(second);
    await expect(repo.listByLocation(LOCATION_ID)).resolves.toEqual([first, second]);
  });
});

describe('InMemoryUnitOfWork', () => {
  it('run inyecta el agregado de repositorios y devuelve el resultado', async () => {
    const repos = inMemoryRepositories();
    const uow: UnitOfWork = new InMemoryUnitOfWork(repos);
    const material = supplyMaterial();

    const found = await uow.run(async (injected) => {
      await injected.materials.save(material);
      return injected.materials.findById(material.id);
    });

    expect(found).toBe(material);
    await expect(repos.materials.findById(material.id)).resolves.toBe(material);
  });

  it('run propaga los errores de la operación', async () => {
    const uow = new InMemoryUnitOfWork(inMemoryRepositories());
    await expect(
      uow.run(async () => {
        throw new Error('fallo de negocio');
      }),
    ).rejects.toThrow('fallo de negocio');
  });
});
