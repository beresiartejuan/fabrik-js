import { describe, expect, it } from 'vitest';

import {
  AssignmentId,
  BatchEventId,
  BatchId,
  LocationId,
  MachineId,
  MaterialId,
  Quantity,
  RecipeId,
  StockMovementId,
  TimeSlot,
  WorkerId,
  batchCreated,
  batchStored,
  batchTransformed,
  machineCreated,
  machineMoved,
  materialCreated,
  materialUpdated,
  productionCompleted,
  stockMoved,
  supplyArrived,
  workerAssigned,
  workerUnassigned,
  type DomainEvent,
  type EventBus,
} from '../index.js';
import { collectingEventBus } from '../testing/index.js';

const MATERIAL_ID = MaterialId.from('material-1');
const MACHINE_ID = MachineId.from('machine-1');
const LOCATION_ID = LocationId.from('location-1');
const WORKER_ID = WorkerId.from('worker-1');
const ASSIGNMENT_ID = AssignmentId.from('assignment-1');
const BATCH_ID = BatchId.from('batch-1');
const OUTPUT_BATCH_ID = BatchId.from('batch-2');
const BATCH_EVENT_ID = BatchEventId.from('batch-event-1');
const RECIPE_ID = RecipeId.from('recipe-1');
const MOVEMENT_ID = StockMovementId.from('movement-1');
const SLOT = TimeSlot.create([1, 2], '08:00', '12:00');

function expectRecent(date: Date): void {
  expect(date).toBeInstanceOf(Date);
  const elapsed = Date.now() - date.getTime();
  expect(elapsed).toBeGreaterThanOrEqual(0);
  expect(elapsed).toBeLessThan(1000);
}

describe('Eventos de material', () => {
  it('materialCreated fija nombre y payload', () => {
    const event = materialCreated({ materialId: MATERIAL_ID });
    expect(event.name).toBe('material.created');
    expect(event.payload.materialId).toBe(MATERIAL_ID);
    expectRecent(event.occurredAt);
  });

  it('materialUpdated fija nombre y payload', () => {
    const event = materialUpdated({ materialId: MATERIAL_ID });
    expect(event.name).toBe('material.updated');
    expect(event.payload.materialId).toBe(MATERIAL_ID);
    expectRecent(event.occurredAt);
  });
});

describe('Eventos de máquina', () => {
  it('machineCreated fija nombre y payload', () => {
    const event = machineCreated({ machineId: MACHINE_ID, locationId: LOCATION_ID });
    expect(event.name).toBe('machine.created');
    expect(event.payload).toEqual({ machineId: MACHINE_ID, locationId: LOCATION_ID });
    expectRecent(event.occurredAt);
  });

  it('machineMoved fija nombre y payload', () => {
    const event = machineMoved({ machineId: MACHINE_ID, locationId: LOCATION_ID });
    expect(event.name).toBe('machine.moved');
    expect(event.payload.locationId).toBe(LOCATION_ID);
    expectRecent(event.occurredAt);
  });
});

describe('Eventos de asignación', () => {
  it('workerAssigned incluye la franja horaria', () => {
    const event = workerAssigned({
      assignmentId: ASSIGNMENT_ID,
      workerId: WORKER_ID,
      machineId: MACHINE_ID,
      slot: SLOT,
    });
    expect(event.name).toBe('worker.assigned');
    expect(event.payload.assignmentId).toBe(ASSIGNMENT_ID);
    expect(event.payload.workerId).toBe(WORKER_ID);
    expect(event.payload.machineId).toBe(MACHINE_ID);
    expect(event.payload.slot).toBe(SLOT);
    expectRecent(event.occurredAt);
  });

  it('workerUnassigned solo lleva el assignmentId', () => {
    const event = workerUnassigned({ assignmentId: ASSIGNMENT_ID });
    expect(event.name).toBe('worker.unassigned');
    expect(event.payload).toEqual({ assignmentId: ASSIGNMENT_ID });
    expectRecent(event.occurredAt);
  });
});

