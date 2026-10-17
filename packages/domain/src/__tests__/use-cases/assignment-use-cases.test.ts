import { describe, expect, it } from 'vitest';

import {
  type Actor,
  AssignmentId,
  AssignWorkerToMachine,
  InactiveWorkerError,
  ListMachineSchedule,
  ListWorkerSchedule,
  LocationId,
  Machine,
  MachineId,
  NotFoundError,
  OverlappingScheduleError,
  TimeSlot,
  UnassignWorker,
  UnauthorizedRoleError,
  Worker,
  type WorkerAssigned,
  WorkerId,
  type WorkerUnassigned,
} from '../../index.js';
import { collectingEventBus, inMemoryRepositories } from '../../testing/index.js';

const ADMIN: Actor = { workerId: WorkerId.from('admin-1'), role: 'admin' };
const WORKER: Actor = { workerId: WorkerId.from('worker-1'), role: 'worker' };
const AUDITOR: Actor = { workerId: WorkerId.from('auditor-1'), role: 'auditor' };

function setup() {
  const repos = inMemoryRepositories();
  const events = collectingEventBus();
  const writeDeps = {
    assignments: repos.assignments,
    workers: repos.workers,
    machines: repos.machines,
    events,
  };
  const readDeps = {
    assignments: repos.assignments,
    workers: repos.workers,
    machines: repos.machines,
  };
  return {
    repos,
    events,
    assign: new AssignWorkerToMachine(writeDeps),
    unassign: new UnassignWorker(writeDeps),
    listWorkerSchedule: new ListWorkerSchedule(readDeps),
    listMachineSchedule: new ListMachineSchedule(readDeps),
  };
}

type Repos = ReturnType<typeof setup>['repos'];

async function seedWorker(
  repos: Repos,
  options?: { readonly inactive?: boolean },
): Promise<Worker> {
  const worker = Worker.create({ name: 'Beto', role: 'worker' });
  await repos.workers.save(options?.inactive ? worker.deactivate() : worker);
  return worker;
}

async function seedMachine(repos: Repos, name = 'Mezcladora'): Promise<Machine> {
  const machine = Machine.create({ name, type: 'mixer', locationId: LocationId.from('loc-1') });
  await repos.machines.save(machine);
  return machine;
}

const MONDAY_MORNING = (): TimeSlot => TimeSlot.create([1], '08:00', '12:00');

