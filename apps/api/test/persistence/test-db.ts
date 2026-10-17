import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Repositories, UnitOfWork } from '@fabrik/domain';

import {
  applyMigrations,
  closeDb,
  createDb,
  createRepositories,
  type Db,
  DrizzleUnitOfWork,
} from '../../src/persistence/index.js';

/** Carpeta de migraciones resuelta desde este helper (`apps/api/drizzle`). */
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export interface TestDatabase {
  readonly db: Db;
  readonly repositories: Repositories;
  readonly unitOfWork: UnitOfWork;
  readonly dir: string;
  /** Cierra la conexión y borra el archivo temporal. */
  close(): Promise<void>;
}

/**
 * Crea un SQLite temporal y aplica las migraciones. Cada test obtiene una base
 * aislada; los adaptadores y el `UnitOfWork` apuntan a esa base.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const dir = mkdtempSync(join(tmpdir(), 'fabrik-api-test-'));
  const db = createDb(join(dir, 'fabrik.db'));
  await applyMigrations(db, MIGRATIONS_FOLDER);
  return {
    db,
    repositories: createRepositories(db),
    unitOfWork: new DrizzleUnitOfWork(db),
    dir,
    async close(): Promise<void> {
      await closeDb(db);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
