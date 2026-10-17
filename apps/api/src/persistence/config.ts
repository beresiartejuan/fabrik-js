/**
 * Configuración de persistencia vía variables de entorno.
 *
 * - `FABRIK_DB_FILE`: ruta al archivo SQLite local. Por defecto `./data/fabrik.db`
 *   (relativa al directorio de trabajo del proceso, normalmente `apps/api`).
 *
 * No hace falta una URL de Turso remota en esta etapa (ver docs/09, Fase 1 y el
 * apartado de riesgos: "Turso local (archivo) vs remoto").
 */
export const DEFAULT_DB_FILE = './data/fabrik.db';

export interface PersistenceEnv {
  readonly FABRIK_DB_FILE?: string;
}

/** Resuelve el archivo de base de datos a partir del entorno (con default). */
export function resolveDbFile(env: PersistenceEnv = process.env): string {
  const configured = env.FABRIK_DB_FILE?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_DB_FILE;
}
