import { describe, expect, it } from 'vitest';

import {
  Batch,
  BatchEvent,
  BatchEventId,
  BatchId,
  GetStockByLocation,
  GetStockMovements,
  ListBatchEvents,
  Location,
  LocationId,
  MachineId,
  Material,
  NotFoundError,
  Quantity,
  StockMovement,
  TraceBatch,
  TraceForward,
  WorkerId,
  type Actor,
} from '../../index';
import { inMemoryRepositories } from '../../testing';

const ADMIN: Actor = { workerId: WorkerId.from('admin-1'), role: 'admin' };
const AUDITOR: Actor = { workerId: WorkerId.from('auditor-1'), role: 'auditor' };
const WORKER: Actor = { workerId: WorkerId.from('worker-1'), role: 'worker' };

const M1 = MachineId.from('machine-1');
const M2 = MachineId.from('machine-2');
const PLANT = LocationId.from('location-plant');
const JUAN = WorkerId.from('worker-juan');
const ANA = WorkerId.from('worker-ana');

const T1 = new Date('2026-05-01T08:00:00.000Z');
const T2 = new Date('2026-05-01T12:00:00.000Z');
const T3 = new Date('2026-05-02T09:00:00.000Z');

function traceFixture() {
  const repos = inMemoryRepositories();
  return {
    repos,
    traceBatch: new TraceBatch({ batches: repos.batches, batchEvents: repos.batchEvents }),
    traceForward: new TraceForward({ batches: repos.batches, batchEvents: repos.batchEvents }),
    getStockByLocation: new GetStockByLocation({
      locations: repos.locations,
      materials: repos.materials,
      stockMovements: repos.stockMovements,
    }),
    getStockMovements: new GetStockMovements({
      locations: repos.locations,
      stockMovements: repos.stockMovements,
    }),
    listBatchEvents: new ListBatchEvents({ batchEvents: repos.batchEvents }),
  };
}

type Fixture = ReturnType<typeof traceFixture>;

function supply(name: string, unit: 'kg' | 'l'): Material {
  return Material.create({
    name,
    kind: 'supply',
    physicalState: unit === 'kg' ? 'solid' : 'liquid',
    unitOfMeasure: unit,
  });
}

function product(name: string, unit: 'kg' | 'l'): Material {
  return Material.create({
    name,
    kind: 'product',
    physicalState: unit === 'kg' ? 'solid' : 'liquid',
    unitOfMeasure: unit,
  });
}

/**
 * Genealogía del ejemplo de docs/03: aceite + sosa --E1(mezcla)--> mezcla cruda
 * --E2(cocinado)--> jabón final. Devuelve los lotes y eventos del grafo.
 */
async function seedGenealogy(fixture: Fixture) {
  const aceite = supply('Aceite', 'l');
  const sosa = supply('Sosa', 'kg');
  const mezcla = product('Mezcla', 'l');
  const jabon = product('Jabón', 'l');
  for (const material of [aceite, sosa, mezcla, jabon]) {
    await fixture.repos.materials.save(material);
  }

  const batchAceite = Batch.create({
    materialId: aceite.id,
    quantity: Quantity.create(5, 'l'),
    status: 'stored',
  });
  const batchSosa = Batch.create({
    materialId: sosa.id,
    quantity: Quantity.create(2, 'kg'),
    status: 'stored',
  });
  await fixture.repos.batches.save(batchAceite);
  await fixture.repos.batches.save(batchSosa);

  const mezclaEvent = BatchEvent.create({
    machineId: M1,
    workerId: JUAN,
    locationId: PLANT,
    inputs: [
      { batchId: batchAceite.id, materialId: aceite.id, quantity: Quantity.create(5, 'l') },
      { batchId: batchSosa.id, materialId: sosa.id, quantity: Quantity.create(2, 'kg') },
    ],
    outputs: [{ materialId: mezcla.id, quantity: Quantity.create(7, 'l') }],
    observation: 'mezcla espesa',
    timestamp: T1,
  });
  await fixture.repos.batchEvents.add(mezclaEvent);

  const batchMezcla = Batch.create({
    materialId: mezcla.id,
    quantity: Quantity.create(7, 'l'),
    originBatchEventId: mezclaEvent.id,
  });
  await fixture.repos.batches.save(batchMezcla);

  const cocinadoEvent = BatchEvent.create({
    machineId: M2,
    workerId: ANA,
    locationId: PLANT,
    inputs: [{ batchId: batchMezcla.id, materialId: mezcla.id, quantity: Quantity.create(7, 'l') }],
    outputs: [{ materialId: jabon.id, quantity: Quantity.create(9, 'l') }],
    timestamp: T2,
  });
  await fixture.repos.batchEvents.add(cocinadoEvent);

  const batchJabon = Batch.create({
    materialId: jabon.id,
    quantity: Quantity.create(9, 'l'),
    originBatchEventId: cocinadoEvent.id,
  });
  await fixture.repos.batches.save(batchJabon);

  return { aceite, sosa, mezcla, jabon, batchAceite, batchSosa, batchMezcla, batchJabon, mezclaEvent, cocinadoEvent };
}

