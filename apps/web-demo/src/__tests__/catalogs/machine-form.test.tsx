import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MachineForm } from '@/components/catalogs/machine-form';

import { makeLocation } from '../helpers/fixtures';
import { selectOption } from '../helpers/select';

/**
 * Formulario de máquina (docs/pantallas.md §5): el selector de lugar solo
 * ofrece lugares de **producción** y el payload de alta incluye nombre, tipo y
 * lugar.
 */

const LOCATIONS = [
  makeLocation({ id: 'loc-prod', name: 'Planta baja', kind: 'production' }),
  makeLocation({ id: 'loc-storage', name: 'Depósito', kind: 'storage' }),
  makeLocation({ id: 'loc-prod-2', name: 'Planta alta', kind: 'production' }),
];

describe('MachineForm', () => {
  it('ofrece solo lugares de producción en el selector', () => {
    render(<MachineForm locations={LOCATIONS} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Lugar'));

    expect(screen.getByRole('option', { name: /Planta baja/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Planta alta/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Depósito/ })).not.toBeInTheDocument();
  });

  it('envía nombre, tipo y lugar de producción al crear', () => {
    const onSubmit = vi.fn();
    render(<MachineForm locations={LOCATIONS} onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Amasadora 1' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'amasadora' } });
    selectOption('Lugar', /Planta alta/);
    fireEvent.click(screen.getByRole('button', { name: 'Crear máquina' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Amasadora 1',
      type: 'amasadora',
      locationId: 'loc-prod-2',
    });
  });

  it('valida tipo y lugar obligatorios al crear', () => {
    const onSubmit = vi.fn();
    render(<MachineForm locations={LOCATIONS} onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Amasadora 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear máquina' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('El tipo es obligatorio.')).toBeInTheDocument();
    expect(screen.getByText('Elegí un lugar de producción.')).toBeInTheDocument();
    // El estado de campo inválido llega al trigger del select (aria-invalid).
    expect(screen.getByLabelText('Lugar')).toHaveAttribute('aria-invalid', 'true');
  });
});
