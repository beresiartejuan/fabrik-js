import { closeDb, createDb } from './client.js';
import { resolveDbFile } from './config.js';
import { applyMigrations } from './migrations.js';

/**
 * Entrypoint de migraciones (`pnpm --filter api db:migrate`).
 *
 * Se ejecuta con `tsx` en desarrollo y con `node dist/persistence/migrate.js`
 * tras `build`. Aplica las migraciones de `apps/api/drizzle` sobre el archivo
 * indicado por `FABRIK_DB_FILE` (default `./data/fabrik.db`).
 */
async function main(): Promise<void> {
  const dbFile = resolveDbFile();
  const db = createDb(dbFile);
  try {
    await applyMigrations(db);
    console.log(`[db:migrate] migraciones aplicadas sobre ${dbFile}`);
  } finally {
    await closeDb(db);
  }
}

main().catch((error: unknown) => {
  console.error('[db:migrate] error al aplicar migraciones:', error);
  process.exitCode = 1;
});
