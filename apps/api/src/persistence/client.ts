import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/tursodatabase/database';

import { resolveDbFile } from './config.js';

/**
 * Cliente Drizzle sobre el motor embebido de Turso (`@tursodatabase/database`).
 *
 * Decisión de cliente (ver `src/persistence/README.md` para el detalle):
 * Drizzle v1 (RC) expone un driver de primera clase `drizzle-orm/tursodatabase/database`
 * para `@tursodatabase/database`, el SDK actual del motor de Turso. El Drizzle
 * estable (0.45.x) solo soporta `@libsql/client` (libSQL, SDK anterior). Elegimos
 * el SDK actual con la línea RC de Drizzle y pineamos versiones exactas.
 *
 * La API de este driver es **asíncrona** (`SQLiteAsyncDatabase`): los métodos de
 * consulta devuelven promesas y las transacciones se abren con `db.transaction`.
 */

export type Db = ReturnType<typeof createDb>;

/** Crea (abriendo/creando el archivo) un cliente Drizzle. */
export function createDb(dbFile: string = resolveDbFile()): ReturnType<typeof buildDb> {
  const absolute = resolve(dbFile);
  mkdirSync(dirname(absolute), { recursive: true });
  return buildDb(absolute);
}

function buildDb(absolutePath: string) {
  return drizzle(absolutePath);
}

/** Cierra la conexión subyacente (libera el archivo). */
export async function closeDb(db: Db): Promise<void> {
  await db.$client.close();
}
