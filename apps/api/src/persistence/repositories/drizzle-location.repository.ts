import type { Location, LocationFilter, LocationId, LocationRepository } from '@fabrik/domain';
import { eq } from 'drizzle-orm';

import type { Executor } from '../executor.js';
import { locationToRow, rowToLocation } from '../mappers.js';
import { locations } from '../schema.js';

/** Adaptador Drizzle de `LocationRepository` (`save` = upsert por `id`). */
export class DrizzleLocationRepository implements LocationRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: LocationId): Promise<Location | null> {
    const rows = await this.db.select().from(locations).where(eq(locations.id, id)).limit(1);
    return rows.length > 0 ? rowToLocation(rows[0]) : null;
  }

  async list(filter?: LocationFilter): Promise<readonly Location[]> {
    const rows = await this.db
      .select()
      .from(locations)
      .where(filter?.kind !== undefined ? eq(locations.kind, filter.kind) : undefined);
    return rows.map(rowToLocation);
  }

  async save(location: Location): Promise<void> {
    const row = locationToRow(location);
    await this.db
      .insert(locations)
      .values(row)
      .onConflictDoUpdate({ target: locations.id, set: row });
  }
}
