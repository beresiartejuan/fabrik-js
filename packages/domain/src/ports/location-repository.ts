import type { Location, LocationKind } from '../entities/location.js';
import type { LocationId } from '../value-objects/ids.js';

// Filtro explícito y pequeño para `list`.
export interface LocationFilter {
  readonly kind?: LocationKind;
}

/**
 * Persistencia del catálogo de lugares (docs/04, `CreateLocation`/`UpdateLocation`).
 * `save` es upsert por `id`; `findById` devuelve `null` si no existe.
 */
export interface LocationRepository {
  findById(id: LocationId): Promise<Location | null>;
  list(filter?: LocationFilter): Promise<readonly Location[]>;
  save(location: Location): Promise<void>;
}
