import { describe, expect, it } from 'vitest';

import {
  Assignment,
  Batch,
  BatchId,
  CompleteProduction,
  InactiveMachineError,
  InactiveWorkerError,
  IncompatibleUnitError,
  InvalidLocationKindError,
  InvalidStateTransitionError,
  InvalidTransformationError,
  Location,
  LocationId,
  Machine,
  MachineId,
  Material,
  MaterialId,
  MaterialKindMismatchError,
  NotAProductionOrderError,
  NotFoundError,
  Quantity,
  Recipe,
  RecipeId,
  RecipeStep,
  RecordTransformation,
  RegisterSupplyArrival,
  StartProduction,
  StoreBatch,
  TimeSlot,
  UnauthorizedRoleError,
  Worker,
  WorkerId,
  WorkerNotAssignedError,
  type Actor,
  type BatchCreated,
  type BatchStored,
  type BatchTransformed,
  type ProductionCompleted,
  type SupplyArrived,
} from '../../index';
import { collectingEventBus, inMemoryRepositories, InMemoryUnitOfWork } from '../../testing';

// 2026-01-05 es lunes (getDay() === 1).
const monday = (hour: number, minute = 0): Date => new Date(2026, 0, 5, hour, minute, 0, 0);

const ADMIN: Actor = { workerId: WorkerId.from('admin-1'), role: 'admin' };
const AUDITOR: Actor = { workerId: WorkerId.from('auditor-1'), role: 'auditor' };

async function seedFixture() {
  const repos = inMemoryRepositories();
  const events = collectingEventBus();
  const unitOfWork = new InMemoryUnitOfWork(repos);

  const aceite = Material.create({
    name: 'Aceite',
    kind: 'supply',
    physicalState: 'liquid',
    unitOfMeasure: 'l',
  });
  const sosa = Material.create({
    name: 'Sosa',
    kind: 'supply',
    physicalState: 'solid',
    unitOfMeasure: 'kg',
  });
  const mezcla = Material.create({
    name: 'Mezcla',
    kind: 'product',
    physicalState: 'liquid',
    unitOfMeasure: 'l',
  });
  const jabon = Material.create({
    name: 'Jabón',
    kind: 'product',
    physicalState: 'liquid',
    unitOfMeasure: 'l',
  });
  for (const material of [aceite, sosa, mezcla, jabon]) {
    await repos.materials.save(material);
  }

  const storage = Location.create({ name: 'Almacén', kind: 'storage' });
  const plant = Location.create({ name: 'Planta', kind: 'production' });
  await repos.locations.save(storage);
  await repos.locations.save(plant);

  const mixer = Machine.create({ name: 'Mezcladora', type: 'mixer', locationId: plant.id });
  const cooker = Machine.create({ name: 'Cocinera', type: 'cooker', locationId: plant.id });
  await repos.machines.save(mixer);
  await repos.machines.save(cooker);

  const juan = Worker.create({ name: 'Juan', role: 'worker' });
  await repos.workers.save(juan);

  const step1 = RecipeStep.create({
    position: 1,
    machineType: 'mixer',
    inputs: [
      { materialId: aceite.id, quantity: Quantity.create(5, 'l') },
      { materialId: sosa.id, quantity: Quantity.create(2, 'kg') },
    ],
    outputProductId: mezcla.id,
    outputQuantity: Quantity.create(7, 'l'),
  });
  const step2 = RecipeStep.create({
    position: 2,
    machineType: 'cooker',
    inputs: [{ materialId: mezcla.id, quantity: Quantity.create(7, 'l') }],
    outputProductId: jabon.id,
    outputQuantity: Quantity.create(10, 'l'),
  });
  const recipe = Recipe.create({
    name: 'Jabón líquido',
    outputProductId: jabon.id,
    outputQuantity: Quantity.create(10, 'l'),
    steps: [step1, step2],
  });
  await repos.recipes.save(recipe);

  // Juan opera la mezcladora de 08:00 a 12:00 y la cocinera de 12:00 a 18:00
  // (franjas adyacentes: no violan I1).
  await repos.assignments.save(
    Assignment.create({
      workerId: juan.id,
      machineId: mixer.id,
      slot: TimeSlot.create([1], '08:00', '12:00'),
    }),
  );
  await repos.assignments.save(
    Assignment.create({
      workerId: juan.id,
      machineId: cooker.id,
      slot: TimeSlot.create([1], '12:00', '18:00'),
    }),
  );

  const transactionalDeps = { unitOfWork, events };
  return {
    repos,
    events,
    aceite,
    sosa,
    mezcla,
    jabon,
    storage,
    plant,
    mixer,
    cooker,
    juan,
    recipe,
    step1,
    step2,
    registerSupply: new RegisterSupplyArrival(transactionalDeps),
    startProduction: new StartProduction({ recipes: repos.recipes, batches: repos.batches, events }),
    recordTransformation: new RecordTransformation(transactionalDeps),
    storeBatch: new StoreBatch(transactionalDeps),
    completeProduction: new CompleteProduction({ batches: repos.batches, events }),
  };
}

