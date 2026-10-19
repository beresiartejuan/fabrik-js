import axios, {
  type AxiosAdapter,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

import {
  clearSession,
  notifyTokensRotate,
  readTokens,
  writeTokens,
} from '@/lib/session/session-store';

import { ApiError, toApiError } from './errors';
import type { AuthTokensWire } from './types';

/**
 * Cliente HTTP compartido (docs/pantallas.md §Capa HTTP).
 *
 * - Instancia axios con `baseURL` desde `NEXT_PUBLIC_API_URL` (fallback seguro).
 *   **Next inlinea las variables `NEXT_PUBLIC_*` en tiempo de build**: cambiar
 *   `NEXT_PUBLIC_API_URL` requiere reconstruir la app (`pnpm build`), no basta
 *   con reiniciar el proceso en runtime.
 * - Interceptor de request: añade `Authorization: Bearer <access>` si hay sesión.
 * - Interceptor de response: `401` → refresh **single-flight** → reintenta la
 *   petición original. Si el refresh devuelve **auth fallida** (401/403) se
 *   limpia la sesión y se redirige a `/login`; si falla por red/5xx (transitorio)
 *   se propaga el error **sin borrar tokens** (la sesión sigue viva y el usuario
 *   puede reintentar manualmente). Cualquier otro error se normaliza a
 *   `ApiError`.
 * - `onTokensRotate` permite avisar a React de los tokens nuevos tras un refresh
 *   iniciado por el interceptor (lo cablea `SessionProvider`).
 *
 * Todo es inyectable para poder testear sin navegador (`storage`, `refresh`,
 * `onRefreshFailure`, `onTokensRotate`, `adapter`).
 */

export const DEFAULT_API_BASE_URL = 'http://localhost:3001';

const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh'];

/** URL base de la API: env pública con fallback local. */
export function resolveApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  return fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : DEFAULT_API_BASE_URL;
}

/** Persistencia de tokens que consume el interceptor. */
export interface TokenStorage {
  read(): { accessToken: string; refreshToken: string } | null;
  save(tokens: { accessToken: string; refreshToken: string }): void;
  clear(): void;
}

export interface ApiClientOptions {
  /** Override de `baseURL` (tests). */
  readonly baseURL?: string;
  /** Persistencia de tokens (por defecto `sessionStorage`). */
  readonly storage?: TokenStorage;
  /** Llamada de refresh (por defecto `POST /auth/refresh` con axios "pelado"). */
  readonly refresh?: (refreshToken: string) => Promise<AuthTokensWire>;
  /** Acción al fallar el refresh **por auth** (por defecto limpiar + `/login`). */
  readonly onRefreshFailure?: () => void;
  /** Aviso de tokens nuevos tras un refresh del interceptor (React). */
  readonly onTokensRotate?: (tokens: { accessToken: string; refreshToken: string }) => void;
  /** Adaptador axios (tests: evita la red). */
  readonly adapter?: AxiosAdapter;
}

const defaultStorage: TokenStorage = {
  read: () => readTokens(),
  save: (tokens) => writeTokens(tokens),
  clear: () => clearSession(),
};

/** Redirección dura a `/login` (fuera del router; válida en cualquier punto). */
export function redirectToLogin(): void {
  if (typeof window !== 'undefined') {
    window.location.assign('/login');
  }
}

async function defaultRefresh(refreshToken: string): Promise<AuthTokensWire> {
  // axios "pelado" (sin interceptores) para no recursar en un 401 del refresh.
  const response = await axios.post<AuthTokensWire>(
    '/auth/refresh',
    { refreshToken },
    { baseURL: resolveApiBaseUrl() },
  );
  return response.data;
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

function getRetryableConfig(error: unknown): RetryableConfig | undefined {
  if (axios.isAxiosError(error) && error.config) {
    return error.config as RetryableConfig;
  }
  return undefined;
}

function isAuthEndpoint(url: string | undefined): boolean {
  return typeof url === 'string' && AUTH_ENDPOINTS.some((path) => url.includes(path));
}

function shouldRefresh(
  error: unknown,
  config: RetryableConfig | undefined,
): config is RetryableConfig {
  if (!config || config._retry || isAuthEndpoint(config.url)) {
    return false;
  }
  return axios.isAxiosError(error) && error.response?.status === 401;
}

/**
 * `true` si el refresh fue rechazado por **auth** (401/403), es decir, la sesión
 * ya no sirve. Un error de red (sin response) o un 5xx es transitorio: los tokens
 * pueden seguir siendo válidos y no corresponde desloguear.
 */
function isAuthFailure(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.statusCode === 401 || error.statusCode === 403;
  }
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return status === 401 || status === 403;
  }
  return false;
}

export function createApiClient(options: ApiClientOptions = {}): AxiosInstance {
  const storage = options.storage ?? defaultStorage;
  const refresh = options.refresh ?? defaultRefresh;
  const onRefreshFailure =
    options.onRefreshFailure ??
    (() => {
      storage.clear();
      redirectToLogin();
    });
  const onTokensRotate = options.onTokensRotate ?? notifyTokensRotate;

  const client = axios.create({
    baseURL: options.baseURL ?? resolveApiBaseUrl(),
    ...(options.adapter ? { adapter: options.adapter } : {}),
  });

  // Single-flight por cliente: los 401 concurrentes comparten esta promesa, así
  // que se dispara **una sola** llamada a `/auth/refresh` (rotar el refresh
  // invalida el anterior y provocaría una cascada de fallos).
  let refreshPromise: Promise<AuthTokensWire> | null = null;

  function refreshSingleFlight(): Promise<AuthTokensWire> {
    if (refreshPromise) {
      return refreshPromise;
    }
    const refreshToken = storage.read()?.refreshToken;
    if (!refreshToken) {
      return Promise.reject(
        new ApiError({
          statusCode: 401,
          error: 'MissingRefreshToken',
          message: 'No hay refresh token en la sesión.',
        }),
      );
    }
    refreshPromise = refresh(refreshToken)
      .then((tokens) => {
        const rotated = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
        storage.save(rotated);
        onTokensRotate(rotated);
        return tokens;
      })
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  }

  client.interceptors.request.use((config) => {
    const tokens = storage.read();
    if (tokens?.accessToken) {
      config.headers.set('Authorization', `Bearer ${tokens.accessToken}`);
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      const retryConfig = getRetryableConfig(error);

      if (shouldRefresh(error, retryConfig)) {
        retryConfig._retry = true;
        try {
          const tokens = await refreshSingleFlight();
          retryConfig.headers.set('Authorization', `Bearer ${tokens.accessToken}`);
          return await client.request(retryConfig);
        } catch (refreshError) {
          // Solo se invalida la sesión ante un rechazo de auth. Red caída o 5xx
          // son transitorios: se propaga el error y se conservan los tokens.
          if (isAuthFailure(refreshError)) {
            onRefreshFailure();
          }
          throw toApiError(refreshError);
        }
      }

      throw toApiError(error);
    },
  );

  return client;
}

/** Instancia compartida por toda la app. */
export const apiClient: AxiosInstance = createApiClient();
