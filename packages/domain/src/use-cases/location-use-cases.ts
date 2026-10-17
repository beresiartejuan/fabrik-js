import { Location, type LocationKind } from '../entities/location.js';
import { NotFoundError } from '../errors/index.js';
import type { LocationFilter, LocationRepository } from '../ports/location-repository.js';
import type { LocationId } from '../value-objects/ids.js';

import { type Actor, CATALOG_READ_ROLES, CATALOG_WRITE_ROLES, requireRole } from './actor.js';

// --- Dependencias ---

/** Los lugares no tienen eventos en docs/05: solo repositorio. */
export interface LocationWriteDeps {
  readonly locations: LocationRepository;
}

export interface LocationReadDeps {
  readonly locations: LocationRepository;
}

// --- Comandos ---

export interface CreateLocationCommand {
  readonly name: string;
  readonly kind: LocationKind;
}

export interface UpdateLocationCommand {
  readonly id: LocationId;
  readonly name?: string;
}

export interface GetLocationCommand {
  readonly id: LocationId;
}

export interface ListLocationsCommand {
  readonly filter?: LocationFilter;
}

/** `CreateLocation` (rol A): crea un lugar de producción o almacenamiento. */
export class CreateLocation {
  constructor(private readonly deps: LocationWriteDeps) {}

  async execute(actor: Actor, command: CreateLocationCommand): Promise<Location> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'CreateLocation');
    const location = Location.create({ ...command });
    await this.deps.locations.save(location);
    return location;
  }
}

/**
 * `UpdateLocation` (rol A): renombra un lugar (copy-on-write).
 *
 * Decisión de alcance: no se permite cambiar `kind`. Hacerlo podría violar I2
 * (una máquina quedaría en un lugar que pasa a `storage`) y detectarlo exigiría
 * consultar máquinas por lugar, fuera del alcance de Fase 5.
 */
export class UpdateLocation {
  constructor(private readonly deps: LocationWriteDeps) {}

  async execute(actor: Actor, command: UpdateLocationCommand): Promise<Location> {
    requireRole(actor, CATALOG_WRITE_ROLES, 'UpdateLocation');
    const current = await this.deps.locations.findById(command.id);
    if (!current) {
      throw new NotFoundError('Location', command.id);
    }
    const updated = Location.fromPersistence({
      id: current.id,
      name: command.name ?? current.name,
      kind: current.kind,
    });
    await this.deps.locations.save(updated);
    return updated;
  }
}

/** `GetLocation` (roles A, Au): devuelve el lugar o lanza `NotFoundError`. */
export class GetLocation {
  constructor(private readonly deps: LocationReadDeps) {}

  async execute(actor: Actor, command: GetLocationCommand): Promise<Location> {
    requireRole(actor, CATALOG_READ_ROLES, 'GetLocation');
    const location = await this.deps.locations.findById(command.id);
    if (!location) {
      throw new NotFoundError('Location', command.id);
    }
    return location;
  }
}

/** `ListLocations` (roles A, Au): listado con filtro opcional por kind. */
export class ListLocations {
  constructor(private readonly deps: LocationReadDeps) {}

  async execute(actor: Actor, command: ListLocationsCommand): Promise<readonly Location[]> {
    requireRole(actor, CATALOG_READ_ROLES, 'ListLocations');
    return this.deps.locations.list(command.filter);
  }
}