type Fixture = Awaited<ReturnType<typeof seedFixture>>;

const juanActor = (fixture: Fixture): Actor => ({ workerId: fixture.juan.id, role: 'worker' });

// Comando base de transformación del paso 1 sobre la mezcladora.
function stepOneCommand(
  fixture: Fixture,
  aceiteBatchId: BatchId,
  sosaBatchId: BatchId,
): Parameters<RecordTransformation['execute']>[1] {
  return {
    machineId: fixture.mixer.id,
    workerId: fixture.juan.id,
    recipeStepId: fixture.step1.id,
    inputs: [
      { batchId: aceiteBatchId, quantity: Quantity.create(5, 'l') },
      { batchId: sosaBatchId, quantity: Quantity.create(2, 'kg') },
    ],
    outputs: [{ materialId: fixture.mezcla.id, quantity: Quantity.create(7, 'l') }],
    observation: 'mezcla espesa',
    timestamp: monday(10),
  };
}

async function seedSupplies(fixture: Fixture): Promise<{ aceite: Batch; sosa: Batch }> {
  const aceite = await fixture.registerSupply.execute(ADMIN, {
    materialId: fixture.aceite.id,
    quantity: Quantity.create(5, 'l'),
    locationId: fixture.storage.id,
  });
  const sosa = await fixture.registerSupply.execute(ADMIN, {
    materialId: fixture.sosa.id,
    quantity: Quantity.create(2, 'kg'),
    locationId: fixture.storage.id,
  });
  return { aceite, sosa };
}

