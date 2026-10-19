import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AppLayout from '@/app/(app)/layout';
import { renderWithSession, seedSessionRole } from '../helpers/session';

/**
 * Acción "Resetear demo" del pie del sidebar (afinamiento de componente del
 * modo demo, docs/11-plan-demo.md §T5 — única excepción declarada junto al
 * badge y al hint del login). El botón abre el `ConfirmDialog` destructivo y,
 * al confirmar, borra la base de la pestaña (`resetDb()`) y recarga
 * (`window.location.reload()`) para que el mundo se resiembre desde cero.
 */

const { replace, resetDb, reload } = vi.hoisted(() => ({
  replace: vi.fn(),
  resetDb: vi.fn(),
  reload: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api/modules/authApi', () => ({
  authApi: { logout: vi.fn().mockResolvedValue(undefined), me: vi.fn() },
}));

vi.mock('@/lib/api/demo/db', () => ({ resetDb }));

/**
 * `window.location` es unforgeable en jsdom (no se puede redefinir), así que el
 * global `window` se stubbea con un proxy del window real que solo cambia
 * `location` — el resto (incluida la `sessionStorage` real) queda intacto.
 */
function stubWindowLocation(reloadFn: () => void): void {
  const fakeLocation = { ...window.location, reload: reloadFn } as unknown as Location;
  const stubbed = new Proxy(window, {
    get(target, prop) {
      if (prop === 'location') {
        return fakeLocation;
      }
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
  });
  vi.stubGlobal('window', stubbed);
}

beforeEach(() => {
  window.sessionStorage.clear();
  replace.mockClear();
  resetDb.mockClear();
  reload.mockClear();
  stubWindowLocation(reload);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('acción "Resetear demo" del shell (modo demo)', () => {
  it('el badge DEMO acompaña a la marca del sidebar', async () => {
    seedSessionRole('admin');
    renderWithSession(createElement(AppLayout, null, createElement('p', null, 'Contenido')));

    // La marca ("Fabrik") aparece en el aside y en el topbar mobile — siempre
    // acompañada del badge DEMO. En el aside: marca + badge, sin excepciones.
    await screen.findByRole('button', { name: 'Resetear demo' });
    const aside = document.querySelector('aside');
    expect(aside).not.toBeNull();
    expect(within(aside as HTMLElement).getByText('Fabrik')).toBeInTheDocument();
    expect(within(aside as HTMLElement).getByText('DEMO')).toBeInTheDocument();
  });

  it('pide confirmación y, al confirmar, resetea la base y recarga la pestaña', async () => {
    seedSessionRole('admin');
    renderWithSession(createElement(AppLayout, null, createElement('p', null, 'Contenido')));

    fireEvent.click(await screen.findByRole('button', { name: 'Resetear demo' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Resetear demo/)).toBeInTheDocument();
    expect(within(dialog).getByText(/vuelve a sembrar el estado inicial/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Resetear' }));

    await waitFor(() => expect(resetDb).toHaveBeenCalledTimes(1));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('cancelar no toca la base ni recarga', async () => {
    seedSessionRole('admin');
    renderWithSession(createElement(AppLayout, null, createElement('p', null, 'Contenido')));

    fireEvent.click(await screen.findByRole('button', { name: 'Resetear demo' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(resetDb).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
