import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carga `.env` con la API nativa de Node (`process.loadEnvFile`, Node ≥20.12/22),
 * sin añadir `dotenv`.
 *
 * - Solo actúa si el archivo existe: en CI/producción las variables pueden venir
 *   del entorno real y la ausencia de `.env` no es un error.
 * - Node **no pisa** variables ya definidas en el entorno, así que un
 *   `JWT_ACCESS_SECRET` exportado (o inyectado por el runner de tests) siempre
 *   gana sobre el archivo.
 * - Si el runtime no expone `loadEnvFile` (Node antiguo) el arranque sigue igual;
 *   para esos casos queda `node --env-file=.env dist/main.js`.
 *
 * Se llama explícitamente al inicio de cada entrypoint (`main.ts`, `db:migrate`,
 * `db:seed`) en vez de depender de `--env-file`, porque el CLI de Nest no
 * reenvía ese flag a `nest start`.
 *
 * @returns `true` si el archivo existía y se cargó.
 */
export function loadDotEnv(file = '.env'): boolean {
  const path = resolve(file);
  if (!existsSync(path)) {
    return false;
  }
  if (typeof process.loadEnvFile !== 'function') {
    return false;
  }
  process.loadEnvFile(path);
  return true;
}
