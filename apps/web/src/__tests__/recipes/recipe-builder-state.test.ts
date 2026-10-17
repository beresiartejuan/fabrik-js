import { describe, expect, it } from 'vitest';

import {
  addInput,
  addStep,
  builderStateFromRecipe,
  createEmptyBuilderState,
  issueForPath,
  moveStep,
  recalcPositions,
  removeInput,
  removeStep,
  selectInputMaterial,
  selectOutputProduct,
  toRecipePayload,
  updateInput,
  updateRecipe,
  updateStep,
  validateRecipe,
} from '@/components/recipes/recipe-builder-state';
import type { MaterialWire, RecipeWire } from '@/lib/api/types';

/**
 * Lógica crítica del builder (docs/10-plan-de-web.md §Fase 2): reordenar
 * recalcula posiciones 1..N, la validación pre-flight detecta I7, filas
 * incompletas y unidades incoherentes, y el payload espeja el wire de la API.
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

function validState() {
  return builderStateFromRecipe(RECIPE);
}

describe('operaciones de pasos', () => {
  it('agrega pasos con posiciones consecutivas 1..N', () => {
    const first = addStep(createEmptyBuilderState());
    const second = addStep(first);

    expect(first.steps.map((step) => step.position)).toEqual([1]);
    expect(second.steps.map((step) => step.position)).toEqual([1, 2]);
  });

  it('al eliminar un paso recalcula las posiciones restantes', () => {
    const state = addStep(addStep(addStep(createEmptyBuilderState())));
    const removedKey = state.steps[1]?.key;
    const result = removeStep(state, removedKey ?? '');

    expect(result.steps).toHaveLength(2);
    expect(result.steps.map((step) => step.position)).toEqual([1, 2]);
  });

  it('al bajar un paso intercambia el orden y recalcula posiciones', () => {
    const state = addStep(addStep(createEmptyBuilderState()));
    const firstKey = state.steps[0]?.key ?? '';
    const firstOriginal = state.steps[0];
    const result = moveStep(state, firstKey, 'down');

    expect(result.steps.map((step) => step.position)).toEqual([1, 2]);
    expect(result.steps[1]?.key).toBe(firstOriginal?.key);
  });

  it('al subir un paso recalcula posiciones (1..N) y conserva la lista', () => {
    const state = validState();
    const secondKey = state.steps[1]?.key ?? '';
    const result = moveStep(state, secondKey, 'up');

    expect(result.steps.map((step) => step.position)).toEqual([1, 2]);
    expect(result.steps[0]?.key).toBe(secondKey);
    expect(result.steps[1]?.key).toBe(state.steps[0]?.key);
  });

  it('mover fuera de los límites no cambia el estado', () => {
    const state = validState();
    expect(moveStep(state, state.steps[0]?.key ?? '', 'up')).toBe(state);
    expect(moveStep(state, state.steps[1]?.key ?? '', 'down')).toBe(state);
  });

  it('agrega y quita insumos sin tocar otros pasos', () => {
    const state = validState();
    const stepKey = state.steps[0]?.key ?? '';
    const withInput = addInput(state, stepKey);
    expect(withInput.steps[0]?.inputs).toHaveLength(3);

    const newInputKey = withInput.steps[0]?.inputs[2]?.key ?? '';
    const withoutInput = removeInput(withInput, stepKey, newInputKey);
    expect(withoutInput.steps[0]?.inputs).toHaveLength(2);
    expect(withoutInput.steps[1]).toEqual(state.steps[1]);
  });

  it('recalcPositions fuerza 1..N sin reordenar', () => {
    const steps = validState().steps.map((step, index) => ({
      ...step,
      position: index === 0 ? 7 : 9,
    }));
    expect(recalcPositions(steps).map((step) => step.position)).toEqual([1, 2]);
  });
});

describe('selección de materiales', () => {
  it('el producto de salida deriva la unidad del material', () => {
    const state = selectOutputProduct(createEmptyBuilderState(), MATERIALS[3]);
    expect(state.outputProductId).toBe('pan');
    expect(state.outputQuantity.unit).toBe('unit');
  });

  it('el material de un insumo deriva su unidad', () => {
    const state = validState();
    const step = state.steps[0];
    const input = step?.inputs[0];
    const result = selectInputMaterial(state, step?.key ?? '', input?.key ?? '', MATERIALS[1]);
    expect(result.steps[0]?.inputs[0]).toMatchObject({
      materialId: 'agua',
      quantity: { unit: 'l' },
    });
  });
});

describe('validateRecipe (pre-flight)', () => {
  it('acepta una receta completa y coherente', () => {
    expect(validateRecipe(validState(), MATERIALS)).toEqual({ valid: true, issues: [] });
  });

  it('exige nombre, producto de salida y al menos un paso', () => {
    const result = validateRecipe(createEmptyBuilderState(), MATERIALS);

    expect(result.valid).toBe(false);
    expect(issueForPath(result.issues, 'name')).toBeDefined();
    expect(issueForPath(result.issues, 'outputProductId')).toBeDefined();
    expect(issueForPath(result.issues, 'steps')).toBe('La receta debe tener al menos un paso.');
  });

  it('marca filas incompletas de un paso nuevo', () => {
    const state = addStep(createEmptyBuilderState());
    const result = validateRecipe(state, MATERIALS);

    expect(issueForPath(result.issues, 'steps.1.machineType')).toBe(
      'El tipo de máquina es obligatorio.',
    );
    expect(issueForPath(result.issues, 'steps.1.inputs.1.materialId')).toBe(
      'Elegí un material para el insumo.',
    );
    expect(issueForPath(result.issues, 'steps.1.outputProductId')).toBe(
      'Elegí el producto de salida.',
    );
  });

  it('rechaza cantidades no positivas', () => {
    const state = validState();
    const step = state.steps[0];
    const input = step?.inputs[0];
    const changed = updateInput(state, step?.key ?? '', input?.key ?? '', (current) => ({
      ...current,
      quantity: { ...current.quantity, amount: '0' },
    }));

    expect(issueForPath(validateRecipe(changed, MATERIALS).issues, 'steps.1.inputs.1.amount')).toBe(
      'La cantidad debe ser un número mayor que 0.',
    );
  });

  it('detecta unidades incompatibles con el estado físico del material', () => {
    const state = validState();
    const step = state.steps[0];
    const input = step?.inputs[0];
    const changed = updateInput(state, step?.key ?? '', input?.key ?? '', (current) => ({
      ...current,
      quantity: { ...current.quantity, unit: 'l' },
    }));

    expect(issueForPath(validateRecipe(changed, MATERIALS).issues, 'steps.1.inputs.1.unit')).toBe(
      'La unidad «l» no es compatible con «Harina».',
    );
  });

  it('detecta I7 cuando el output del último paso no coincide con la receta', () => {
    const state = updateRecipe(validState(), {
      outputProductId: 'masa',
      outputQuantity: { amount: '2', unit: 'kg' },
    });
    const result = validateRecipe(state, MATERIALS);

    expect(result.valid).toBe(false);
    expect(issueForPath(result.issues, 'steps.2.outputProductId')).toBe(
      'El output del último paso debe coincidir con el producto de salida de la receta (I7).',
    );
  });

  it('detecta posiciones no consecutivas aunque la UI las recalcule', () => {
    const state = validState();
    const broken = {
      ...state,
      steps: state.steps.map((step, index) => ({
        ...step,
        position: index === 0 ? 3 : step.position,
      })),
    };
    const result = validateRecipe(broken, MATERIALS);

    expect(result.issues.some((issue) => issue.message.includes('consecutivas'))).toBe(true);
  });

  it('exige que el output (receta y pasos) sea un producto', () => {
    const state = updateRecipe(validState(), {
      outputProductId: 'harina',
      outputQuantity: { amount: '2', unit: 'kg' },
    });
    const result = validateRecipe(state, MATERIALS);

    expect(issueForPath(result.issues, 'outputProductId')).toBe(
      'El producto de salida debe ser un material de tipo producto.',
    );
  });
});

describe('toRecipePayload', () => {
  it('normaliza nombre/tipo, convierte montos y asegura posiciones 1..N', () => {
    const state = updateRecipe(validState(), { name: '  Pan de campo  ' });
    const step = state.steps[0];
    const trimmed = updateStep(state, step?.key ?? '', (current) => ({
      ...current,
      machineType: '  mixer  ',
    }));

    const payload = toRecipePayload(trimmed);

    expect(payload.name).toBe('Pan de campo');
    expect(payload.outputQuantity).toEqual({ amount: 1, unit: 'unit' });
    expect(payload.steps.map((item) => item.position)).toEqual([1, 2]);
    expect(payload.steps[0]).toMatchObject({
      machineType: 'mixer',
      inputs: [
        { materialId: 'harina', quantity: { amount: 2, unit: 'kg' } },
        { materialId: 'agua', quantity: { amount: 1, unit: 'l' } },
      ],
    });
  });
});