describe('AssignWorkerToMachine', () => {
  it('asigna, persiste y emite worker.assigned con el payload completo (incl. slot)', async () => {
    const { assign, repos, events } = setup();
    const worker = await seedWorker(repos);
    const machine = await seedMachine(repos);
    const slot = MONDAY_MORNING();

    const assignment = await assign.execute(ADMIN, {
      workerId: worker.id,
      machineId: machine.id,
      slot,
    });

    expect(assignment.workerId).toBe(worker.id);
    expect(assignment.machineId).toBe(machine.id);
    await expect(repos.assignments.findById(assignment.id)).resolves.toBe(assignment);

    expect(events.events.map((event) => event.name)).toEqual(['worker.assigned']);
    const event = events.events[0] as WorkerAssigned;
    expect(event.payload.assignmentId).toBe(assignment.id);
    expect(event.payload.workerId).toBe(worker.id);
    expect(event.payload.machineId).toBe(machine.id);
    expect(event.payload.slot.equals(slot)).toBe(true);
  });

  it('lanza NotFoundError si el worker no existe', async () => {
    const { assign, repos } = setup();
    const machine = await seedMachine(repos);

    await expect(
      assign.execute(ADMIN, {
        workerId: WorkerId.create(),
        machineId: machine.id,
        slot: MONDAY_MORNING(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza asignar a un worker inactivo', async () => {
    const { assign, repos } = setup();
    const worker = await seedWorker(repos, { inactive: true });
    const machine = await seedMachine(repos);

    await expect(
      assign.execute(ADMIN, { workerId: worker.id, machineId: machine.id, slot: MONDAY_MORNING() }),
    ).rejects.toBeInstanceOf(InactiveWorkerError);
  });

  it('lanza NotFoundError si la máquina no existe', async () => {
    const { assign, repos } = setup();
    const worker = await seedWorker(repos);

    await expect(
      assign.execute(ADMIN, {
        workerId: worker.id,
        machineId: MachineId.create(),
        slot: MONDAY_MORNING(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza al rol worker', async () => {
    const { assign, repos } = setup();
    const worker = await seedWorker(repos);
    const machine = await seedMachine(repos);

    await expect(
      assign.execute(WORKER, {
        workerId: worker.id,
        machineId: machine.id,
        slot: MONDAY_MORNING(),
      }),
    ).rejects.toMatchObject({ name: 'UnauthorizedRoleError', useCase: 'AssignWorkerToMachine' });
  });

  it('rechaza al rol auditor', async () => {
    const { assign, repos } = setup();
    const worker = await seedWorker(repos);
    const machine = await seedMachine(repos);

    await expect(
      assign.execute(AUDITOR, {
        workerId: worker.id,
        machineId: machine.id,
        slot: MONDAY_MORNING(),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedRoleError);
  });
});

describe('AssignWorkerToMachine — I1 (solapamiento)', () => {
  it('rechaza solapamiento del mismo worker en OTRA máquina e informa el conflicto', async () => {
    const { assign, repos } = setup();
    const worker = await seedWorker(repos);
    const machineA = await seedMachine(repos, 'A');
    const machineB = await seedMachine(repos, 'B');
    const existing = await assign.execute(ADMIN, {
      workerId: worker.id,
      machineId: machineA.id,
      slot: TimeSlot.create([1], '08:00', '12:00'),
    });

    await expect(
      assign.execute(ADMIN, {
        workerId: worker.id,
        machineId: machineB.id,
        slot: TimeSlot.create([1], '10:00', '14:00'),
      }),
    ).rejects.toMatchObject({
      name: 'OverlappingScheduleError',
      workerId: worker.id,
      conflictingAssignmentId: existing.id,
    });
  });

  it('rechaza solapamiento del mismo worker en la MISMA máquina', async () => {
    const { assign, repos } = setup();
    const worker = await seedWorker(repos);
    const machine = await seedMachine(repos);
    await assign.execute(ADMIN, {
      workerId: worker.id,
      machineId: machine.id,
      slot: TimeSlot.create([1], '08:00', '12:00'),
    });

    await expect(
      assign.execute(ADMIN, {
        workerId: worker.id,
        machineId: machine.id,
        slot: TimeSlot.create([1], '09:00', '10:00'),
      }),
    ).rejects.toBeInstanceOf(OverlappingScheduleError);
  });

  it('rechaza un solapamiento por el borde inicial (1 minuto)', async () => {
    const { assign, repos } = setup();
    const worker = await seedWorker(repos);
    const machine = await seedMachine(repos);
    await assign.execute(ADMIN, {
      workerId: worker.id,
      machineId: machine.id,
      slot: TimeSlot.create([1], '08:00', '12:00'),
    });

    // 11:59–13:00 solapa 1 minuto con 08:00–12:00.
    await expect(
      assign.execute(ADMIN, {
        workerId: worker.id,
        machineId: machine.id,
        slot: TimeSlot.create([1], '11:59', '13:00'),
      }),
    ).rejects.toBeInstanceOf(OverlappingScheduleError);
  });

  it('rechaza un solapamiento por el borde final (1 minuto)', async () => {
    const { assign, repos } = setup();
    const worker = await seedWorker(repos);
    const machine = await seedMachine(repos);
    await assign.execute(ADMIN, {
      workerId: worker.id,
      machineId: machine.id,
      slot: TimeSlot.create([1], '08:00', '12:00'),
    });

    // 07:00–08:01 solapa 1 minuto con 08:00–12:00.
    await expect(
      assign.execute(ADMIN, {
        workerId: worker.id,
        machineId: machine.id,
        slot: TimeSlot.create([1], '07:00', '08:01'),
      }),
    ).rejects.toBeInstanceOf(OverlappingScheduleError);
  });

  it('acepta franjas adyacentes (end === start) del mismo worker', async () => {
    const { assign, repos } = setup();
    const worker = await seedWorker(repos);
    const machine = await seedMachine(repos);
    await assign.execute(ADMIN, {
      workerId: worker.id,
      machineId: machine.id,
      slot: TimeSlot.create([1], '08:00', '12:00'),
    });

    const adjacent = await assign.execute(ADMIN, {
      workerId: worker.id,
      machineId: machine.id,
      slot: TimeSlot.create([1], '12:00', '16:00'),
    });

    expect(adjacent.slot.start).toBe('12:00');
    await expect(repos.assignments.findByWorker(worker.id)).resolves.toHaveLength(2);
  });

  it('acepta el mismo horario en días distintos', async () => {
    const { assign, repos } = setup();
    const worker = await seedWorker(repos);
    const machine = await seedMachine(repos);
    await assign.execute(ADMIN, {
      workerId: worker.id,
      machineId: machine.id,
      slot: TimeSlot.create([1], '08:00', '12:00'),
    });

    await expect(
      assign.execute(ADMIN, {
        workerId: worker.id,
        machineId: machine.id,
        slot: TimeSlot.create([2], '08:00', '12:00'),
      }),
    ).resolves.toMatchObject({ machineId: machine.id });
  });

  it('acepta varios workers en la misma máquina y misma franja (N a N)', async () => {
    const { assign, repos } = setup();
    const workerA = await seedWorker(repos);
    const workerB = await seedWorker(repos);
    const machine = await seedMachine(repos);
    const slot = MONDAY_MORNING();

    await assign.execute(ADMIN, { workerId: workerA.id, machineId: machine.id, slot });
    await assign.execute(ADMIN, { workerId: workerB.id, machineId: machine.id, slot });

    await expect(repos.assignments.findByMachine(machine.id)).resolves.toHaveLength(2);
  });
});

describe('UnassignWorker', () => {
  it('elimina la asignación y emite worker.unassigned', async () => {
    const { assign, unassign, repos, events } = setup();
    const worker = await seedWorker(repos);
    const machine = await seedMachine(repos);
    const assignment = await assign.execute(ADMIN, {
      workerId: worker.id,
      machineId: machine.id,
      slot: MONDAY_MORNING(),
    });
    events.clear();

    await unassign.execute(ADMIN, { assignmentId: assignment.id });

    await expect(repos.assignments.findById(assignment.id)).resolves.toBeNull();
    await expect(repos.assignments.findByWorker(worker.id)).resolves.toHaveLength(0);
    expect(events.events.map((event) => event.name)).toEqual(['worker.unassigned']);
    const event = events.events[0] as WorkerUnassigned;
    expect(event.payload.assignmentId).toBe(assignment.id);
  });

  it('lanza NotFoundError si la asignación no existe', async () => {
    const { unassign } = setup();

    await expect(
      unassign.execute(ADMIN, { assignmentId: AssignmentId.create() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza al rol worker', async () => {
    const { assign, unassign, repos } = setup();
    const worker = await seedWorker(repos);
    const machine = await seedMachine(repos);
    const assignment = await assign.execute(ADMIN, {
      workerId: worker.id,
      machineId: machine.id,
      slot: MONDAY_MORNING(),
    });

    await expect(unassign.execute(WORKER, { assignmentId: assignment.id })).rejects.toMatchObject({
      name: 'UnauthorizedRoleError',
      useCase: 'UnassignWorker',
    });
  });

  it('rechaza al rol auditor', async () => {
    const { unassign } = setup();

    await expect(
      unassign.execute(AUDITOR, { assignmentId: AssignmentId.create() }),
    ).rejects.toBeInstanceOf(UnauthorizedRoleError);
  });
});

describe('ListWorkerSchedule', () => {
  it('devuelve las asignaciones del worker y admite al auditor', async () => {
    const { assign, listWorkerSchedule, repos } = setup();
    const workerA = await seedWorker(repos);
    const workerB = await seedWorker(repos);
    const machine = await seedMachine(repos);
    await assign.execute(ADMIN, {
      workerId: workerA.id,
      machineId: machine.id,
      slot: TimeSlot.create([1], '08:00', '12:00'),
    });
    await assign.execute(ADMIN, {
      workerId: workerA.id,
      machineId: machine.id,
      slot: TimeSlot.create([2], '08:00', '12:00'),
    });
    await assign.execute(ADMIN, {
      workerId: workerB.id,
      machineId: machine.id,
      slot: TimeSlot.create([1], '08:00', '12:00'),
    });

    await expect(listWorkerSchedule.execute(ADMIN, { workerId: workerA.id })).resolves.toHaveLength(
      2,
    );
    await expect(
      listWorkerSchedule.execute(AUDITOR, { workerId: workerB.id }),
    ).resolves.toHaveLength(1);
  });

  it('lanza NotFoundError si el worker no existe', async () => {
    const { listWorkerSchedule } = setup();

    await expect(
      listWorkerSchedule.execute(ADMIN, { workerId: WorkerId.create() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza al rol worker', async () => {
    const { listWorkerSchedule } = setup();

    await expect(
      listWorkerSchedule.execute(WORKER, { workerId: WorkerId.create() }),
    ).rejects.toBeInstanceOf(UnauthorizedRoleError);
  });
});

describe('ListMachineSchedule', () => {
  it('devuelve las asignaciones de la máquina y admite al auditor', async () => {
    const { assign, listMachineSchedule, repos } = setup();
    const workerA = await seedWorker(repos);
    const workerB = await seedWorker(repos);
    const machineA = await seedMachine(repos, 'A');
    const machineB = await seedMachine(repos, 'B');
    await assign.execute(ADMIN, {
      workerId: workerA.id,
      machineId: machineA.id,
      slot: TimeSlot.create([1], '08:00', '12:00'),
    });
    await assign.execute(ADMIN, {
      workerId: workerB.id,
      machineId: machineA.id,
      slot: TimeSlot.create([1], '08:00', '12:00'),
    });
    await assign.execute(ADMIN, {
      workerId: workerA.id,
      machineId: machineB.id,
      slot: TimeSlot.create([2], '08:00', '12:00'),
    });

    await expect(
      listMachineSchedule.execute(ADMIN, { machineId: machineA.id }),
    ).resolves.toHaveLength(2);
    await expect(
      listMachineSchedule.execute(AUDITOR, { machineId: machineB.id }),
    ).resolves.toHaveLength(1);
  });

  it('lanza NotFoundError si la máquina no existe', async () => {
    const { listMachineSchedule } = setup();

    await expect(
      listMachineSchedule.execute(ADMIN, { machineId: MachineId.create() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rechaza al rol worker', async () => {
    const { listMachineSchedule } = setup();

    await expect(
      listMachineSchedule.execute(WORKER, { machineId: MachineId.create() }),
    ).rejects.toBeInstanceOf(UnauthorizedRoleError);
  });
});
