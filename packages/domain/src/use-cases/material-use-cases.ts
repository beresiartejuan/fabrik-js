import { NotFoundError } from '../errors/index.js';
import { Material, type MaterialKind } from '../entities/material.js';
import type { EventBus } from '../events/event-bus.js';
import { materialCreated, materialUpdated } from '../events/material-events.js';
import type { MaterialFilter, MaterialRepository } from '../ports/material-repository.js';
import type { MaterialId } from '../value-objects/ids.js';
import type { PhysicalState, UnitOfMeasure } from '../value-objects/quantity.js';

import { CATALOG_READ_ROLES, CATALOG_WRITE_ROLES, requireRole, type Actor } from './actor.js';

// --- Dependencias ---

/** Escritura de materiales: repositorio + bus para los eventos de docs/05. */
export interface MaterialWriteDeps {
  readonly materials: MaterialRepository;
  readonly events: EventBus;
}

/** Lectura de materiales: solo repositorio. */
export interface MaterialReadDeps {
  readonly materials: MaterialRepository;
}

// --- Comandos ---

export interface CreateMaterialCommand {
  readonly name: string;
  readonly description?: string;
  readonly kind: MaterialKind;
  readonly physicalState: PhysicalState;
  readonly unitOfMeasure: UnitOfMeasure;
}

export interface UpdateMaterialCommand {
  readonly id: MaterialId;
  readonly name?: string;
  readonly description?: string;
  readonly unitOfMeasure?: UnitOfMeasure;
}

export interface DeactivateMaterialCommand {
  readonly id: MaterialId;
}

export interface GetMaterialCommand {
  readonly id: MaterialId;
}

export interface ListMaterialsCommand {
  readonly filter?: MaterialFilter;
}

/**
 * `CreateMaterial` (rol A): crea un material validando unidad ↔ estado físico
 * (I6) y emite `material.created` tras persistir (docs/05).
 */
export class CreateMaterial {
  constructor(private readonly deps: MaterialWriteDeps) {}

  async execute(actor: Actor, command: CreateMaterialCommand): Promise<Material> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'CreateMaterial');
    const material = Material.create({ ...command });
    await this.deps.materials.save(material);
    await this.deps.events.publish(materialCreated({ materialId: material.id }));
    return material;
  }
}

/**
 * `UpdateMaterial` (rol A): actualiza nombre, descripción y/o unidad. La entidad
 * es inmutable, así que se aplica copy-on-write con `fromPersistence`, que vuelve
 * a validar la coherencia unidad ↔ estado físico. Emite `material.updated`.
 */
export class UpdateMaterial {
  constructor(private readonly deps: MaterialWriteDeps) {}

  async execute(actor: Actor, command: UpdateMaterialCommand): Promise<Material> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'UpdateMaterial');
    const current = await this.deps.materials.findById(command.id);
    if (!current) {
      throw new NotFoundError('Material', command.id);
    }
    const updated = Material.fromPersistence({
      id: current.id,
      name: command.name ?? current.name,
      description: command.description ?? current.description,
      kind: current.kind,
      physicalState: current.physicalState,
      unitOfMeasure: command.unitOfMeasure ?? current.unitOfMeasure,
      active: current.active,
    });
    await this.deps.materials.save(updated);
    await this.deps.events.publish(materialUpdated({ materialId: updated.id }));
    return updated;
  }
}

/**
 * `DeactivateMaterial` (rol A): baja lógica vía `active = false`. Emite
 * `material.updated` solo cuando el estado cambia (idempotente: repetir la baja
 * no vuelve a publicar).
 */
export class DeactivateMaterial {
  constructor(private readonly deps: MaterialWriteDeps) {}

  async execute(actor: Actor, command: DeactivateMaterialCommand): Promise<Material> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'DeactivateMaterial');
    const current = await this.deps.materials.findById(command.id);
    if (!current) {
      throw new NotFoundError('Material', command.id);
    }
    const updated = current.deactivate();
    await this.deps.materials.save(updated);
    if (updated !== current) {
      await this.deps.events.publish(materialUpdated({ materialId: updated.id }));
    }
    return updated;
  }
}

/** `GetMaterial` (roles A, Au): devuelve el material o lanza `NotFoundError`. */
export class GetMaterial {
  constructor(private readonly deps: MaterialReadDeps) {}

  async execute(actor: Actor, command: GetMaterialCommand): Promise<Material> {
    requireRole(actor, CATALOG_READ_ROLES, 'GetMaterial');
    const material = await this.deps.materials.findById(command.id);
    if (!material) {
      throw new NotFoundError('Material', command.id);
    }
    return material;
  }
}

/** `ListMaterials` (roles A, Au): listado con filtro opcional por kind/estado. */
export class ListMaterials {
  constructor(private readonly deps: MaterialReadDeps) {}

  async execute(actor: Actor, command: ListMaterialsCommand): Promise<readonly Material[]> {
    requireRole(actor, CATALOG_READ_ROLES, 'ListMaterials');
    return this.deps.materials.list(command.filter);
  }
}
