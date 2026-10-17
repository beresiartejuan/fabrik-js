import { Worker, type WorkerRole } from '../entities/worker.js';
import {
  type LastAdminAction,
  LastAdminError,
  NotFoundError,
  type SelfModificationField,
  SelfModificationNotAllowedError,
} from '../errors/index.js';
import type { WorkerFilter, WorkerRepository } from '../ports/worker-repository.js';
import type { WorkerId } from '../value-objects/ids.js';

import { type Actor, CATALOG_READ_ROLES, CATALOG_WRITE_ROLES, requireRole } from './actor.js';

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

// Helpers de las invariantes anti-lockout (deben correr tras resolver el worker
// destino y antes de persistir cualquier cambio).

/** Un admin no puede modificar su propio rol ni desactivarse. */
function assertNotSelfModification(
  actor: Actor,
  target: Worker,
  useCase: string,
  field: SelfModificationField,
): void {
  if (actor.workerId === target.id) {
    throw new SelfModificationNotAllowedError(target.id, useCase, field);
  }
}

/**
 * El último admin activo no puede desactivarse ni perder el rol: el sistema
 * quedaría sin nadie capaz de gestionar catálogos y admins.
 */
async function assertNotLastActiveAdmin(
  workers: WorkerRepository,
  target: Worker,
  useCase: string,
  action: LastAdminAction,
): Promise<void> {
  if (!target.active || !target.isAdmin()) {
    return;
  }
  const activeAdmins = await workers.list({ role: 'admin', active: true });
  if (activeAdmins.length <= 1) {
    throw new LastAdminError(target.id, useCase, action);
  }
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

/**
 * `UpdateWorker` (rol A): actualiza nombre y/o rol (copy-on-write).
 *
 * Invariantes anti-lockout: un admin no puede cambiarse el rol a sí mismo
 * (`SelfModificationNotAllowedError`) y no se puede degradar al último admin
 * activo (`LastAdminError`). Cambiar solo el nombre está permitido.
 */
export class UpdateWorker {
  constructor(private readonly deps: WorkerWriteDeps) {}

  async execute(actor: Actor, command: UpdateWorkerCommand): Promise<Worker> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'UpdateWorker');
    const current = await this.deps.workers.findById(command.id);
    if (!current) {
      throw new NotFoundError('Worker', command.id);
    }

    const nextRole = command.role ?? current.role;
    const roleChanged = nextRole !== current.role;
    if (roleChanged) {
      assertNotSelfModification(actor, current, 'UpdateWorker', 'role');
      if (current.role === 'admin') {
        await assertNotLastActiveAdmin(this.deps.workers, current, 'UpdateWorker', 'demote');
      }
    }

    const updated = Worker.fromPersistence({
      id: current.id,
      name: command.name ?? current.name,
      role: nextRole,
      active: current.active,
    });
    await this.deps.workers.save(updated);
    return updated;
  }
}

/**
 * `DeactivateWorker` (rol A): baja lógica vía `Worker.deactivate` (idempotente).
 *
 * Invariantes anti-lockout: un admin no puede desactivarse a sí mismo
 * (`SelfModificationNotAllowedError`) y no se puede desactivar al último admin
 * activo (`LastAdminError`).
 */
export class DeactivateWorker {
  constructor(private readonly deps: WorkerWriteDeps) {}

  async execute(actor: Actor, command: DeactivateWorkerCommand): Promise<Worker> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'DeactivateWorker');
    const current = await this.deps.workers.findById(command.id);
    if (!current) {
      throw new NotFoundError('Worker', command.id);
    }

    assertNotSelfModification(actor, current, 'DeactivateWorker', 'active');
    await assertNotLastActiveAdmin(this.deps.workers, current, 'DeactivateWorker', 'deactivate');

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
