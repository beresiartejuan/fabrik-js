import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MaterialForm } from '@/components/catalogs/material-form';

import { selectOption } from '../helpers/select';

/**
 * Formulario de material (docs/10-plan-de-web.md §3): el filtro de unidades por
 * estado físico (`unitsForPhysicalState`) y el envío del payload.
 */

describe('MaterialForm', () => {
  it('ofrece solo las unidades compatibles con el estado físico por defecto (sólido)', () => {
    render(<MaterialForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Unidad de medida'));

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'g',
      'kg',
      'u',
    ]);
  });

  it('al pasar a líquido limita las unidades a ml/l y corrige la unidad incompatible', () => {
    const onSubmit = vi.fn();
    render(<MaterialForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    selectOption('Estado físico', 'Líquido');
    fireEvent.click(screen.getByLabelText('Unidad de medida'));

    expect(screen.getByRole('option', { name: 'ml' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'l' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'g' })).not.toBeInTheDocument();
  });

  it('envía el payload al crear con los valores por defecto', () => {
    const onSubmit = vi.fn();
    render(<MaterialForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Harina 000' } });
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Trigo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear material' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Harina 000',
      description: 'Trigo',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'g',
    });
  });

  it('valida el nombre obligatorio y no envía', () => {
    const onSubmit = vi.fn();
    render(<MaterialForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Crear material' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('El nombre es obligatorio.')).toBeInTheDocument();
  });

  it('en modo edición bloquea tipo y estado físico pero permite cambiar la unidad', () => {
    const onSubmit = vi.fn();
    render(
      <MaterialForm
        mode="edit"
        defaultValues={{
          name: 'Agua',
          kind: 'supply',
          physicalState: 'liquid',
          unitOfMeasure: 'l',
        }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Tipo')).toBeDisabled();
    expect(screen.getByLabelText('Estado físico')).toBeDisabled();
    expect(screen.getByLabelText('Unidad de medida')).toBeEnabled();
  });

  it('en edición envía description vacía al borrarla (para limpiar el valor)', () => {
    const onSubmit = vi.fn();
    render(
      <MaterialForm
        mode="edit"
        defaultValues={{
          name: 'Agua',
          description: 'Potable',
          kind: 'supply',
          physicalState: 'liquid',
          unitOfMeasure: 'l',
        }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Agua',
      description: '',
      kind: 'supply',
      physicalState: 'liquid',
      unitOfMeasure: 'l',
    });
  });
});
