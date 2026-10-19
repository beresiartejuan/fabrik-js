import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkersScreen } from '@/components/catalogs/workers-screen';

import { makeWorker } from '../helpers/fixtures';

/**
 * Tabla de trabajadores (docs/10-plan-de-web.md §6): el **auditor** la ve sin
 * acciones de escritura; el admin ve el alta y el menú de acciones por fila.
 */

const { workersApiMock } = vi.hoisted(() => ({
  workersApiMock: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
  },
}));

vi.mock('@/lib/api/modules/workersApi', () => ({ workersApi: workersApiMock }));

const WORKERS = [
  makeWorker({ id: 'w1', name: 'Ada Lovelace', role: 'admin' }),
  makeWorker({ id: 'w2', name: 'Alan Turing', role: 'worker', active: false }),
];

beforeEach(() => {
  workersApiMock.list.mockReset();
  workersApiMock.list.mockResolvedValue(WORKERS);
});

describe('WorkersScreen', () => {
  it('en modo auditor no muestra alta ni acciones de escritura', async () => {
    render(<WorkersScreen canWrite={false} />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Alan Turing')).toBeInTheDocument();
    expect(screen.getByText('Administrador')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Nuevo trabajador/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acciones' })).not.toBeInTheDocument();
  });

  it('en modo admin muestra el alta y una acción por fila', async () => {
    render(<WorkersScreen canWrite />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nuevo trabajador/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Acciones' })).toHaveLength(2);
  });
});
