import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LoginPage from '@/app/login/page';
import { ApiError } from '@/lib/api/errors';
import { SESSION_STORAGE_KEY, SessionProvider } from '@/lib/session/session-store';

const { replace, authApiMock } = vi.hoisted(() => ({
  replace: vi.fn(),
  authApiMock: {
    login: vi.fn(),
    me: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@/lib/api/modules/authApi', () => ({ authApi: authApiMock }));

const TOKENS = {
  accessToken: 'access',
  refreshToken: 'refresh',
  tokenType: 'Bearer' as const,
  expiresIn: 900,
};
const ACTOR = { workerId: 'w1', role: 'admin' as const };

function wrapper({ children }: { children: ReactNode }) {
  return createElement(SessionProvider, null, children);
}

function submitCredentials(name: string, password: string) {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
}

beforeEach(() => {
  window.sessionStorage.clear();
  replace.mockClear();
  authApiMock.login.mockReset();
  authApiMock.me.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LoginPage', () => {
  it('envía las credenciales, guarda tokens + worker y redirige al dashboard', async () => {
    authApiMock.login.mockResolvedValue(TOKENS);
    authApiMock.me.mockResolvedValue(ACTOR);

    render(<LoginPage />, { wrapper });
    submitCredentials('admin', 'admin123');

    await waitFor(() => expect(authApiMock.login).toHaveBeenCalledWith('admin', 'admin123'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));

    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? '{}')).toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      worker: ACTOR,
      name: 'admin',
    });
  });

  it('muestra "Nombre o contraseña incorrectos" ante un 401', async () => {
    authApiMock.login.mockRejectedValue(
      new ApiError({ statusCode: 401, error: 'UnauthorizedError', message: 'no' }),
    );

    render(<LoginPage />, { wrapper });
    submitCredentials('admin', 'mala');

    expect(await screen.findByText('Nombre o contraseña incorrectos.')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('muestra el mensaje de error de red', async () => {
    authApiMock.login.mockRejectedValue(
      new ApiError({
        statusCode: 0,
        error: 'NetworkError',
        message: 'offline',
        isNetworkError: true,
      }),
    );

    render(<LoginPage />, { wrapper });
    submitCredentials('admin', 'admin123');

    expect(await screen.findByText('No se pudo contactar al servidor.')).toBeInTheDocument();
  });

  it('muestra el hint del modo demo con las credenciales sembradas (sin admin123)', () => {
    render(<LoginPage />, { wrapper });

    expect(screen.getByText(/Modo demo/)).toBeInTheDocument();
    expect(screen.getByText('admin/admin')).toBeInTheDocument();
    expect(screen.getByText('operario/operario')).toBeInTheDocument();
    expect(screen.getByText('auditor/auditor')).toBeInTheDocument();
    expect(screen.queryByText('admin123')).not.toBeInTheDocument();
  });
});
