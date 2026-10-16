import { InvalidLocationKindError, NotFoundError } from '../errors';
import { Machine, type MachineType } from '../entities/machine';
import type { EventBus } from '../events/event-bus';
import { machineCreated, machineMoved } from '../events/machine-events';
import type { MachineFilter, MachineRepository } from '../ports/machine-repository';
import type { LocationRepository } from '../ports/location-repository';
import type { LocationId, MachineId } from '../value-objects/ids';

import { CATALOG_READ_ROLES, CATALOG_WRITE_ROLES, requireRole, type Actor } from './actor';

// --- Dependencias ---

/** Alta y movimiento necesitan validar el lugar destino (I2) y emitir eventos. */
export interface MachineLocationDeps {
  readonly machines: MachineRepository;
  readonly locations: LocationRepository;
  readonly events: EventBus;
}

/** Actualización de datos propios: no toca el lugar ni emite eventos. */
export interface MachineWriteDeps {
  readonly machines: MachineRepository;
}

export interface MachineReadDeps {
  readonly machines: MachineRepository;
}

// --- Comandos ---

export interface CreateMachineCommand {
  readonly name: string;
  readonly type: MachineType;
  readonly locationId: LocationId;
}

export interface UpdateMachineCommand {
  readonly id: MachineId;
  readonly name?: string;
  readonly type?: MachineType;
}

export interface MoveMachineCommand {
  readonly id: MachineId;
  readonly locationId: LocationId;
}

export interface GetMachineCommand {
  readonly id: MachineId;
}

export interface ListMachinesCommand {
  readonly filter?: MachineFilter;
}

/**
 * `CreateMachine` (rol A): valida que el lugar exista y sea `production` (I2) y
 * emite `machine.created` tras persistir (docs/05).
 */
export class CreateMachine {
  constructor(private readonly deps: MachineLocationDeps) {}

  async execute(actor: Actor, command: CreateMachineCommand): Promise<Machine> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'CreateMachine');
    const location = await this.deps.locations.findById(command.locationId);
    if (!location) {
      throw new NotFoundError('Location', command.locationId);
    }
    if (location.kind !== 'production') {
      throw new InvalidLocationKindError(location.kind, location.id);
    }
    const machine = Machine.create({
      name: command.name,
      type: command.type,
      locationId: command.locationId,
    });
    await this.deps.machines.save(machine);
    await this.deps.events.publish(
      machineCreated({ machineId: machine.id, locationId: machine.locationId }),
    );
    return machine;
  }
}

/**
 * `UpdateMachine` (rol A): actualiza nombre y/o tipo (copy-on-write). No mueve
 * la máquina (eso es `MoveMachine`) ni emite eventos (docs/05 no los define).
 */
export class UpdateMachine {
  constructor(private readonly deps: MachineWriteDeps) {}

  async execute(actor: Actor, command: UpdateMachineCommand): Promise<Machine> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'UpdateMachine');
    const current = await this.deps.machines.findById(command.id);
    if (!current) {
      throw new NotFoundError('Machine', command.id);
    }
    const updated = Machine.fromPersistence({
      id: current.id,
      name: command.name ?? current.name,
      type: command.type ?? current.type,
      locationId: current.locationId,
      status: current.status,
    });
    await this.deps.machines.save(updated);
    return updated;
  }
}

/**
 * `MoveMachine` (rol A): valida el lugar destino (existencia + kind
 * `production`, I2) usando la transición `Machine.moveTo` y emite
 * `machine.moved` (docs/05).
 */
export class MoveMachine {
  constructor(private readonly deps: MachineLocationDeps) {}

  async execute(actor: Actor, command: MoveMachineCommand): Promise<Machine> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'MoveMachine');
    const machine = await this.deps.machines.findById(command.id);
    if (!machine) {
      throw new NotFoundError('Machine', command.id);
    }
    const location = await this.deps.locations.findById(command.locationId);
    if (!location) {
      throw new NotFoundError('Location', command.locationId);
    }
    const moved = machine.moveTo(location);
    await this.deps.machines.save(moved);
    await this.deps.events.publish(
      machineMoved({ machineId: moved.id, locationId: moved.locationId }),
    );
    return moved;
  }
}

/** `GetMachine` (roles A, Au): devuelve la máquina o lanza `NotFoundError`. */
export class GetMachine {
  constructor(private readonly deps: MachineReadDeps) {}

  async execute(actor: Actor, command: GetMachineCommand): Promise<Machine> {
    requireRole(actor, CATALOG_READ_ROLES, 'GetMachine');
    const machine = await this.deps.machines.findById(command.id);
    if (!machine) {
      throw new NotFoundError('Machine', command.id);
    }
    return machine;
  }
}

/** `ListMachines` (roles A, Au): listado con filtro opcional. */
export class ListMachines {
  constructor(private readonly deps: MachineReadDeps) {}

  async execute(actor: Actor, command: ListMachinesCommand): Promise<readonly Machine[]> {
    requireRole(actor, CATALOG_READ_ROLES, 'ListMachines');
    return this.deps.machines.list(command.filter);
  }
}
