import {
  BatchEvent,
  BatchEventId,
  type BatchEventProps,
  BatchId,
  LocationId,
  MachineId,
  RecipeStepId,
  WorkerId,
} from '@fabrik/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aBatchEvent, aMaterial, aProduct, quantity } from './fixtures.js';
import { createTestDatabase, type TestDatabase } from './test-db.js';

describe('DrizzleBatchEventRepository (append-only)', () => {
  let ctx: TestDatabase;

  const machineA = MachineId.create();
  const machineB = MachineId.create();
  const workerA = WorkerId.create();
  const workerB = WorkerId.create();
  const locationId = LocationId.create();
  const materialA = aMaterial({ name: 'Harina' });
  const materialB = aProduct('Pan');
  const inputBatch = BatchId.create();
  const outputBatch = BatchId.create();
  const ts0 = new Date('2026-01-01T10:00:00.000Z');
  const ts1 = new Date('2026-01-02T10:00:00.000Z');

  function event(overrides: Partial<BatchEventProps> = {}): BatchEvent {
    return aBatchEvent({
      machineId: machineA,
      workerId: workerA,
      locationId,
      inputs: [{ batchId: inputBatch, materialId: materialA.id, quantity: quantity(1, 'kg') }],
      outputs: [{ batchId: outputBatch, materialId: materialB.id, quantity: quantity(2, 'unit') }],
      timestamp: ts0,
      ...overrides,
    });
  }

  beforeEach(async () => {
    ctx = await createTestDatabase();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('findById devuelve null cuando no existe', async () => {
    await expect(ctx.repositories.batchEvents.findById(BatchEventId.create())).resolves.toBeNull();
  });

  it('add + findById hacen round-trip (inputs, outputs, observación normalizada)', async () => {
    const created = event({
      observation: '  listo el lote  ',
      recipeStepId: RecipeStepId.create(),
    });
    await ctx.repositories.batchEvents.add(created);

    const found = await ctx.repositories.batchEvents.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.observation).toBe('listo el lote');
    expect(found?.recipeStepId).toBe(created.recipeStepId);
    expect(found?.timestamp.toISOString()).toBe(ts0.toISOString());
    expect(found?.inputs).toHaveLength(1);
    expect(found?.inputs[0]).toMatchObject({
      batchId: inputBatch,
      materialId: materialA.id,
      quantity: { amount: 1, unit: 'kg' },
    });
    expect(found?.outputs[0]).toMatchObject({
      batchId: outputBatch,
      materialId: materialB.id,
      quantity: { amount: 2, unit: 'unit' },
    });
  });

  it('listBy sin filtros devuelve todos los eventos', async () => {
    const e1 = event();
    const e2 = event({ machineId: machineB, workerId: workerB, timestamp: ts1 });
    await ctx.repositories.batchEvents.add(e1);
    await ctx.repositories.batchEvents.add(e2);

    const all = await ctx.repositories.batchEvents.listBy();
    expect(all.map((e) => e.id).sort()).toEqual([e1.id, e2.id].sort());
  });

  it('listBy filtra por machineId y workerId', async () => {
    const e1 = event();
    const e2 = event({ machineId: machineB, workerId: workerB, timestamp: ts1 });
    await ctx.repositories.batchEvents.add(e1);
    await ctx.repositories.batchEvents.add(e2);

    expect(
      (await ctx.repositories.batchEvents.listBy({ machineId: machineA })).map((e) => e.id),
    ).toEqual([e1.id]);
    expect(
      (await ctx.repositories.batchEvents.listBy({ workerId: workerB })).map((e) => e.id),
    ).toEqual([e2.id]);
  });

  it('listBy materialId matchea tanto inputs como outputs', async () => {
    const asInput = event();
    await ctx.repositories.batchEvents.add(asInput);

    expect(
      (await ctx.repositories.batchEvents.listBy({ materialId: materialA.id })).map((e) => e.id),
    ).toEqual([asInput.id]);
    expect(
      (await ctx.repositories.batchEvents.listBy({ materialId: materialB.id })).map((e) => e.id),
    ).toEqual([asInput.id]);
    expect(await ctx.repositories.batchEvents.listBy({ materialId: aMaterial().id })).toEqual([]);
  });

  it('listBy dateRange es inclusivo en ambos extremos', async () => {
    const e0 = event({ timestamp: ts0 });
    const e1 = event({ timestamp: ts1 });
    await ctx.repositories.batchEvents.add(e0);
    await ctx.repositories.batchEvents.add(e1);

    const onlyZero = await ctx.repositories.batchEvents.listBy({
      dateRange: { from: ts0, to: ts0 },
    });
    expect(onlyZero.map((e) => e.id)).toEqual([e0.id]);

    const both = await ctx.repositories.batchEvents.listBy({ dateRange: { from: ts0, to: ts1 } });
    expect(both.map((e) => e.id).sort()).toEqual([e0.id, e1.id].sort());

    const afterTs1 = await ctx.repositories.batchEvents.listBy({
      dateRange: { from: new Date(ts1.getTime() + 1) },
    });
    expect(afterTs1).toEqual([]);
  });

  it('listBy combina filtros (máquina + material + rango)', async () => {
    const match = event({ timestamp: ts0 });
    const otherMachine = event({ machineId: machineB, timestamp: ts0 });
    await ctx.repositories.batchEvents.add(match);
    await ctx.repositories.batchEvents.add(otherMachine);

    const result = await ctx.repositories.batchEvents.listBy({
      machineId: machineA,
      materialId: materialA.id,
      dateRange: { from: ts0, to: ts1 },
    });
    expect(result.map((e) => e.id)).toEqual([match.id]);
  });

  it('listByInputBatchId devuelve eventos que consumen ese lote', async () => {
    const consuming = event();
    const notConsuming = event({
      inputs: [{ materialId: materialA.id, quantity: quantity(1, 'kg') }],
      timestamp: ts1,
    });
    await ctx.repositories.batchEvents.add(consuming);
    await ctx.repositories.batchEvents.add(notConsuming);

    expect(
      (await ctx.repositories.batchEvents.listByInputBatchId(inputBatch)).map((e) => e.id),
    ).toEqual([consuming.id]);
    expect(await ctx.repositories.batchEvents.listByInputBatchId(BatchId.create())).toEqual([]);
  });

  it('add es idempotente por id (reemplaza el evento y sus hijos)', async () => {
    const created = event();
    await ctx.repositories.batchEvents.add(created);

    const updated = BatchEvent.fromPersistence({
      id: created.id,
      machineId: created.machineId,
      workerId: created.workerId,
      locationId: created.locationId,
      inputs: [],
      outputs: created.outputs,
      observation: 'actualizado',
      timestamp: created.timestamp,
    });
    await ctx.repositories.batchEvents.add(updated);

    const all = await ctx.repositories.batchEvents.listBy();
    expect(all).toHaveLength(1);
    const found = await ctx.repositories.batchEvents.findById(created.id);
    expect(found?.observation).toBe('actualizado');
    expect(found?.inputs).toEqual([]);
    // El lote de entrada ya no es consumido por ningún evento.
    expect(await ctx.repositories.batchEvents.listByInputBatchId(inputBatch)).toEqual([]);
  });
});
