import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearSession,
  notifyTokensRotate,
  readSession,
  readTokens,
  SESSION_STORAGE_KEY,
  SessionProvider,
  useSession,
  writeSession,
  writeTokens,
} from '@/lib/session/session-store';

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

const WORKER = { workerId: 'w1', role: 'admin' } as const;

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('session persistence', () => {
  it('devuelve null cuando no hay sesión', () => {
    expect(readSession(window.sessionStorage)).toBeNull();
    expect(readTokens(window.sessionStorage)).toBeNull();
  });

  it('hace round-trip de tokens + worker', () => {
    const store = makeStorage();
    const session = { accessToken: 'a', refreshToken: 'r', worker: WORKER };

    writeSession(session, store);

    expect(readSession(store)).toEqual(session);
  });

  it('devuelve null si el JSON está corrupto', () => {
    const store = makeStorage();
    store.setItem(SESSION_STORAGE_KEY, '{no-es-json');

    expect(readSession(store)).toBeNull();
  });

  it('normaliza worker ausente a null', () => {
    const store = makeStorage();
    store.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));

    expect(readSession(store)).toEqual({ accessToken: 'a', refreshToken: 'r', worker: null });
  });

  it('writeTokens conserva el worker ya resuelto', () => {
    const store = makeStorage();
    writeSession({ accessToken: 'a1', refreshToken: 'r1', worker: WORKER }, store);

    writeTokens({ accessToken: 'a2', refreshToken: 'r2' }, store);

    expect(readSession(store)).toEqual({ accessToken: 'a2', refreshToken: 'r2', worker: WORKER });
  });

  it('clearSession elimina la clave', () => {
    const store = makeStorage();
    writeSession({ accessToken: 'a', refreshToken: 'r', worker: WORKER }, store);

    clearSession(store);

    expect(readSession(store)).toBeNull();
    expect(store.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('es SSR-safe: no-op con storage null explícito', () => {
    expect(readSession(null)).toBeNull();
    expect(readTokens(null)).toBeNull();
    expect(() =>
      writeSession({ accessToken: 'a', refreshToken: 'r', worker: null }, null),
    ).not.toThrow();
    expect(() => clearSession(null)).not.toThrow();
  });

  it('es SSR-safe: no-op sin window', () => {
    vi.stubGlobal('window', undefined);

    expect(readSession()).toBeNull();
    expect(readTokens()).toBeNull();
    expect(() => writeSession({ accessToken: 'a', refreshToken: 'r', worker: null })).not.toThrow();
    expect(() => clearSession()).not.toThrow();
  });
});

describe('SessionProvider / useSession', () => {
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(SessionProvider, null, children);
  }

  it('hidrata, permite signIn/setWorker/signOut y persiste', async () => {
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.session).toBeNull();

    act(() => {
      result.current.signIn({ accessToken: 'a', refreshToken: 'r' }, null);
    });
    expect(result.current.session).toEqual({ accessToken: 'a', refreshToken: 'r', worker: null });
    expect(readSession(window.sessionStorage)?.accessToken).toBe('a');

    act(() => {
      result.current.setWorker(WORKER);
    });
    expect(result.current.session?.worker).toEqual(WORKER);
    expect(readSession(window.sessionStorage)?.worker).toEqual(WORKER);

    act(() => {
      result.current.signOut();
    });
    expect(result.current.session).toBeNull();
    expect(readSession(window.sessionStorage)).toBeNull();
  });

  it('useSession lanza fuera del provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useSession())).toThrow(/SessionProvider/);
    consoleError.mockRestore();
  });

  it('actualiza el contexto cuando el interceptor rota los tokens', async () => {
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => {
      result.current.signIn({ accessToken: 'a1', refreshToken: 'r1' }, WORKER, 'Ada');
    });

    act(() => {
      notifyTokensRotate({ accessToken: 'a2', refreshToken: 'r2' });
    });

    expect(result.current.session).toMatchObject({
      accessToken: 'a2',
      refreshToken: 'r2',
      worker: WORKER,
      name: 'Ada',
    });
    expect(readSession(window.sessionStorage)).toMatchObject({
      accessToken: 'a2',
      refreshToken: 'r2',
    });
  });
});
