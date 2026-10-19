import type { WorkerRole } from '@fabrik/domain';
import { render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RequireAuth, RequireRole } from '@/components/guards';
import { SESSION_STORAGE_KEY, SessionProvider } from '@/lib/session/session-store';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/',
}));

function wrapper({ children }: { children: ReactNode }) {
  return createElement(SessionProvider, null, children);
}

function seedSession(role: WorkerRole) {
  window.sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      accessToken: 'a',
      refreshToken: 'r',
      worker: { workerId: 'w1', role },
      name: 'Ada',
    }),
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  replace.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RequireAuth', () => {
  it('redirige a /login sin sesión', async () => {
    render(
      <RequireAuth>
        <div>privado</div>
      </RequireAuth>,
      { wrapper },
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('privado')).not.toBeInTheDocument();
  });

  it('muestra los children cuando hay sesión', async () => {
    seedSession('admin');
    render(
      <RequireAuth>
        <div>privado</div>
      </RequireAuth>,
      { wrapper },
    );

    expect(await screen.findByText('privado')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('RequireRole', () => {
  it('permite el rol autorizado', async () => {
    seedSession('admin');
    render(
      <RequireRole roles={['admin']}>
        <div>solo admin</div>
      </RequireRole>,
      { wrapper },
    );

    expect(await screen.findByText('solo admin')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirige al dashboard para un rol no autorizado', async () => {
    seedSession('worker');
    render(
      <RequireRole roles={['admin', 'auditor']}>
        <div>sin permiso</div>
      </RequireRole>,
      { wrapper },
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByText('sin permiso')).not.toBeInTheDocument();
  });
});
