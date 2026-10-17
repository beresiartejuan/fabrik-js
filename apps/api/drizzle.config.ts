import { defineConfig } from 'drizzle-kit';

/**
 * Configuración de drizzle-kit para generar las migraciones SQL del esquema de
 * `apps/api/src/persistence/schema.ts`.
 *
 * Notas de decisión (ver `apps/api/README.md` y `src/persistence/README.md`):
 * - `dialect: 'sqlite'`: `@tursodatabase/database` es un motor compatible con
 *   SQLite; el dialecto SQL de drizzle-kit es el mismo. `drizzle-kit` solo se
 *   usa para `generate` (diff esquema → SQL); la aplicación de migraciones se
 *   hace con el migrador del driver (`db:migrate`), no con `drizzle-kit migrate`,
 *   para no arrastrar otro cliente de conexión.
 * - `out`: carpeta de migraciones versionadas (`apps/api/drizzle`).
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/persistence/schema.ts',
  out: './drizzle',
});
