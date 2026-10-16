import { NotFoundError } from '../errors';
import { Worker, type WorkerRole } from '../entities/worker';
import type { WorkerFilter, WorkerRepository } from '../ports/worker-repository';
import type { WorkerId } from '../value-objects/ids';

import { CATALOG_READ_ROLES, CATALOG_WRITE_ROLES, requireRole, type Actor } from './actor';

// --- Dependencias ---

/** Los trabajadores no tienen eventos de catálogo en docs/05. */
export interface WorkerWriteDeps {
  readonly workers: WorkerRepository;
}

export interface WorkerReadDeps {
  readonly workers: WorkerRepository;
}

// --- Comandos ---

export interface CreateWorkerCommand {
  readonly name: string;
  readonly role: WorkerRole;
}

export interface UpdateWorkerCommand {
  readonly id: WorkerId;
  readonly name?: string;
  readonly role?: WorkerRole;
}

export interface DeactivateWorkerCommand {
  readonly id: WorkerId;
}

export interface GetWorkerCommand {
  readonly id: WorkerId;
}

export interface ListWorkersCommand {
  readonly filter?: WorkerFilter;
}

/** `CreateWorker` (rol A): alta de trabajador (activo por defecto). */
export class CreateWorker {
  constructor(private readonly deps: WorkerWriteDeps) {}

  async execute(actor: Actor, command: CreateWorkerCommand): Promise<Worker> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'CreateWorker');
    const worker = Worker.create({ ...command });
    await this.deps.workers.save(worker);
    return worker;
  }
}

/** `UpdateWorker` (rol A): actualiza nombre y/o rol (copy-on-write). */
export class UpdateWorker {
  constructor(private readonly deps: WorkerWriteDeps) {}

  async execute(actor: Actor, command: UpdateWorkerCommand): Promise<Worker> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'UpdateWorker');
    const current = await this.deps.workers.findById(command.id);
    if (!current) {
      throw new NotFoundError('Worker', command.id);
    }
    const updated = Worker.fromPersistence({
      id: current.id,
      name: command.name ?? current.name,
      role: command.role ?? current.role,
      active: current.active,
    });
    await this.deps.workers.save(updated);
    return updated;
  }
}

/** `DeactivateWorker` (rol A): baja lógica vía `Worker.deactivate` (idempotente). */
export class DeactivateWorker {
  constructor(private readonly deps: WorkerWriteDeps) {}

  async execute(actor: Actor, command: DeactivateWorkerCommand): Promise<Worker> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'DeactivateWorker');
    const current = await this.deps.workers.findById(command.id);
    if (!current) {
      throw new NotFoundError('Worker', command.id);
    }
    const updated = current.deactivate();
    await this.deps.workers.save(updated);
    return updated;
  }
}

/** `GetWorker` (roles A, Au): devuelve el trabajador o lanza `NotFoundError`. */
export class GetWorker {
  constructor(private readonly deps: WorkerReadDeps) {}

  async execute(actor: Actor, command: GetWorkerCommand): Promise<Worker> {
    requireRole(actor, CATALOG_READ_ROLES, 'GetWorker');
    const worker = await this.deps.workers.findById(command.id);
    if (!worker) {
      throw new NotFoundError('Worker', command.id);
    }
    return worker;
  }
}

/** `ListWorkers` (roles A, Au): listado con filtro opcional por rol/activo. */
export class ListWorkers {
  constructor(private readonly deps: WorkerReadDeps) {}

  async execute(actor: Actor, command: ListWorkersCommand): Promise<readonly Worker[]> {
    requireRole(actor, CATALOG_READ_ROLES, 'ListWorkers');
    return this.deps.workers.list(command.filter);
  }
}
