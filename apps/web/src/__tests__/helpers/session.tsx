import type { WorkerRole } from '@fabrik/domain';
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

import { SESSION_STORAGE_KEY, SessionProvider } from '@/lib/session/session-store';

/**
 * Ayudante de tests para pantallas que leen el rol desde la sesión
 * (`useSession`): siembra `sessionStorage` y envuelve en el `SessionProvider`
 * (mismo patrón que `guards.test.tsx`).
 */
export function seedSessionRole(role: WorkerRole, workerId = 'w1'): void {
  window.sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      accessToken: 'access',
      refreshToken: 'refresh',
      worker: { workerId, role },
      name: 'Ada',
    }),
  );
}

export function renderWithSession(ui: ReactNode): void {
  render(createElement(SessionProvider, null, ui));
}
