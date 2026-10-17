import { Assignment, MachineId, TimeSlot, WorkerId } from '@fabrik/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { anAssignment } from './fixtures.js';
import { createTestDatabase, type TestDatabase } from './test-db.js';

describe('DrizzleAssignmentRepository', () => {
  let ctx: TestDatabase;

  beforeEach(async () => {
    ctx = await createTestDatabase();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('findById devuelve null cuando no existe', async () => {
    const assignment = anAssignment(WorkerId.create(), MachineId.create());
    await expect(ctx.repositories.assignments.findById(assignment.id)).resolves.toBeNull();
  });

  it('save + findById hacen round-trip del TimeSlot', async () => {
    const assignment = anAssignment(WorkerId.create(), MachineId.create(), {
      slot: TimeSlot.create([3, 1, 3], '08:00', '16:30'),
    });
    await ctx.repositories.assignments.save(assignment);

    const found = await ctx.repositories.assignments.findById(assignment.id);
    expect(found).not.toBeNull();
    expect(found?.workerId).toBe(assignment.workerId);
    expect(found?.machineId).toBe(assignment.machineId);
    expect(found?.slot.daysOfWeek).toEqual([1, 3]);
    expect(found?.slot.start).toBe('08:00');
    expect(found?.slot.end).toBe('16:30');
  });

  it('findByWorker y findByMachine filtran correctamente', async () => {
    const workerA = WorkerId.create();
    const workerB = WorkerId.create();
    const machineA = MachineId.create();
    const machineB = MachineId.create();

    const a1 = anAssignment(workerA, machineA);
    const a2 = anAssignment(workerA, machineB);
    const a3 = anAssignment(workerB, machineA);
    await ctx.repositories.assignments.save(a1);
    await ctx.repositories.assignments.save(a2);
    await ctx.repositories.assignments.save(a3);

    expect((await ctx.repositories.assignments.findByWorker(workerA)).map((a) => a.id).sort()).toEqual(
      [a1.id, a2.id].sort(),
    );
    expect((await ctx.repositories.assignments.findByMachine(machineA)).map((a) => a.id).sort()).toEqual(
      [a1.id, a3.id].sort(),
    );
    expect(await ctx.repositories.assignments.findByWorker(WorkerId.create())).toEqual([]);
  });

  it('save es upsert por id', async () => {
    const workerId = WorkerId.create();
    const machineId = MachineId.create();
    const assignment = anAssignment(workerId, machineId);
    await ctx.repositories.assignments.save(assignment);
    await ctx.repositories.assignments.save(
      Assignment.fromPersistence({
        id: assignment.id,
        workerId,
        machineId,
        slot: TimeSlot.create([2], '10:00', '12:00'),
      }),
    );

    const all = await ctx.repositories.assignments.findByWorker(workerId);
    expect(all).toHaveLength(1);
    expect(all[0]?.slot.start).toBe('10:00');
  });

  it('delete elimina la asignación', async () => {
    const workerId = WorkerId.create();
    const assignment = anAssignment(workerId, MachineId.create());
    await ctx.repositories.assignments.save(assignment);

    await ctx.repositories.assignments.delete(assignment.id);

    await expect(ctx.repositories.assignments.findById(assignment.id)).resolves.toBeNull();
    expect(await ctx.repositories.assignments.findByWorker(workerId)).toEqual([]);
  });
});
