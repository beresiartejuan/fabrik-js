import type { ActorWire, AuthTokensWire } from '../types';

import { loadDb } from './db';

/**
 * Núcleo de auth del runtime DEMO.
 *
 * El auth **no vive en el dominio** (docs/02: la capa de dominio no conoce
 * sesiones ni credenciales): en la API real es infraestructura propia
 * (`apps/api/src/auth`, scrypt + JWT + repos de credenciales/refresh). Aquí se
 * reproduce el *comportamiento* observable con la base demo:
 *
 * - **Login por `name` + contraseña** (igual que `AuthService.login`): la fila
 *   de usuario se busca por `name` — el `id` de esa fila es a la vez el
 *   `workerId` (`DemoUserRow.id === workers.id`). Contraseña comparada **en
 *   claro** a propósito (sin backend que la hashee; ver seed.ts).
 * - **Tokens opacos**, sin firma ni persistencia de revocación (simplificación
 *   deliberada del demo): `demo-access.<userId>` / `demo-refresh.<userId>`.
 *   La respuesta de login/refresh replica `AuthTokensWire` (`tokenType: Bearer`
 *   y `expiresIn` nominales) para que el flujo de sesión del front sea el mismo.
 * - **Rotación de refresh** (paridad con `AuthService.refresh`): validar forma +
 *   usuario conocido → emitir un par nuevo. El demo no registra el estado de
 *   revocación ni el reuso (no hay storage de tokens), así que `refresh` con un
 *   token conocido siempre rota; con una forma/userId desconocido falla.
 * - **`me` con rol FRESCO** (paridad del `ActorGuard`): el token solo lleva el
 *   id; el rol se lee en cada llamada de la **fila del worker** (no del usuario
 *   sembrado ni del token), así que un cambio de rol hecho por los use cases
 *   (`UpdateWorker`) se refleja en la próxima llamada. Worker inexistente o
 *   inactivo → error de auth (la capa de módulos lo mapea a HTTP 401).
 *
 * Estas funciones producen/consumen los mismos strings de token que la
 * sesión (`lib/session/session-store.ts`) persiste; no tocan nada de allí.
 */

/** Prefijo del access token opaco del demo. */
export const DEMO_ACCESS_TOKEN_PREFIX = 'demo-access.';

/** Prefijo del refresh token opaco del demo. */
export const DEMO_REFRESH_TOKEN_PREFIX = 'demo-refresh.';

/**
 * Vida *nominal* del access token (igual al default real: 15 minutos,
 * `apps/api/src/auth/auth.config.ts`). El demo no lo expira — el número solo
 * completa la forma del wire de login/refresh.
 */
export const DEMO_ACCESS_TTL_SECONDS = 15 * 60;

/**
 * Error de autenticación del demo. Lo lanzan login/refresh/me en lugar de
 * `UnauthorizedException`; la capa de módulos (runtime demo) es la que lo
 * mapeará a HTTP 401.
 */
export class DemoUnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoUnauthorizedError';
  }
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** Compone el par opaco de tokens para un usuario demo. */
function composeTokens(userId: string): AuthTokensWire {
  return {
    accessToken: `${DEMO_ACCESS_TOKEN_PREFIX}${userId}`,
    refreshToken: `${DEMO_REFRESH_TOKEN_PREFIX}${userId}`,
    tokenType: 'Bearer',
    expiresIn: DEMO_ACCESS_TTL_SECONDS,
  };
}

/**
 * Extrae el `userId` de un token opaco (`<prefix><userId>`); `null` si la forma
 * no corresponde o el id queda vacío.
 */
function userIdFromToken(token: string, prefix: string): string | null {
  if (!token.startsWith(prefix)) {
    return null;
  }
  const userId = token.slice(prefix.length);
  return userId.length > 0 ? userId : null;
}

// ---------------------------------------------------------------------------
// API de auth (formas paritarias con el controlador real)
// ---------------------------------------------------------------------------

/**
 * `POST /auth/login` demo: usuario + contraseña en claro → par de tokens.
 *
 * Paridad con `AuthService.login`: credenciales inválidas y usuario desconocido
 * producen **el mismo error** (no se delata cuál de los dos falló) y el worker
 * inactivo no autentica (`users.id === workers.id`).
 */
export async function login(name: string, password: string): Promise<AuthTokensWire> {
  const data = loadDb();
  const user = data.users.find((candidate) => candidate.name === name);
  if (!user) {
    throw new DemoUnauthorizedError('Credenciales inválidas');
  }
  if (user.password !== password) {
    throw new DemoUnauthorizedError('Credenciales inválidas');
  }
  const worker = data.workers.find((candidate) => candidate.id === user.id);
  if (!worker?.active) {
    throw new DemoUnauthorizedError('El worker está inactivo');
  }
  return composeTokens(user.id);
}

/**
 * `POST /auth/refresh` demo: refresh token válido → par NUEVO (rotación).
 * Rechaza formas ajenas y usuarios desconocidos/inactivos.
 */
export async function refresh(refreshToken: string): Promise<AuthTokensWire> {
  const userId = userIdFromToken(refreshToken, DEMO_REFRESH_TOKEN_PREFIX);
  if (userId === null) {
    throw new DemoUnauthorizedError('Refresh token inválido');
  }
  const data = loadDb();
  const worker = data.workers.find((candidate) => candidate.id === userId);
  if (!worker) {
    throw new DemoUnauthorizedError('Refresh token inválido');
  }
  if (!worker.active) {
    throw new DemoUnauthorizedError('El worker está inactivo');
  }
  return composeTokens(userId);
}

/**
 * `GET /auth/me` demo: access token → actor autenticado.
 *
 * Lectura **fresca en cada llamada** (paridad del `ActorGuard`): el rol que
 * devuelve es el de la fila del worker en el storage al llamar, nunca el que
 * pudo viajar con el token o haberse sembrado originalmente. Worker inexistente
 * o inactivo → error de auth, como el guard del backend.
 */
export async function me(accessToken: string): Promise<ActorWire> {
  const userId = userIdFromToken(accessToken, DEMO_ACCESS_TOKEN_PREFIX);
  if (userId === null) {
    throw new DemoUnauthorizedError('Token de acceso inválido');
  }
  // `loadDb()` en cada llamada = la fila más fresca posible en el demo.
  const worker = loadDb().workers.find((candidate) => candidate.id === userId);
  if (!worker?.active) {
    throw new DemoUnauthorizedError('Worker inexistente o inactivo');
  }
  return { workerId: worker.id, role: worker.role };
}
