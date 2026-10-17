import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/tursodatabase/migrator';

import type { Db } from './client.js';

/**
 * Carpeta de migraciones versionadas (`apps/api/drizzle`), resuelta a partir de
 * la ubicación de este módulo para funcionar tanto compilado (`dist/persistence`)
 * como con `tsx` (`src/persistence`).
 */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Aplica las migraciones pendientes sobre `db` (idempotente). */
export async function applyMigrations(db: Db, migrationsFolder: string = MIGRATIONS_FOLDER): Promise<void> {
  await migrate(db, { migrationsFolder });
}