describe('Eventos de producción', () => {
  it('supplyArrived fija batch, material, cantidad y location', () => {
    const quantity = Quantity.create(20, 'kg');
    const event = supplyArrived({
      batchId: BATCH_ID,
      materialId: MATERIAL_ID,
      quantity,
      locationId: LOCATION_ID,
    });
    expect(event.name).toBe('supply.arrived');
    expect(event.payload.quantity).toBe(quantity);
    expect(event.payload.locationId).toBe(LOCATION_ID);
    expectRecent(event.occurredAt);
  });

  it('batchCreated fija batch y receta', () => {
    const event = batchCreated({ batchId: BATCH_ID, recipeId: RECIPE_ID });
    expect(event.name).toBe('batch.created');
    expect(event.payload).toEqual({ batchId: BATCH_ID, recipeId: RECIPE_ID });
    expectRecent(event.occurredAt);
  });

  it('batchTransformed resume inputs/outputs y observación', () => {
    const inputs = [
      { batchId: BATCH_ID, materialId: MATERIAL_ID, quantity: Quantity.create(10, 'kg') },
    ];
    const outputs = [
      {
        batchId: OUTPUT_BATCH_ID,
        materialId: MATERIAL_ID,
        quantity: Quantity.create(8, 'kg'),
      },
    ];
    const event = batchTransformed({
      eventId: BATCH_EVENT_ID,
      machineId: MACHINE_ID,
      workerId: WORKER_ID,
      inputs,
      outputs,
      observation: 'merma leve',
    });
    expect(event.name).toBe('batch.transformed');
    expect(event.payload.eventId).toBe(BATCH_EVENT_ID);
    expect(event.payload.machineId).toBe(MACHINE_ID);
    expect(event.payload.workerId).toBe(WORKER_ID);
    expect(event.payload.inputs).toHaveLength(1);
    expect(event.payload.outputs).toEqual(outputs);
    expect(event.payload.observation).toBe('merma leve');
    expectRecent(event.occurredAt);
  });

  it('batchTransformed admite observación ausente', () => {
    const event = batchTransformed({
      eventId: BATCH_EVENT_ID,
      machineId: MACHINE_ID,
      workerId: WORKER_ID,
      inputs: [],
      outputs: [],
    });
    expect(event.payload.observation).toBeUndefined();
  });

  it('batchStored fija batch y location', () => {
    const event = batchStored({ batchId: BATCH_ID, locationId: LOCATION_ID });
    expect(event.name).toBe('batch.stored');
    expect(event.payload).toEqual({ batchId: BATCH_ID, locationId: LOCATION_ID });
    expectRecent(event.occurredAt);
  });

  it('productionCompleted fija batch y receta', () => {
    const event = productionCompleted({ batchId: BATCH_ID, recipeId: RECIPE_ID });
    expect(event.name).toBe('production.completed');
    expect(event.payload).toEqual({ batchId: BATCH_ID, recipeId: RECIPE_ID });
    expectRecent(event.occurredAt);
  });
});

describe('Eventos de inventario', () => {
  it('stockMoved admite delta negativo y batchEventId', () => {
    const event = stockMoved({
      movementId: MOVEMENT_ID,
      locationId: LOCATION_ID,
      materialId: MATERIAL_ID,
      delta: { amount: -5, unit: 'kg' },
      batchEventId: BATCH_EVENT_ID,
    });
    expect(event.name).toBe('stock.moved');
    expect(event.payload.movementId).toBe(MOVEMENT_ID);
    expect(event.payload.delta).toEqual({ amount: -5, unit: 'kg' });
    expect(event.payload.batchEventId).toBe(BATCH_EVENT_ID);
    expectRecent(event.occurredAt);
  });
});

describe('Contrato común', () => {
  it('respeta un occurredAt explícito', () => {
    const at = new Date('2026-05-01T10:00:00.000Z');
    const event = materialCreated({ materialId: MATERIAL_ID }, at);
    expect(event.occurredAt).toBe(at);
  });

  it('congela el payload (inmutabilidad)', () => {
    const event = materialCreated({ materialId: MATERIAL_ID });
    expect(Object.isFrozen(event.payload)).toBe(true);
  });

  it('DomainEvent es una unión discriminada por name', () => {
    const event: DomainEvent = batchTransformed({
      eventId: BATCH_EVENT_ID,
      machineId: MACHINE_ID,
      workerId: WORKER_ID,
      inputs: [],
      outputs: [],
    });
    if (event.name === 'batch.transformed') {
      expect(event.payload.machineId).toBe(MACHINE_ID);
    } else {
      throw new Error('se esperaba batch.transformed');
    }
  });
});

describe('EventBus', () => {
  it('acumula eventos con el bus colector de test', () => {
    const bus = collectingEventBus();
    const first = materialCreated({ materialId: MATERIAL_ID });
    const second = workerUnassigned({ assignmentId: ASSIGNMENT_ID });

    bus.publish(first);
    bus.publish(second);

    expect(bus.events).toHaveLength(2);
    expect(bus.events[0]).toBe(first);
    expect(bus.events[1]).toBe(second);

    bus.clear();
    expect(bus.events).toHaveLength(0);
  });

  it('acepta implementaciones asíncronas de EventBus', async () => {
    const received: DomainEvent[] = [];
    const bus: EventBus = {
      async publish(event) {
        received.push(event);
      },
    };
    const event = materialCreated({ materialId: MATERIAL_ID });
    await bus.publish(event);
    expect(received).toEqual([event]);
  });
});