describe('TraceBatch (genealogía hacia atrás)', () => {
  it('reconstruye el árbol de 3 niveles de docs/03', async () => {
    const fixture = traceFixture();
    const {
      batchAceite,
      batchSosa,
      batchMezcla,
      batchJabon,
      mezclaEvent,
      cocinadoEvent,
    } = await seedGenealogy(fixture);

    const tree = await fixture.traceBatch.execute(AUDITOR, { batchId: batchJabon.id });

    // Nodo raíz: producto final, producido por el evento de cocinado.
    expect(tree.batch.id).toBe(batchJabon.id);
    expect(tree.event?.id).toBe(cocinadoEvent.id);
    expect(tree.event?.machineId).toBe(M2);
    expect(tree.event?.workerId).toBe(ANA);
    expect(tree.event?.observation).toBeUndefined();
    expect(tree.children).toHaveLength(1);

    // Nodo intermedio: mezcla cruda, con su evento (máquina/worker/observación).
    const intermediate = tree.children[0]!;
    expect(intermediate.batch.id).toBe(batchMezcla.id);
    expect(intermediate.event?.id).toBe(mezclaEvent.id);
    expect(intermediate.event?.machineId).toBe(M1);
    expect(intermediate.event?.workerId).toBe(JUAN);
    expect(intermediate.event?.observation).toBe('mezcla espesa');

    // Hojas: suministros sin evento.
    expect(intermediate.children.map((node) => node.batch.id)).toEqual([
      batchAceite.id,
      batchSosa.id,
    ]);
    for (const leaf of intermediate.children) {
      expect(leaf.event).toBeUndefined();
      expect(leaf.children).toHaveLength(0);
      expect(leaf.cycleDetected).toBeUndefined();
    }
  });

  it('permite al admin y al auditor, y rechaza al worker', async () => {
    const fixture = traceFixture();
    const { batchJabon } = await seedGenealogy(fixture);

    await expect(
      fixture.traceBatch.execute(ADMIN, { batchId: batchJabon.id }),
    ).resolves.toMatchObject({ batch: { id: batchJabon.id } });
    await expect(
      fixture.traceBatch.execute(WORKER, { batchId: batchJabon.id }),
    ).rejects.toMatchObject({ name: 'UnauthorizedRoleError', useCase: 'TraceBatch' });
  });

  it('lanza NotFoundError si el lote raíz no existe', async () => {
    const fixture = traceFixture();
    await expect(
      fixture.traceBatch.execute(AUDITOR, { batchId: BatchId.create() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('corta las ramas cíclicas en lugar de colgar (datos corruptos)', async () => {
    const fixture = traceFixture();
    const material = product('Cíclico', 'l');
    await fixture.repos.materials.save(material);

    // A ← Ea ← B y B ← Eb ← A: ciclo fabricado.
    const aId = BatchId.create();
    const bId = BatchId.create();
    const eventA = BatchEvent.create({
      machineId: M1,
      workerId: JUAN,
      locationId: PLANT,
      inputs: [{ batchId: bId, materialId: material.id, quantity: Quantity.create(1, 'l') }],
      outputs: [{ materialId: material.id, quantity: Quantity.create(1, 'l') }],
      timestamp: T1,
    });
    const eventB = BatchEvent.create({
      machineId: M1,
      workerId: JUAN,
      locationId: PLANT,
      inputs: [{ batchId: aId, materialId: material.id, quantity: Quantity.create(1, 'l') }],
      outputs: [{ materialId: material.id, quantity: Quantity.create(1, 'l') }],
      timestamp: T2,
    });
    await fixture.repos.batchEvents.add(eventA);
    await fixture.repos.batchEvents.add(eventB);
    const batchA = Batch.fromPersistence({
      id: aId,
      materialId: material.id,
      quantity: Quantity.create(1, 'l'),
      originBatchEventId: eventA.id,
    });
    const batchB = Batch.fromPersistence({
      id: bId,
      materialId: material.id,
      quantity: Quantity.create(1, 'l'),
      originBatchEventId: eventB.id,
    });
    await fixture.repos.batches.save(batchA);
    await fixture.repos.batches.save(batchB);

    const tree = await fixture.traceBatch.execute(AUDITOR, { batchId: aId });

    expect(tree.batch.id).toBe(aId);
    const cycleNode = tree.children[0]!.children[0]!;
    expect(cycleNode.batch.id).toBe(aId);
    expect(cycleNode.cycleDetected).toBe(true);
    expect(cycleNode.children).toHaveLength(0);
  });
});

describe('TraceForward (recall hacia adelante)', () => {
  it('desde un suministro encuentra ambos eventos consumidores y sus productos', async () => {
    const fixture = traceFixture();
    const insumo = supply('Insumo', 'l');
    const prodA = product('Producto A', 'l');
    const prodB = product('Producto B', 'l');
    for (const material of [insumo, prodA, prodB]) {
      await fixture.repos.materials.save(material);
    }

    const lote = Batch.create({
      materialId: insumo.id,
      quantity: Quantity.create(10, 'l'),
      status: 'stored',
    });
    await fixture.repos.batches.save(lote);

    const eventA = BatchEvent.create({
      machineId: M1,
      workerId: JUAN,
      locationId: PLANT,
      inputs: [{ batchId: lote.id, materialId: insumo.id, quantity: Quantity.create(4, 'l') }],
      outputs: [{ materialId: prodA.id, quantity: Quantity.create(4, 'l') }],
      timestamp: T1,
    });
    const eventB = BatchEvent.create({
      machineId: M2,
      workerId: ANA,
      locationId: PLANT,
      inputs: [{ batchId: lote.id, materialId: insumo.id, quantity: Quantity.create(6, 'l') }],
      outputs: [{ materialId: prodB.id, quantity: Quantity.create(6, 'l') }],
      timestamp: T2,
    });
    await fixture.repos.batchEvents.add(eventA);
    await fixture.repos.batchEvents.add(eventB);

    const batchA = Batch.create({
      materialId: prodA.id,
      quantity: Quantity.create(4, 'l'),
      originBatchEventId: eventA.id,
    });
    const batchB = Batch.create({
      materialId: prodB.id,
      quantity: Quantity.create(6, 'l'),
      originBatchEventId: eventB.id,
    });
    await fixture.repos.batches.save(batchA);
    await fixture.repos.batches.save(batchB);

    const tree = await fixture.traceForward.execute(AUDITOR, { batchId: lote.id });

    expect(tree.batch?.id).toBe(lote.id);
    expect(tree.children).toHaveLength(2);
    // Eventos en orden de inserción.
    expect(tree.children.map((node) => node.event?.id)).toEqual([eventA.id, eventB.id]);
    expect(tree.children[0]!.children[0]!.batch?.id).toBe(batchA.id);
    expect(tree.children[1]!.children[0]!.batch?.id).toBe(batchB.id);
    // Productos sin consumidores: hojas.
    expect(tree.children[0]!.children[0]!.children).toHaveLength(0);
  });

  it('un producto final sin consumidores devuelve un árbol de un solo nodo', async () => {
    const fixture = traceFixture();
    const material = product('Final', 'l');
    const lote = Batch.create({ materialId: material.id, quantity: Quantity.create(1, 'l') });
    await fixture.repos.batches.save(lote);

    const tree = await fixture.traceForward.execute(AUDITOR, { batchId: lote.id });

    expect(tree.batch?.id).toBe(lote.id);
    expect(tree.children).toHaveLength(0);
  });

  it('lanza NotFoundError si el lote raíz no existe', async () => {
    const fixture = traceFixture();
    await expect(
      fixture.traceForward.execute(AUDITOR, { batchId: BatchId.create() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza al worker', async () => {
    const fixture = traceFixture();
    const material = product('Final', 'l');
    const lote = Batch.create({ materialId: material.id, quantity: Quantity.create(1, 'l') });
    await fixture.repos.batches.save(lote);

    await expect(
      fixture.traceForward.execute(WORKER, { batchId: lote.id }),
    ).rejects.toMatchObject({ name: 'UnauthorizedRoleError', useCase: 'TraceForward' });
  });

  it('corta las ramas cíclicas hacia adelante', async () => {
    const fixture = traceFixture();
    const material = product('Cíclico', 'l');
    const x = Batch.create({ materialId: material.id, quantity: Quantity.create(1, 'l') });
    await fixture.repos.batches.save(x);

    // X --E1--> Y --E2--> X (ciclo fabricado).
    const event1 = BatchEvent.create({
      machineId: M1,
      workerId: JUAN,
      locationId: PLANT,
      inputs: [{ batchId: x.id, materialId: material.id, quantity: Quantity.create(1, 'l') }],
      outputs: [{ materialId: material.id, quantity: Quantity.create(1, 'l') }],
      timestamp: T1,
    });
    await fixture.repos.batchEvents.add(event1);

    const y = Batch.create({
      materialId: material.id,
      quantity: Quantity.create(1, 'l'),
      originBatchEventId: event1.id,
    });
    await fixture.repos.batches.save(y);

    const event2 = BatchEvent.create({
      machineId: M1,
      workerId: JUAN,
      locationId: PLANT,
      inputs: [{ batchId: y.id, materialId: material.id, quantity: Quantity.create(1, 'l') }],
      outputs: [{ materialId: material.id, quantity: Quantity.create(1, 'l') }],
      timestamp: T2,
    });
    await fixture.repos.batchEvents.add(event2);

    // El lote X "producido" por E2 cierra el ciclo.
    await fixture.repos.batches.save(
      Batch.fromPersistence({
        id: x.id,
        materialId: material.id,
        quantity: Quantity.create(1, 'l'),
        originBatchEventId: event2.id,
      }),
    );

    const tree = await fixture.traceForward.execute(AUDITOR, { batchId: x.id });

    const yNode = tree.children[0]!.children[0]!;
    expect(yNode.batch?.id).toBe(y.id);
    const cycleNode = yNode.children[0]!.children[0]!;
    expect(cycleNode.batch?.id).toBe(x.id);
    expect(cycleNode.cycleDetected).toBe(true);
    expect(cycleNode.children).toHaveLength(0);
  });
});

describe('GetStockByLocation (agregado de movimientos)', () => {
  async function seedStock(fixture: Fixture) {
    const storage = Location.create({ name: 'Almacén', kind: 'storage' });
    await fixture.repos.locations.save(storage);
    const aceite = supply('Aceite', 'l');
    const sosa = supply('Sosa', 'kg');
    await fixture.repos.materials.save(aceite);
    await fixture.repos.materials.save(sosa);

    const eventId = BatchEventId.from('batch-event-stock');
    // Aceite: +5 (supply_in) +2 (produced) -3 (consumed) = 4 l.
    await fixture.repos.stockMovements.add(
      StockMovement.create({
        locationId: storage.id,
        materialId: aceite.id,
        delta: { amount: 5, unit: 'l' },
        reason: 'supply_in',
        timestamp: T1,
      }),
    );
    await fixture.repos.stockMovements.add(
      StockMovement.create({
        locationId: storage.id,
        materialId: aceite.id,
        delta: { amount: 2, unit: 'l' },
        reason: 'produced',
        batchEventId: eventId,
        timestamp: T2,
      }),
    );
    await fixture.repos.stockMovements.add(
      StockMovement.create({
        locationId: storage.id,
        materialId: aceite.id,
        delta: { amount: -3, unit: 'l' },
        reason: 'consumed',
        batchEventId: eventId,
        timestamp: T3,
      }),
    );
    // Sosa: +2 -2 = 0 → se omite.
    await fixture.repos.stockMovements.add(
      StockMovement.create({
        locationId: storage.id,
        materialId: sosa.id,
        delta: { amount: 2, unit: 'kg' },
        reason: 'supply_in',
        timestamp: T1,
      }),
    );
    await fixture.repos.stockMovements.add(
      StockMovement.create({
        locationId: storage.id,
        materialId: sosa.id,
        delta: { amount: -2, unit: 'kg' },
        reason: 'consumed',
        batchEventId: eventId,
        timestamp: T2,
      }),
    );

    return { storage, aceite, sosa };
  }

  it('agrega deltas por material, toma la unidad del catálogo y omite los saldos cero', async () => {
    const fixture = traceFixture();
    const { storage, aceite, sosa } = await seedStock(fixture);

    const entries = await fixture.getStockByLocation.execute(AUDITOR, {
      locationId: storage.id,
    });

    expect(entries).toEqual([{ materialId: aceite.id, amount: 4, unit: 'l' }]);
    expect(entries.some((entry) => entry.materialId === sosa.id)).toBe(false);
  });

  it('permite admin, auditor y worker', async () => {
    const fixture = traceFixture();
    const { storage } = await seedStock(fixture);

    for (const actor of [ADMIN, AUDITOR, WORKER]) {
      await expect(
        fixture.getStockByLocation.execute(actor, { locationId: storage.id }),
      ).resolves.toHaveLength(1);
    }
  });

  it('lanza NotFoundError si el lugar no existe', async () => {
    const fixture = traceFixture();
    await expect(
      fixture.getStockByLocation.execute(AUDITOR, { locationId: LocationId.create() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('devuelve un array vacío si el lugar no tiene movimientos', async () => {
    const fixture = traceFixture();
    const storage = Location.create({ name: 'Vacío', kind: 'storage' });
    await fixture.repos.locations.save(storage);

    await expect(
      fixture.getStockByLocation.execute(WORKER, { locationId: storage.id }),
    ).resolves.toEqual([]);
  });
});

describe('GetStockMovements (historial)', () => {
  async function seedMovements(fixture: Fixture) {
    const storage = Location.create({ name: 'Almacén', kind: 'storage' });
    const other = Location.create({ name: 'Otro', kind: 'storage' });
    await fixture.repos.locations.save(storage);
    await fixture.repos.locations.save(other);
    const aceite = supply('Aceite', 'l');
    const sosa = supply('Sosa', 'kg');
    await fixture.repos.materials.save(aceite);
    await fixture.repos.materials.save(sosa);

    // Se insertan en orden NO cronológico a propósito (T2 antes que T1).
    const late = StockMovement.create({
      locationId: storage.id,
      materialId: sosa.id,
      delta: { amount: 2, unit: 'kg' },
      reason: 'supply_in',
      timestamp: T2,
    });
    const early = StockMovement.create({
      locationId: storage.id,
      materialId: aceite.id,
      delta: { amount: 5, unit: 'l' },
      reason: 'supply_in',
      timestamp: T1,
    });
    const elsewhere = StockMovement.create({
      locationId: other.id,
      materialId: aceite.id,
      delta: { amount: 1, unit: 'l' },
      reason: 'supply_in',
      timestamp: T3,
    });
    await fixture.repos.stockMovements.add(late);
    await fixture.repos.stockMovements.add(early);
    await fixture.repos.stockMovements.add(elsewhere);

    return { storage, other, aceite, sosa, late, early, elsewhere };
  }

  it('devuelve los movimientos del lugar ordenados por timestamp', async () => {
    const fixture = traceFixture();
    const { storage, late, early } = await seedMovements(fixture);

    const movements = await fixture.getStockMovements.execute(AUDITOR, {
      locationId: storage.id,
    });

    expect(movements.map((movement) => movement.id)).toEqual([early.id, late.id]);
  });

  it('filtra por material', async () => {
    const fixture = traceFixture();
    const { storage, aceite, early } = await seedMovements(fixture);

    const movements = await fixture.getStockMovements.execute(ADMIN, {
      locationId: storage.id,
      materialId: aceite.id,
    });

    expect(movements.map((movement) => movement.id)).toEqual([early.id]);
  });

  it('lanza NotFoundError si el lugar no existe y rechaza al worker', async () => {
    const fixture = traceFixture();
    const { storage } = await seedMovements(fixture);

    await expect(
      fixture.getStockMovements.execute(AUDITOR, { locationId: LocationId.create() }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      fixture.getStockMovements.execute(WORKER, { locationId: storage.id }),
    ).rejects.toMatchObject({ name: 'UnauthorizedRoleError', useCase: 'GetStockMovements' });
  });
});

describe('ListBatchEvents (búsqueda)', () => {
  async function seedEvents(fixture: Fixture) {
    const supplyMat = supply('Insumo', 'l');
    const productMat = product('Producto', 'l');
    const otherMat = supply('Otro', 'kg');
    const machineA = M1;
    const machineB = M2;

    const e1 = BatchEvent.create({
      machineId: machineA,
      workerId: JUAN,
      locationId: PLANT,
      inputs: [{ batchId: BatchId.create(), materialId: supplyMat.id, quantity: Quantity.create(1, 'l') }],
      outputs: [{ materialId: productMat.id, quantity: Quantity.create(1, 'l') }],
      timestamp: T1,
    });
    const e2 = BatchEvent.create({
      machineId: machineB,
      workerId: ANA,
      locationId: PLANT,
      inputs: [],
      outputs: [{ materialId: productMat.id, quantity: Quantity.create(2, 'l') }],
      timestamp: T2,
    });
    const e3 = BatchEvent.create({
      machineId: machineA,
      workerId: ANA,
      locationId: PLANT,
      inputs: [{ batchId: BatchId.create(), materialId: otherMat.id, quantity: Quantity.create(1, 'kg') }],
      outputs: [],
      timestamp: T3,
    });
    await fixture.repos.batchEvents.add(e1);
    await fixture.repos.batchEvents.add(e2);
    await fixture.repos.batchEvents.add(e3);

    return { supplyMat, productMat, otherMat, machineA, machineB, e1, e2, e3 };
  }

  it('devuelve todos los eventos ordenados por timestamp', async () => {
    const fixture = traceFixture();
    const { e1, e2, e3 } = await seedEvents(fixture);

    const events = await fixture.listBatchEvents.execute(AUDITOR, {});

    expect(events.map((event) => event.id)).toEqual([e1.id, e2.id, e3.id]);
  });

  it('filtra por máquina, worker y material (inputs u outputs)', async () => {
    const fixture = traceFixture();
    const { supplyMat, productMat, machineA, e1, e2, e3 } = await seedEvents(fixture);

    const byMachine = await fixture.listBatchEvents.execute(AUDITOR, { machineId: machineA });
    expect(byMachine.map((event) => event.id)).toEqual([e1.id, e3.id]);

    const byWorker = await fixture.listBatchEvents.execute(AUDITOR, { workerId: ANA });
    expect(byWorker.map((event) => event.id)).toEqual([e2.id, e3.id]);

    const byProduct = await fixture.listBatchEvents.execute(AUDITOR, { materialId: productMat.id });
    expect(byProduct.map((event) => event.id)).toEqual([e1.id, e2.id]);

    const bySupply = await fixture.listBatchEvents.execute(AUDITOR, { materialId: supplyMat.id });
    expect(bySupply.map((event) => event.id)).toEqual([e1.id]);
  });

  it('filtra por rango de fechas inclusivo', async () => {
    const fixture = traceFixture();
    const { e2, e3 } = await seedEvents(fixture);

    const inclusive = await fixture.listBatchEvents.execute(AUDITOR, {
      dateRange: { from: T2, to: T3 },
    });
    expect(inclusive.map((event) => event.id)).toEqual([e2.id, e3.id]);

    const exactlyT2 = await fixture.listBatchEvents.execute(AUDITOR, {
      dateRange: { from: T2, to: T2 },
    });
    expect(exactlyT2.map((event) => event.id)).toEqual([e2.id]);
  });

  it('rechaza al worker', async () => {
    const fixture = traceFixture();
    await expect(fixture.listBatchEvents.execute(WORKER, {})).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'ListBatchEvents',
    });
  });
});
