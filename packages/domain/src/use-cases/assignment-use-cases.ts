import { InactiveWorkerError, NotFoundError, OverlappingScheduleError } from '../errors';
import { Assignment } from '../entities/assignment';
import type { EventBus } from '../events/event-bus';
import { workerAssigned, workerUnassigned } from '../events/assignment-events';
import type { AssignmentRepository } from '../ports/assignment-repository';
import type { MachineRepository } from '../ports/machine-repository';
import type { WorkerRepository } from '../ports/worker-repository';
import type { AssignmentId, MachineId, WorkerId } from '../value-objects/ids';
import type { TimeSlot } from '../value-objects/time-slot';

import { CATALOG_READ_ROLES, CATALOG_WRITE_ROLES, requireRole, type Actor } from './actor';

// --- Dependencias ---

/** Asignar/desasignar valida worker y máquina y emite eventos (docs/05). */
export interface AssignmentWriteDeps {
  readonly assignments: AssignmentRepository;
  readonly workers: WorkerRepository;
  readonly machines: MachineRepository;
  readonly events: EventBus;
}

/** Las agendas validan la existencia del worker/máquina pero no emiten eventos. */
export interface AssignmentReadDeps {
  readonly assignments: AssignmentRepository;
  readonly workers: WorkerRepository;
  readonly machines: MachineRepository;
}

// --- Comandos ---

export interface AssignWorkerToMachineCommand {
  readonly workerId: WorkerId;
  readonly machineId: MachineId;
  readonly slot: TimeSlot;
}

export interface UnassignWorkerCommand {
  readonly assignmentId: AssignmentId;
}

export interface ListWorkerScheduleCommand {
  readonly workerId: WorkerId;
}

export interface ListMachineScheduleCommand {
  readonly machineId: MachineId;
}

/**
 * `AssignWorkerToMachine` (rol A): crea una asignación tras validar, en orden,
 * worker (existe y está activo), máquina (existe) e **I1** (el worker no puede
 * tener otra asignación con horario solapado). Franjas adyacentes (end === start)
 * no solapan. Tras persistir emite `worker.assigned` (docs/05).
 */
export class AssignWorkerToMachine {
  constructor(private readonly deps: AssignmentWriteDeps) {}

  async execute(actor: Actor, command: AssignWorkerToMachineCommand): Promise<Assignment> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'AssignWorkerToMachine');

    const worker = await this.deps.workers.findById(command.workerId);
    if (!worker) {
      throw new NotFoundError('Worker', command.workerId);
    }
    if (!worker.active) {
      throw new InactiveWorkerError(worker.id);
    }

    const machine = await this.deps.machines.findById(command.machineId);
    if (!machine) {
      throw new NotFoundError('Machine', command.machineId);
    }

    const existing = await this.deps.assignments.findByWorker(command.workerId);
    const conflicting = existing.find((assignment) => assignment.slot.overlaps(command.slot));
    if (conflicting) {
      throw new OverlappingScheduleError(command.workerId, conflicting.id);
    }

    const assignment = Assignment.create({
      workerId: command.workerId,
      machineId: command.machineId,
      slot: command.slot,
    });
    await this.deps.assignments.save(assignment);
    await this.deps.events.publish(
      workerAssigned({
        assignmentId: assignment.id,
        workerId: assignment.workerId,
        machineId: assignment.machineId,
        slot: assignment.slot,
      }),
    );
    return assignment;
  }
}

/**
 * `UnassignWorker` (rol A): elimina una asignación existente. Lanza
 * `NotFoundError` si no existe y emite `worker.unassigned` tras eliminarla
 * (docs/05).
 */
export class UnassignWorker {
  constructor(private readonly deps: AssignmentWriteDeps) {}

  async execute(actor: Actor, command: UnassignWorkerCommand): Promise<void> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'UnassignWorker');

    const assignment = await this.deps.assignments.findById(command.assignmentId);
    if (!assignment) {
      throw new NotFoundError('Assignment', command.assignmentId);
    }

    await this.deps.assignments.delete(command.assignmentId);
    await this.deps.events.publish(workerUnassigned({ assignmentId: command.assignmentId }));
  }
}

/**
 * `ListWorkerSchedule` (roles A, Au): asignaciones de un worker. Valida que el
 * worker exista (`NotFoundError`) para no devolver una agenda vacía engañosa.
 */
export class ListWorkerSchedule {
  constructor(private readonly deps: AssignmentReadDeps) {}

  async execute(actor: Actor, command: ListWorkerScheduleCommand): Promise<readonly Assignment[]> {
    requireRole(actor, CATALOG_READ_ROLES, 'ListWorkerSchedule');

    const worker = await this.deps.workers.findById(command.workerId);
    if (!worker) {
      throw new NotFoundError('Worker', command.workerId);
    }
    return this.deps.assignments.findByWorker(command.workerId);
  }
}

/**
 * `ListMachineSchedule` (roles A, Au): asignaciones de una máquina. Valida que
 * la máquina exista (`NotFoundError`).
 */
export class ListMachineSchedule {
  constructor(private readonly deps: AssignmentReadDeps) {}

  async execute(actor: Actor, command: ListMachineScheduleCommand): Promise<readonly Assignment[]> {
    requireRole(actor, CATALOG_READ_ROLES, 'ListMachineSchedule');

    const machine = await this.deps.machines.findById(command.machineId);
    if (!machine) {
      throw new NotFoundError('Machine', command.machineId);
    }
    return this.deps.assignments.findByMachine(command.machineId);
  }
}
