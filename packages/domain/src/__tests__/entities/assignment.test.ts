import { describe, expect, it } from 'vitest';

import { Assignment, AssignmentId, MachineId, TimeSlot, WorkerId } from '../../index.js';

const WORKER_ID = WorkerId.from('worker-1');
const OTHER_WORKER_ID = WorkerId.from('worker-2');
const MACHINE_ID = MachineId.from('machine-1');

describe('Assignment', () => {
  it('create genera id y es inmutable', () => {
    const assignment = Assignment.create({
      workerId: WORKER_ID,
      machineId: MACHINE_ID,
      slot: TimeSlot.create([1, 2], '08:00', '12:00'),
    });
    expect(typeof assignment.id).toBe('string');
    expect(Object.isFrozen(assignment)).toBe(true);
    expect(() => {
      // @ts-expect-error intento de mutación sobre una entidad inmutable
      assignment.machineId = MachineId.create();
    }).toThrow();
  });

  it('detecta solapamientos de horario con el mismo día', () => {
    const morning = Assignment.create({
      workerId: WORKER_ID,
      machineId: MACHINE_ID,
      slot: TimeSlot.create([1, 2], '08:00', '12:00'),
    });
    const overlapping = Assignment.create({
      workerId: WORKER_ID,
      machineId: MachineId.create(),
      slot: TimeSlot.create([2], '11:00', '13:00'),
    });
    const adjacent = Assignment.create({
      workerId: WORKER_ID,
      machineId: MACHINE_ID,
      slot: TimeSlot.create([1, 2], '12:00', '14:00'),
    });
    const otherDay = Assignment.create({
      workerId: WORKER_ID,
      machineId: MACHINE_ID,
      slot: TimeSlot.create([3], '08:00', '12:00'),
    });

    expect(morning.overlapsWith(overlapping)).toBe(true);
    expect(morning.overlapsWith(adjacent)).toBe(false);
    expect(morning.overlapsWith(otherDay)).toBe(false);
  });

  it('isForWorker compara la identidad del worker', () => {
    const assignment = Assignment.create({
      workerId: WORKER_ID,
      machineId: MACHINE_ID,
      slot: TimeSlot.create([1], '08:00', '12:00'),
    });
    expect(assignment.isForWorker(WORKER_ID)).toBe(true);
    expect(assignment.isForWorker(OTHER_WORKER_ID)).toBe(false);
  });

  it('fromPersistence conserva el id', () => {
    const id = AssignmentId.from('assignment-1');
    const assignment = Assignment.fromPersistence({
      id,
      workerId: WORKER_ID,
      machineId: MACHINE_ID,
      slot: TimeSlot.create([1], '08:00', '12:00'),
    });
    expect(assignment.id).toBe(id);
  });
});