describe('flujo completo de producción (docs/03)', () => {
  it('suministro ×2 → inicio → paso 1 → almacenar → paso 2 → completar', async () => {
    const fixture = await seedFixture();
    const actorJuan = juanActor(fixture);

    // 1. Ingreso de suministros al almacén.
    const aceite = await fixture.registerSupply.execute(ADMIN, {
      materialId: fixture.aceite.id,
      quantity: Quantity.create(5, 'l'),
      locationId: fixture.storage.id,
    });
    const sosa = await fixture.registerSupply.execute(ADMIN, {
      materialId: fixture.sosa.id,
      quantity: Quantity.create(2, 'kg'),
      locationId: fixture.storage.id,
    });
    expect(aceite.status).toBe('stored');
    expect(sosa.status).toBe('stored');
    await expect(
      fixture.repos.stockMovements.sumByLocationAndMaterial(fixture.storage.id, fixture.aceite.id),
    ).resolves.toEqual({ amount: 5, unit: 'l' });

    // 2. Inicio de producción: lote raíz planificado.
    const root = await fixture.startProduction.execute(ADMIN, { recipeId: fixture.recipe.id });
    expect(root.status).toBe('in_progress');
    expect(root.materialId).toBe(fixture.jabon.id);
    expect(root.recipeId).toBe(fixture.recipe.id);
    expect(root.quantity.equals(Quantity.create(10, 'l'))).toBe(true);

    // 3. Paso 1: mezclar (consume aceite + sosa, produce mezcla).
    const event1 = await fixture.recordTransformation.execute(
      actorJuan,
      stepOneCommand(fixture, aceite.id, sosa.id),
    );
    expect(event1.inputs).toHaveLength(2);
    expect(event1.outputs).toHaveLength(1);
    expect(event1.observation).toBe('mezcla espesa');
    await expect(
      fixture.repos.stockMovements.sumByLocationAndMaterial(fixture.plant.id, fixture.aceite.id),
    ).resolves.toEqual({ amount: -5, unit: 'l' });

    const intermediate = (await fixture.repos.batches.list()).find(
      (batch) => batch.originBatchEventId === event1.id,
    );
    expect(intermediate?.status).toBe('in_progress');
    expect(intermediate?.materialId).toBe(fixture.mezcla.id);

    // 4. Almacenamiento intermedio.
    const stored = await fixture.storeBatch.execute(actorJuan, {
      batchId: intermediate!.id,
      locationId: fixture.storage.id,
    });
    expect(stored.status).toBe('stored');
    await expect(
      fixture.repos.stockMovements.sumByLocationAndMaterial(fixture.storage.id, fixture.mezcla.id),
    ).resolves.toEqual({ amount: 7, unit: 'l' });

    // 5. Paso 2: cocinar (consume mezcla, produce el jabón con merma: 9 l reales).
    const event2 = await fixture.recordTransformation.execute(actorJuan, {
      machineId: fixture.cooker.id,
      workerId: fixture.juan.id,
      recipeStepId: fixture.step2.id,
      inputs: [{ batchId: stored.id, quantity: Quantity.create(7, 'l') }],
      outputs: [{ materialId: fixture.jabon.id, quantity: Quantity.create(9, 'l') }],
      timestamp: monday(14),
    });
    const finalBatch = (await fixture.repos.batches.list()).find(
      (batch) => batch.originBatchEventId === event2.id,
    );
    expect(finalBatch?.quantity.equals(Quantity.create(9, 'l'))).toBe(true);

    // 6. Finalización de la orden (lote raíz).
    const completed = await fixture.completeProduction.execute(ADMIN, { batchId: root.id });
    expect(completed.status).toBe('completed');

    // Eventos emitidos, en orden.
    expect(fixture.events.events.map((event) => event.name)).toEqual([
      'supply.arrived',
      'supply.arrived',
      'batch.created',
      'batch.transformed',
      'batch.stored',
      'batch.transformed',
      'production.completed',
    ]);

    const supplyEvent = fixture.events.events[0] as SupplyArrived;
    expect(supplyEvent.payload.batchId).toBe(aceite.id);
    expect(supplyEvent.payload.materialId).toBe(fixture.aceite.id);
    expect(supplyEvent.payload.locationId).toBe(fixture.storage.id);

    const createdEvent = fixture.events.events[2] as BatchCreated;
    expect(createdEvent.payload.batchId).toBe(root.id);
    expect(createdEvent.payload.recipeId).toBe(fixture.recipe.id);

    const transformedEvent = fixture.events.events[3] as BatchTransformed;
    expect(transformedEvent.payload.eventId).toBe(event1.id);
    expect(transformedEvent.payload.machineId).toBe(fixture.mixer.id);
    expect(transformedEvent.payload.workerId).toBe(fixture.juan.id);
    expect(transformedEvent.payload.inputs).toHaveLength(2);
    expect(transformedEvent.payload.outputs[0]?.batchId).toBe(intermediate!.id);
    expect(transformedEvent.payload.observation).toBe('mezcla espesa');

    const storedEvent = fixture.events.events[4] as BatchStored;
    expect(storedEvent.payload.batchId).toBe(intermediate!.id);
    expect(storedEvent.payload.locationId).toBe(fixture.storage.id);

    const completedEvent = fixture.events.events[6] as ProductionCompleted;
    expect(completedEvent.payload.batchId).toBe(root.id);
    expect(completedEvent.payload.recipeId).toBe(fixture.recipe.id);

    // Repositorios actualizados.
    await expect(fixture.repos.batchEvents.listBy()).resolves.toHaveLength(2);
    await expect(fixture.repos.stockMovements.listByLocation(fixture.storage.id)).resolves.toHaveLength(3);
    await expect(fixture.repos.batches.list()).resolves.toHaveLength(5);
  });
});

