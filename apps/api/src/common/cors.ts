import type { INestApplication } from '@nestjs/common';

/**
 * CORS de la API (post-plan; resuelve el riesgo anotado en `docs/arquitectura.md`).
 *
 * `apps/web` (Next) corre en otro origen que la API, así que sin CORS el front no
 * puede llamar a `http://localhost:3001` desde el navegador. La configuración vive
 * aquí (y no en `main.ts`) para que la app real y el helper e2e monten **la misma**
 * política y los tests cubran la configuración de verdad.
 *
 * Decisiones:
 * - **Lista blanca por env `CORS_ORIGINS`** (separada por comas). Sin ella se usa el
 *   default de desarrollo (`http://localhost:3000`, el puerto de `next dev`); en
 *   producción hay que definirla explícitamente.
 * - **`credentials: false`**: la API autentica con `Authorization: Bearer`, no con
 *   cookies de sesión, así que no hace falta `Access-Control-Allow-Credentials`
 *   (ni el comodín con credenciales, que los navegadores prohíben).
 */

/** Orígenes permitidos por defecto en desarrollo (puerto de `next dev`). */
export const DEFAULT_CORS_ORIGINS: readonly string[] = ['http://localhost:3000'];

/** Parsea `CORS_ORIGINS` (coma-separado); vacío/ausente → default de desarrollo. */
export function resolveCorsOrigins(raw: string | undefined): string[] {
  const value = raw?.trim();
  if (!value) {
    return [...DEFAULT_CORS_ORIGINS];
  }
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/** Habilita CORS en la app con la política resuelta desde `CORS_ORIGINS`. */
export function enableCors(
  app: INestApplication,
  raw: string | undefined = process.env.CORS_ORIGINS,
): void {
  app.enableCors({
    origin: resolveCorsOrigins(raw),
    credentials: false,
  });
}
