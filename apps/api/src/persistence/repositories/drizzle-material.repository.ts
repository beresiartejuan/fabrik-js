import type { Material, MaterialFilter, MaterialId, MaterialRepository } from '@fabrik/domain';
import { and, eq } from 'drizzle-orm';

import type { Executor } from '../executor.js';
import { materialToRow, rowToMaterial } from '../mappers.js';
import { materials } from '../schema.js';

/** Adaptador Drizzle de `MaterialRepository` (`save` = upsert por `id`). */
export class DrizzleMaterialRepository implements MaterialRepository {
  constructor(private readonly db: Executor) {}

  async findById(id: MaterialId): Promise<Material | null> {
    const rows = await this.db.select().from(materials).where(eq(materials.id, id)).limit(1);
    return rows.length > 0 ? rowToMaterial(rows[0]) : null;
  }

  async list(filter?: MaterialFilter): Promise<readonly Material[]> {
    const conditions = [];
    if (filter?.kind !== undefined) {
      conditions.push(eq(materials.kind, filter.kind));
    }
    if (filter?.physicalState !== undefined) {
      conditions.push(eq(materials.physicalState, filter.physicalState));
    }
    const rows = await this.db
      .select()
      .from(materials)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    return rows.map(rowToMaterial);
  }

  async save(material: Material): Promise<void> {
    const row = materialToRow(material);
    await this.db
      .insert(materials)
      .values(row)
      .onConflictDoUpdate({ target: materials.id, set: row });
  }

  async existsByName(name: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: materials.id })
      .from(materials)
      .where(eq(materials.name, name))
      .limit(1);
    return rows.length > 0;
  }
}
