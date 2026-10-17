/**
 * Configuración de auth vía variables de entorno (Fase 3, docs/09).
 *
 * Variables:
 * - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: secretos HMAC de acceso y refresco.
 *   **Obligatorias** fuera de tests: si faltan, el arranque falla en claro
 *   (*fail fast*) en vez de firmar con un secreto por defecto.
 * - `JWT_ACCESS_TTL_SECONDS` (default 900 = 15 min) y `JWT_REFRESH_TTL_SECONDS`
 *   (default 2592000 = 30 días).
 * - `BOOTSTRAP_ADMIN_NAME` + `BOOTSTRAP_ADMIN_PASSWORD`: crean (solo si no existen)
 *   un worker `admin` con su credencial al arrancar. Pensado para desarrollo y
 *   para el e2e; en producción conviene sembrar por otra vía.
 *
 * En tests (`NODE_ENV=test`, que Vitest fija, o `VITEST`) se inyectan secretos por
 * defecto para no repetirlos en cada spec. El resto de defaults aplican siempre.
 */

/** Cuánto vive un access token por defecto (15 minutos). */
export const DEFAULT_ACCESS_TTL_SECONDS = 15 * 60;

/** Cuánto vive un refresh token por defecto (30 días). */
export const DEFAULT_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Secretos de descarte para tests (nunca se usan fuera de `NODE_ENV=test`). */
export const TEST_ACCESS_SECRET = 'fabrik-test-access-secret';
export const TEST_REFRESH_SECRET = 'fabrik-test-refresh-secret';

export interface BootstrapAdminConfig {
  readonly name: string;
  readonly password: string;
}

export interface AuthConfig {
  readonly accessSecret: string;
  readonly refreshSecret: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;
  readonly bootstrapAdmin?: BootstrapAdminConfig;
}

/** Subconjunto del entorno que consume la auth (facilita los tests). */
export interface AuthEnv {
  readonly NODE_ENV?: string;
  readonly VITEST?: string;
  readonly JWT_ACCESS_SECRET?: string;
  readonly JWT_REFRESH_SECRET?: string;
  readonly JWT_ACCESS_TTL_SECONDS?: string;
  readonly JWT_REFRESH_TTL_SECONDS?: string;
  readonly BOOTSTRAP_ADMIN_NAME?: string;
  readonly BOOTSTRAP_ADMIN_PASSWORD?: string;
}

export function isTestEnvironment(env: AuthEnv = process.env): boolean {
  return env.NODE_ENV === 'test' || env.VITEST !== undefined;
}

function readPositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un entero positivo en segundos (recibido: "${raw}")`);
  }
  return value;
}

/**
 * Resuelve la configuración y falla en claro si es incoherente o si faltan
 * secretos fuera de tests.
 */
export function resolveAuthConfig(env: AuthEnv = process.env): AuthConfig {
  const test = isTestEnvironment(env);

  const accessSecret = env.JWT_ACCESS_SECRET?.trim() || (test ? TEST_ACCESS_SECRET : '');
  const refreshSecret = env.JWT_REFRESH_SECRET?.trim() || (test ? TEST_REFRESH_SECRET : '');
  if (accessSecret === '') {
    throw new Error('Falta JWT_ACCESS_SECRET (obligatoria fuera de tests).');
  }
  if (refreshSecret === '') {
    throw new Error('Falta JWT_REFRESH_SECRET (obligatoria fuera de tests).');
  }

  const adminName = env.BOOTSTRAP_ADMIN_NAME?.trim();
  const adminPassword = env.BOOTSTRAP_ADMIN_PASSWORD;
  if ((adminName && !adminPassword) || (!adminName && adminPassword)) {
    throw new Error(
      'BOOTSTRAP_ADMIN_NAME y BOOTSTRAP_ADMIN_PASSWORD deben definirse juntas (o ninguna).',
    );
  }
  const bootstrapAdmin = adminName && adminPassword ? { name: adminName, password: adminPassword } : undefined;

  return {
    accessSecret,
    refreshSecret,
    accessTtlSeconds: readPositiveInt(
      env.JWT_ACCESS_TTL_SECONDS,
      DEFAULT_ACCESS_TTL_SECONDS,
      'JWT_ACCESS_TTL_SECONDS',
    ),
    refreshTtlSeconds: readPositiveInt(
      env.JWT_REFRESH_TTL_SECONDS,
      DEFAULT_REFRESH_TTL_SECONDS,
      'JWT_REFRESH_TTL_SECONDS',
    ),
    ...(bootstrapAdmin ? { bootstrapAdmin } : {}),
  };
}
