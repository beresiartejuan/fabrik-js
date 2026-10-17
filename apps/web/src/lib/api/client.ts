import axios, {
  type AxiosAdapter,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

import { clearSession, readTokens, writeTokens } from '@/lib/session/session-store';

import { ApiError, toApiError } from './errors';
import type { AuthTokensWire } from './types';

/**
 * Cliente HTTP compartido (docs/10-plan-de-web.md §Capa HTTP).
 *
 * - Instancia axios con `baseURL` desde `NEXT_PUBLIC_API_URL` (fallback seguro).
 * - Interceptor de request: añade `Authorization: Bearer <access>` si hay sesión.
 * - Interceptor de response: `401` → refresh **single-flight** → reintenta la
 *   petición original; si el refresh falla → limpia la sesión y redirige a
 *   `/login`. Cualquier otro error se normaliza a `ApiError`.
 *
 * Todo es inyectable para poder testear sin navegador (`storage`, `refresh`,
 * `onRefreshFailure`, `adapter`).
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
  /** Acción al fallar el refresh (por defecto limpiar + `/login`). */
  readonly onRefreshFailure?: () => void;
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

export function createApiClient(options: ApiClientOptions = {}): AxiosInstance {
  const storage = options.storage ?? defaultStorage;
  const refresh = options.refresh ?? defaultRefresh;
  const onRefreshFailure =
    options.onRefreshFailure ??
    (() => {
      storage.clear();
      redirectToLogin();
    });

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
        storage.save({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
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
          onRefreshFailure();
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
