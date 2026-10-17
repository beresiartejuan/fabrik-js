'use client';

import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { ActorWire } from '@/lib/api/types';

/**
 * Sesión del front: `sessionStorage` (no `localStorage`) con **ambos tokens** y
 * el `worker` autenticado (`ActorWire`).
 *
 * Decisiones (docs/10-plan-de-web.md):
 * - Los tokens viven en `sessionStorage`, que no existe en el servidor: **todas**
 *   las funciones de acceso son SSR-safe (no-op / `null` sin `window`).
 * - El `worker` se resuelve con `GET /auth/me` después del login; hasta entonces
 *   es `null`, por eso el campo es nullable.
 * - La lectura/escritura se puede inyectar con un `Storage` explícito para
 *   testear sin navegador.
 */

export const SESSION_STORAGE_KEY = 'fabrik.session';

export interface SessionTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface SessionData extends SessionTokens {
  readonly worker: ActorWire | null;
  /**
   * Nombre de pantalla del trabajador (el que tipeó en el login). La API no
   * expone el nombre propio vía `GET /auth/me` y `GET /workers/:id` es A/Au (un
   * operario recibiría 403), así que se guarda aquí para el topbar. Es opcional
   * para no romper sesiones persistidas viejas.
   */
  readonly name?: string;
}

function resolveStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) {
    return storage;
  }
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Lee la sesión persistida; `null` si no hay o está corrupta. SSR-safe. */
export function readSession(storage?: Storage | null): SessionData | null {
  const store = resolveStorage(storage);
  if (!store) {
    return null;
  }
  try {
    const raw = store.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SessionData> | null;
    if (
      !parsed ||
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string'
    ) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      worker: parsed.worker ?? null,
      ...(typeof parsed.name === 'string' ? { name: parsed.name } : {}),
    };
  } catch {
    return null;
  }
}

/** Persiste la sesión completa. SSR-safe (no-op sin `window`). */
export function writeSession(data: SessionData, storage?: Storage | null): void {
  const store = resolveStorage(storage);
  if (!store) {
    return;
  }
  try {
    store.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  } catch {
    return;
  }
}

/** Limpia la sesión. SSR-safe (no-op sin `window`). */
export function clearSession(storage?: Storage | null): void {
  const store = resolveStorage(storage);
  if (!store) {
    return;
  }
  try {
    store.removeItem(SESSION_STORAGE_KEY);
  } catch {
    return;
  }
}

/** Lee solo los tokens (los necesita el interceptor de axios). SSR-safe. */
export function readTokens(storage?: Storage | null): SessionTokens | null {
  const session = readSession(storage);
  if (!session) {
    return null;
  }
  return { accessToken: session.accessToken, refreshToken: session.refreshToken };
}

/**
 * Guarda nuevos tokens conservando el `worker` ya resuelto (o `null` si aún no
 * hay sesión). Es el punto que usa el interceptor tras un refresh.
 */
export function writeTokens(tokens: SessionTokens, storage?: Storage | null): void {
  const current = readSession(storage);
  writeSession(
    {
      ...tokens,
      worker: current?.worker ?? null,
      ...(current?.name ? { name: current.name } : {}),
    },
    storage,
  );
}

// ---------------------------------------------------------------------------
// Rotación de tokens (interceptor HTTP → React)
// ---------------------------------------------------------------------------

export type TokensRotateListener = (tokens: SessionTokens) => void;

const tokensRotateListeners = new Set<TokensRotateListener>();

/**
 * Suscribe al evento "el interceptor refrescó los tokens". Lo usa
 * `SessionProvider` para actualizar el contexto de React (el `sessionStorage`
 * por sí solo no re-renderiza). Devuelve la función de baja.
 */
export function subscribeTokensRotate(listener: TokensRotateListener): () => void {
  tokensRotateListeners.add(listener);
  return () => {
    tokensRotateListeners.delete(listener);
  };
}

/**
 * Notifica tokens rotados. `client.ts` la usa como `onTokensRotate` por defecto
 * del singleton; los clientes inyectados en tests pueden pasar su propio callback.
 */
export function notifyTokensRotate(tokens: SessionTokens): void {
  for (const listener of tokensRotateListeners) {
    listener(tokens);
  }
}

// ---------------------------------------------------------------------------
// React: SessionProvider + useSession
// ---------------------------------------------------------------------------

export interface SessionContextValue {
  /** Sesión actual; `null` hasta hidratar o si no hay tokens. */
  readonly session: SessionData | null;
  /** `false` durante el primer render en cliente (evita parpadeos/SSR mismatch). */
  readonly hydrated: boolean;
  /** Guarda tokens + worker (login o refresh seguido de `me`). */
  readonly signIn: (tokens: SessionTokens, worker: ActorWire | null, name?: string) => void;
  /** Actualiza el `worker` de la sesión actual (tras `GET /auth/me`). */
  readonly setWorker: (worker: ActorWire | null) => void;
  /** Cierra sesión: limpia `sessionStorage` y el estado. */
  readonly signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export interface SessionProviderProps {
  readonly children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSession(readSession());
    setHydrated(true);
  }, []);

  // El interceptor de axios refresca tokens por fuera de React; este puente
  // mantiene el contexto sincronizado (p. ej. el `accessToken` que muestra el
  // shell o cualquier consumidor de `useSession`). El storage ya fue actualizado
  // por el interceptor antes de notificar.
  useEffect(
    () =>
      subscribeTokensRotate((tokens) => {
        setSession((current) => {
          if (!current) {
            return current;
          }
          const next: SessionData = { ...current, ...tokens };
          writeSession(next);
          return next;
        });
      }),
    [],
  );

  const persist = useCallback((next: SessionData | null) => {
    if (next) {
      writeSession(next);
    } else {
      clearSession();
    }
    setSession(next);
  }, []);

  const signIn = useCallback(
    (tokens: SessionTokens, worker: ActorWire | null, name?: string) => {
      persist({ ...tokens, worker, ...(name ? { name } : {}) });
    },
    [persist],
  );

  const setWorker = useCallback((worker: ActorWire | null) => {
    setSession((current) => {
      if (!current) {
        return current;
      }
      const next: SessionData = { ...current, worker };
      writeSession(next);
      return next;
    });
  }, []);

  const signOut = useCallback(() => {
    persist(null);
  }, [persist]);

  const value = useMemo<SessionContextValue>(
    () => ({ session, hydrated, signIn, setWorker, signOut }),
    [session, hydrated, signIn, setWorker, signOut],
  );

  return createElement(SessionContext.Provider, { value }, children);
}

/** Acceso a la sesión desde componentes cliente. */
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession debe usarse dentro de <SessionProvider>.');
  }
  return context;
}