describe('RegisterSupplyArrival', () => {
  it('crea el lote en stored + movimiento supply_in y emite supply.arrived', async () => {
    const fixture = await seedFixture();

    const batch = await fixture.registerSupply.execute(ADMIN, {
      materialId: fixture.aceite.id,
      quantity: Quantity.create(5, 'l'),
      locationId: fixture.storage.id,
    });

    expect(batch.status).toBe('stored');
    expect(batch.recipeId).toBeUndefined();
    const movements = await fixture.repos.stockMovements.listByLocation(fixture.storage.id);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ reason: 'supply_in', materialId: fixture.aceite.id });
    expect(movements[0].delta).toEqual({ amount: 5, unit: 'l' });
    expect(movements[0].batchEventId).toBeUndefined();
    expect(fixture.events.events.map((event) => event.name)).toEqual(['supply.arrived']);
  });

  it('admite al rol worker', async () => {
    const fixture = await seedFixture();

    await expect(
      fixture.registerSupply.execute(juanActor(fixture), {
        materialId: fixture.aceite.id,
        quantity: Quantity.create(1, 'l'),
        locationId: fixture.storage.id,
      }),
    ).resolves.toMatchObject({ status: 'stored' });
  });

  it('rechaza un material que no es supply', async () => {
    const fixture = await seedFixture();

    await expect(
      fixture.registerSupply.execute(ADMIN, {
        materialId: fixture.jabon.id,
        quantity: Quantity.create(1, 'l'),
        locationId: fixture.storage.id,
      }),
    ).rejects.toMatchObject({
      name: 'MaterialKindMismatchError',
      expected: 'supply',
      received: 'product',
    });
  });

  it('lanza NotFoundError si el material no existe', async () => {
    const fixture = await seedFixture();

    await expect(
      fixture.registerSupply.execute(ADMIN, {
        materialId: MaterialId.create(),
        quantity: Quantity.create(1, 'l'),
        locationId: fixture.storage.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lanza NotFoundError si el lugar no existe', async () => {
    const fixture = await seedFixture();

    await expect(
      fixture.registerSupply.execute(ADMIN, {
        materialId: fixture.aceite.id,
        quantity: Quantity.create(1, 'l'),
        locationId: LocationId.create(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza un lugar que no es de almacenamiento', async () => {
    const fixture = await seedFixture();

    await expect(
      fixture.registerSupply.execute(ADMIN, {
        materialId: fixture.aceite.id,
        quantity: Quantity.create(1, 'l'),
        locationId: fixture.plant.id,
      }),
    ).rejects.toBeInstanceOf(InvalidLocationKindError);
  });

  it('rechaza una cantidad en unidad incoherente con el material (I6)', async () => {
    const fixture = await seedFixture();

    await expect(
      fixture.registerSupply.execute(ADMIN, {
        materialId: fixture.aceite.id,
        quantity: Quantity.create(1, 'kg'),
        locationId: fixture.storage.id,
      }),
    ).rejects.toBeInstanceOf(IncompatibleUnitError);
  });

  it('rechaza al rol auditor', async () => {
    const fixture = await seedFixture();

    await expect(
      fixture.registerSupply.execute(AUDITOR, {
        materialId: fixture.aceite.id,
        quantity: Quantity.create(1, 'l'),
        locationId: fixture.storage.id,
      }),
    ).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'RegisterSupplyArrival',
    });
  });
});

describe('StartProduction', () => {
  it('crea el lote raíz in_progress con cantidad planificada y emite batch.created', async () => {
    const fixture = await seedFixture();

    const root = await fixture.startProduction.execute(ADMIN, { recipeId: fixture.recipe.id });

    expect(root.materialId).toBe(fixture.jabon.id);
    expect(root.recipeId).toBe(fixture.recipe.id);
    expect(root.quantity.equals(fixture.recipe.outputQuantity)).toBe(true);
    expect(root.status).toBe('in_progress');
    await expect(fixture.repos.batches.findById(root.id)).resolves.toBe(root);
    expect(fixture.events.events.map((event) => event.name)).toEqual(['batch.created']);
    expect((fixture.events.events[0] as BatchCreated).payload).toEqual({
      batchId: root.id,
      recipeId: fixture.recipe.id,
    });
  });

  it('lanza NotFoundError si la receta no existe', async () => {
    const fixture = await seedFixture();

    await expect(
      fixture.startProduction.execute(ADMIN, { recipeId: RecipeId.create() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza al rol worker', async () => {
    const fixture = await seedFixture();

    await expect(
      fixture.startProduction.execute(juanActor(fixture), { recipeId: fixture.recipe.id }),
    ).rejects.toMatchObject({ name: 'UnauthorizedRoleError', useCase: 'StartProduction' });
  });
});

describe('RecordTransformation', () => {
  it('registra el evento y descuenta el stock de los inputs con batchEventId', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);

    const event = await fixture.recordTransformation.execute(
      juanActor(fixture),
      stepOneCommand(fixture, aceite.id, sosa.id),
    );

    await expect(fixture.repos.batchEvents.findById(event.id)).resolves.toBe(event);
    const consumed = await fixture.repos.stockMovements.listByLocation(fixture.plant.id);
    expect(consumed).toHaveLength(2);
    for (const movement of consumed) {
      expect(movement.reason).toBe('consumed');
      expect(movement.batchEventId).toBe(event.id);
      expect(movement.delta.amount).toBeLessThan(0);
    }
    expect(fixture.events.events.at(-1)?.name).toBe('batch.transformed');
  });

  it('rechaza a un administrador (los admins no operan máquinas)', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);
    const command = stepOneCommand(fixture, aceite.id, sosa.id);

    await expect(
      fixture.recordTransformation.execute({ ...ADMIN }, { ...command, workerId: fixture.juan.id }),
    ).rejects.toMatchObject({ name: 'UnauthorizedRoleError', useCase: 'RecordTransformation' });
  });

  it('rechaza si el actor intenta registrar el evento de otro worker', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);
    const other = Worker.create({ name: 'Otro', role: 'worker' });
    await fixture.repos.workers.save(other);

    await expect(
      fixture.recordTransformation.execute(juanActor(fixture), {
        ...stepOneCommand(fixture, aceite.id, sosa.id),
        workerId: other.id,
      }),
    ).rejects.toMatchObject({ name: 'UnauthorizedRoleError', useCase: 'RecordTransformation' });
  });

  it('lanza NotFoundError si el worker no existe', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);
    const unknown = WorkerId.create();

    await expect(
      fixture.recordTransformation.execute(
        { workerId: unknown, role: 'worker' },
        { ...stepOneCommand(fixture, aceite.id, sosa.id), workerId: unknown },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza a un worker inactivo', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);
    const inactive = Worker.create({ name: 'Baja', role: 'worker' }).deactivate();
    await fixture.repos.workers.save(inactive);

    await expect(
      fixture.recordTransformation.execute(
        { workerId: inactive.id, role: 'worker' },
        { ...stepOneCommand(fixture, aceite.id, sosa.id), workerId: inactive.id },
      ),
    ).rejects.toBeInstanceOf(InactiveWorkerError);
  });

  it('lanza NotFoundError si la máquina no existe', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);

    await expect(
      fixture.recordTransformation.execute(juanActor(fixture), {
        ...stepOneCommand(fixture, aceite.id, sosa.id),
        machineId: MachineId.create(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza una máquina en mantenimiento', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);
    const broken = Machine.create({
      name: 'Rota',
      type: 'mixer',
      locationId: fixture.plant.id,
      status: 'maintenance',
    });
    await fixture.repos.machines.save(broken);
    await fixture.repos.assignments.save(
      Assignment.create({
        workerId: fixture.juan.id,
        machineId: broken.id,
        slot: TimeSlot.create([1], '08:00', '18:00'),
      }),
    );

    await expect(
      fixture.recordTransformation.execute(juanActor(fixture), {
        ...stepOneCommand(fixture, aceite.id, sosa.id),
        machineId: broken.id,
      }),
    ).rejects.toBeInstanceOf(InactiveMachineError);
  });

  it('rechaza al worker sin asignación a la máquina (I3)', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);
    const lonely = Worker.create({ name: 'Sin asignación', role: 'worker' });
    await fixture.repos.workers.save(lonely);

    await expect(
      fixture.recordTransformation.execute(
        { workerId: lonely.id, role: 'worker' },
        { ...stepOneCommand(fixture, aceite.id, sosa.id), workerId: lonely.id },
      ),
    ).rejects.toMatchObject({ name: 'WorkerNotAssignedError', machineId: fixture.mixer.id });
  });

  it('rechaza si la asignación es para otra máquina (I3)', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);

    // Juan está en la cocinera de 12:00 a 18:00; a las 10:00 no aplica.
    await expect(
      fixture.recordTransformation.execute(juanActor(fixture), {
        ...stepOneCommand(fixture, aceite.id, sosa.id),
        machineId: fixture.cooker.id,
      }),
    ).rejects.toBeInstanceOf(WorkerNotAssignedError);
  });

  it('rechaza fuera del horario asignado (I3, timestamp inyectado)', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);

    await expect(
      fixture.recordTransformation.execute(juanActor(fixture), {
        ...stepOneCommand(fixture, aceite.id, sosa.id),
        timestamp: monday(13),
      }),
    ).rejects.toBeInstanceOf(WorkerNotAssignedError);
  });

  it('lanza NotFoundError si un lote de input no existe', async () => {
    const fixture = await seedFixture();
    const { sosa } = await seedSupplies(fixture);

    await expect(
      fixture.recordTransformation.execute(juanActor(fixture), {
        ...stepOneCommand(fixture, BatchId.create(), sosa.id),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lanza NotFoundError si un material de output no existe', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);

    await expect(
      fixture.recordTransformation.execute(juanActor(fixture), {
        ...stepOneCommand(fixture, aceite.id, sosa.id),
        outputs: [{ materialId: MaterialId.create(), quantity: Quantity.create(1, 'l') }],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza un output con unidad incoherente con el material (I6)', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);

    await expect(
      fixture.recordTransformation.execute(juanActor(fixture), {
        ...stepOneCommand(fixture, aceite.id, sosa.id),
        outputs: [{ materialId: fixture.mezcla.id, quantity: Quantity.create(7, 'kg') }],
      }),
    ).rejects.toBeInstanceOf(IncompatibleUnitError);
  });

  it('rechaza un comando sin inputs ni outputs', async () => {
    const fixture = await seedFixture();

    await expect(
      fixture.recordTransformation.execute(juanActor(fixture), {
        ...stepOneCommand(fixture, BatchId.create(), BatchId.create()),
        inputs: [],
        outputs: [],
      }),
    ).rejects.toMatchObject({ name: 'InvalidTransformationError', reason: 'empty' });
  });

  it('acepta un comando con inputs pero sin outputs (no es vacío)', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);

    const event = await fixture.recordTransformation.execute(juanActor(fixture), {
      ...stepOneCommand(fixture, aceite.id, sosa.id),
      outputs: [],
    });

    expect(event.inputs).toHaveLength(2);
    expect(event.outputs).toHaveLength(0);
  });

  it('rechaza el mismo lote repetido en los inputs (doble consumo)', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);

    await expect(
      fixture.recordTransformation.execute(juanActor(fixture), {
        ...stepOneCommand(fixture, aceite.id, sosa.id),
        inputs: [
          { batchId: aceite.id, quantity: Quantity.create(3, 'l') },
          { batchId: aceite.id, quantity: Quantity.create(2, 'l') },
        ],
      }),
    ).rejects.toMatchObject({
      name: 'InvalidTransformationError',
      reason: 'duplicate-input',
      batchId: aceite.id,
    });
  });
});

