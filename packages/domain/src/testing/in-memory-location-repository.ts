import type { Location } from '../entities';
import type { LocationFilter, LocationRepository } from '../ports';
import type { LocationId } from '../value-objects';

import { InMemoryStore } from './in-memory-store';

function matches(location: Location, filter?: LocationFilter): boolean {
  if (filter?.kind !== undefined && location.kind !== filter.kind) {
    return false;
  }
  return true;
}

/** Fake en memoria de `LocationRepository` para tests (save = upsert). */
export class InMemoryLocationRepository implements LocationRepository {
  private readonly store = new InMemoryStore<LocationId, Location>();

  async findById(id: LocationId): Promise<Location | null> {
    return this.store.get(id);
  }

  async list(filter?: LocationFilter): Promise<readonly Location[]> {
    return this.store.all().filter((location) => matches(location, filter));
  }

  async save(location: Location): Promise<void> {
    this.store.upsert(location);
  }

  /** Vacía el almacén (solo tests). */
  clear(): void {
    this.store.clear();
  }
}
