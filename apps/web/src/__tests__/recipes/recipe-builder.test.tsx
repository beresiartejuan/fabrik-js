import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RecipeBuilder } from '@/components/recipes/recipe-builder';
import { builderStateFromRecipe } from '@/components/recipes/recipe-builder-state';
import type { MaterialWire, RecipeWire } from '@/lib/api/types';

/**
 * Builder de recetas (docs/10-plan-de-web.md §Fase 2): reordenar actualiza las
 * posiciones mostradas, un submit válido envía el payload del wire y una
 * violación de I7 se muestra inline sin llamar a la API.
 */

const MATERIALS: readonly MaterialWire[] = [
  {
    id: 'harina',
    name: 'Harina',
    kind: 'supply',
    physicalState: 'solid',
    unitOfMeasure: 'kg',
    active: true,
  },
  {
    id: 'agua',
    name: 'Agua',
    kind: 'supply',
    physicalState: 'liquid',
    unitOfMeasure: 'l',
    active: true,
  },
  {
    id: 'masa',
    name: 'Masa',
    kind: 'product',
    physicalState: 'solid',
    unitOfMeasure: 'kg',
    active: true,
  },
  {
    id: 'pan',
    name: 'Pan',
    kind: 'product',
    physicalState: 'solid',
    unitOfMeasure: 'unit',
    active: true,
  },
];

const RECIPE: RecipeWire = {
  id: 'r1',
  name: 'Pan artesanal',
  outputProductId: 'pan',
  outputQuantity: { amount: 1, unit: 'unit' },
  steps: [
    {
      id: 's1',
      position: 1,
      machineType: 'mixer',
      inputs: [
        { materialId: 'harina', quantity: { amount: 2, unit: 'kg' } },
        { materialId: 'agua', quantity: { amount: 1, unit: 'l' } },
      ],
      outputProductId: 'masa',
      outputQuantity: { amount: 2, unit: 'kg' },
    },
    {
      id: 's2',
      position: 2,
      machineType: 'oven',
      inputs: [{ materialId: 'masa', quantity: { amount: 2, unit: 'kg' } }],
      outputProductId: 'pan',
      outputQuantity: { amount: 1, unit: 'unit' },
    },
  ],
};

function renderBuilder(recipe: RecipeWire) {
  const onSubmit = vi.fn();
  render(
    <RecipeBuilder
      mode="edit"
      initialState={builderStateFromRecipe(recipe)}
      materials={MATERIALS}
      machineTypes={['mixer', 'oven']}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  return { onSubmit };
}

describe('RecipeBuilder', () => {
  it('reordena pasos y actualiza las posiciones mostradas', () => {
    renderBuilder(RECIPE);

    expect(screen.getByLabelText('Paso 1 · Producto de salida')).toHaveTextContent('Masa');
    expect(screen.getByLabelText('Paso 2 · Tipo de máquina')).toHaveValue('oven');

    fireEvent.click(screen.getByRole('button', { name: 'Subir paso 2' }));

    expect(screen.getByLabelText('Paso 1 · Producto de salida')).toHaveTextContent('Pan');
    expect(screen.getByLabelText('Paso 2 · Producto de salida')).toHaveTextContent('Masa');
    expect(screen.getByLabelText('Paso 2 · Tipo de máquina')).toHaveValue('mixer');
  });

  it('envía el payload del wire al guardar una receta válida', () => {
    const { onSubmit } = renderBuilder(RECIPE);

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Pan artesanal',
      outputProductId: 'pan',
      outputQuantity: { amount: 1, unit: 'unit' },
      steps: [
        {
          position: 1,
          machineType: 'mixer',
          inputs: [
            { materialId: 'harina', quantity: { amount: 2, unit: 'kg' } },
            { materialId: 'agua', quantity: { amount: 1, unit: 'l' } },
          ],
          outputProductId: 'masa',
          outputQuantity: { amount: 2, unit: 'kg' },
        },
        {
          position: 2,
          machineType: 'oven',
          inputs: [{ materialId: 'masa', quantity: { amount: 2, unit: 'kg' } }],
          outputProductId: 'pan',
          outputQuantity: { amount: 1, unit: 'unit' },
        },
      ],
    });
  });

  it('muestra el error inline de I7 y no envía', () => {
    const { onSubmit } = renderBuilder({
      ...RECIPE,
      outputProductId: 'masa',
      outputQuantity: { amount: 2, unit: 'kg' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(
      screen.getAllByText(
        'El output del último paso debe coincidir con el producto de salida de la receta (I7).',
      ).length,
    ).toBeGreaterThan(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