describe('StoreBatch', () => {
  it('mueve el lote a stored y registra un movimiento produced con el batchEventId', async () => {
    const fixture = await seedFixture();
    const { aceite, sosa } = await seedSupplies(fixture);
    const event = await fixture.recordTransformation.execute(
      juanActor(fixture),
      stepOneCommand(fixture, aceite.id, sosa.id),
    );
    const intermediate = (await fixture.repos.batches.list()).find(
      (batch) => batch.originBatchEventId === event.id,
    )!;

    const stored = await fixture.storeBatch.execute(juanActor(fixture), {
      batchId: intermediate.id,
      locationId: fixture.storage.id,
    });

    expect(stored.status).toBe('stored');
    const movements = await fixture.repos.stockMovements.listByLocation(
      fixture.storage.id,
      fixture.mezcla.id,
    );
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ reason: 'produced', batchEventId: event.id });
    expect(movements[0].delta).toEqual({ amount: 7, unit: 'l' });
    expect(fixture.events.events.at(-1)?.name).toBe('batch.stored');
  });

  it('usa transfer_in cuando el lote no tiene evento de origen', async () => {
    const fixture = await seedFixture();
    const loose = Batch.create({
      materialId: fixture.aceite.id,
      quantity: Quantity.create(3, 'l'),
    });
    await fixture.repos.batches.save(loose);

    const stored = await fixture.storeBatch.execute(ADMIN, {
      batchId: loose.id,
      locationId: fixture.storage.id,
    });

    expect(stored.status).toBe('stored');
    const movements = await fixture.repos.stockMovements.listByLocation(
      fixture.storage.id,
      fixture.aceite.id,
    );
    expect(movements[0]).toMatchObject({ reason: 'transfer_in' });
    expect(movements[0].batchEventId).toBeUndefined();
  });

  it('lanza NotFoundError si el lote no existe', async () => {
    const fixture = await seedFixture();

    await expect(
      fixture.storeBatch.execute(ADMIN, { batchId: BatchId.create(), locationId: fixture.storage.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lanza NotFoundError si el lugar no existe', async () => {
    const fixture = await seedFixture();
    const loose = Batch.create({ materialId: fixture.aceite.id, quantity: Quantity.create(3, 'l') });
    await fixture.repos.batches.save(loose);

    await expect(
      fixture.storeBatch.execute(ADMIN, { batchId: loose.id, locationId: LocationId.create() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza almacenar en un lugar de producción', async () => {
    const fixture = await seedFixture();
    const loose = Batch.create({ materialId: fixture.aceite.id, quantity: Quantity.create(3, 'l') });
    await fixture.repos.batches.save(loose);

    await expect(
      fixture.storeBatch.execute(ADMIN, { batchId: loose.id, locationId: fixture.plant.id }),
    ).rejects.toBeInstanceOf(InvalidLocationKindError);
  });

  it('rechaza un lote que ya no está en proceso', async () => {
    const fixture = await seedFixture();
    const loose = Batch.create({ materialId: fixture.aceite.id, quantity: Quantity.create(3, 'l') });
    await fixture.repos.batches.save(loose);
    await fixture.storeBatch.execute(ADMIN, { batchId: loose.id, locationId: fixture.storage.id });

    await expect(
      fixture.storeBatch.execute(ADMIN, { batchId: loose.id, locationId: fixture.storage.id }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('rechaza al rol auditor', async () => {
    const fixture = await seedFixture();

    await expect(
      fixture.storeBatch.execute(AUDITOR, { batchId: BatchId.create(), locationId: fixture.storage.id }),
    ).rejects.toMatchObject({ name: 'UnauthorizedRoleError', useCase: 'StoreBatch' });
  });
});

describe('CompleteProduction', () => {
  it('completa la orden y emite production.completed', async () => {
    const fixture = await seedFixture();
    const root = await fixture.startProduction.execute(ADMIN, { recipeId: fixture.recipe.id });

    const completed = await fixture.completeProduction.execute(juanActor(fixture), {
      batchId: root.id,
    });

    expect(completed.status).toBe('completed');
    await expect(fixture.repos.batches.findById(root.id)).resolves.toBe(completed);
    expect(fixture.events.events.map((event) => event.name)).toEqual([
      'batch.created',
      'production.completed',
    ]);
    expect((fixture.events.events[1] as ProductionCompleted).payload).toEqual({
      batchId: root.id,
      recipeId: fixture.recipe.id,
    });
  });

  it('lanza NotFoundError si el lote no existe', async () => {
    const fixture = await seedFixture();

    await expect(
      fixture.completeProduction.execute(ADMIN, { batchId: BatchId.create() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza completar un lote ya completado', async () => {
    const fixture = await seedFixture();
    const root = await fixture.startProduction.execute(ADMIN, { recipeId: fixture.recipe.id });
    await fixture.completeProduction.execute(ADMIN, { batchId: root.id });

    await expect(
      fixture.completeProduction.execute(ADMIN, { batchId: root.id }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('rechaza completar un lote sin receta (no es orden de producción)', async () => {
    const fixture = await seedFixture();
    const supply = await fixture.registerSupply.execute(ADMIN, {
      materialId: fixture.aceite.id,
      quantity: Quantity.create(5, 'l'),
      locationId: fixture.storage.id,
    });

    await expect(
      fixture.completeProduction.execute(ADMIN, { batchId: supply.id }),
    ).rejects.toMatchObject({ name: 'NotAProductionOrderError', batchId: supply.id });
  });

  it('valida que es orden de producción antes de transicionar el estado', async () => {
    const fixture = await seedFixture();
    // Lote sin receta ya en estado final: antes se habría topado con la
    // transición inválida; la comprobación de orden corre primero.
    const done = Batch.fromPersistence({
      id: BatchId.create(),
      materialId: fixture.aceite.id,
      quantity: Quantity.create(5, 'l'),
      status: 'completed',
    });
    await fixture.repos.batches.save(done);

    await expect(
      fixture.completeProduction.execute(ADMIN, { batchId: done.id }),
    ).rejects.toBeInstanceOf(NotAProductionOrderError);
    // No se emitió ningún evento ni se re-guardó el lote.
    expect(fixture.events.events).toHaveLength(0);
  });

  it('rechaza al rol auditor', async () => {
    const fixture = await seedFixture();

    await expect(
      fixture.completeProduction.execute(AUDITOR, { batchId: BatchId.create() }),
    ).rejects.toMatchObject({ name: 'UnauthorizedRoleError', useCase: 'CompleteProduction' });
  });
});
