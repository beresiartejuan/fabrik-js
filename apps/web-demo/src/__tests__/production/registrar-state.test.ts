import { MAX_OBSERVATION_LENGTH } from '@fabrik/domain';
import { describe, expect, it } from 'vitest';
import {
  activeMachinesFromSchedule,
  addInput,
  addOutput,
  consumableBatches,
  createEmptyRegistrarForm,
  observationCount,
  recipeIdFromInputs,
  removeInput,
  resetKeepingMachine,
  setInputAmount,
  setInputBatch,
  setMachine,
  setObservation,
  setOutputAmount,
  setOutputMaterial,
  setOutputMaterialId,
  setOutputUnit,
  setRecipeStep,
  stepsForMachine,
  toTransformPayload,
  validateRegistrarForm,
} from '@/components/production/registrar-state';
import type { BatchWire, MeScheduleItemWire, RecipeWire } from '@/lib/api/types';

/**
 * Estado puro del formulario de transformación (docs/10-plan-de-web.md §11):
 * filtrado de máquinas desde `/me/schedule`, picker de lotes desde `/batches`,
 * validación espejando al dominio y payload de `POST /production/transform`
 * (sin `workerId` ni `timestamp`).
 */

function machine(
  id: string,
  name: string,
  type: string,
  status: 'idle' | 'running' | 'maintenance' = 'idle',
) {
  return { id, name, type, locationId: 'l-planta', status };
}

function scheduleItem(
  id: string,
  status: 'idle' | 'running' | 'maintenance',
  activeNow: boolean,
): MeScheduleItemWire {
  return {
    id,
    workerId: 'w1',
    machineId: `m-${id}`,
    slot: { daysOfWeek: [1], start: '08:00', end: '16:00' },
    machine: machine(`m-${id}`, id, 'mixer', status),
    activeNow,
  };
}

function batch(overrides: Partial<BatchWire> = {}): BatchWire {
  return {
    id: 'batch-1',
    materialId: 'mat-1',
    quantity: { amount: 10, unit: 'kg' },
    status: 'stored',
    ...overrides,
  };
}

function recipe(steps: Partial<RecipeWire['steps'][number]>[] = []): RecipeWire {
  return {
    id: 'r1',
    name: 'Panes',
    outputProductId: 'p',
    outputQuantity: { amount: 1, unit: 'unit' },
    steps: steps.map((step, index) => ({
      id: step.id ?? `step-${index + 1}`,
      position: step.position ?? index + 1,
      machineType: step.machineType ?? 'mixer',
      inputs: step.inputs ?? [],
      outputProductId: step.outputProductId ?? 'p',
      outputQuantity: step.outputQuantity ?? { amount: 1, unit: 'unit' },
    })),
  };
}

describe('activeMachinesFromSchedule', () => {
  it('ofrece solo activeNow + sin mantenimiento, deduplicadas por id', () => {
    const schedule = [
      scheduleItem('vigente', 'idle', true),
      scheduleItem('fuera-de-franja', 'running', false),
      scheduleItem('en-mantenimiento', 'maintenance', true),
      scheduleItem('vigente', 'running', true), // misma máquina en otra franja
      { ...scheduleItem('sin-dato', 'idle', true), machine: null },
    ];
    const machines = activeMachinesFromSchedule(schedule);
    expect(machines.map((m) => m.id)).toEqual(['m-vigente']);
  });
});

describe('consumableBatches', () => {
  it('descarta los lotes completados', () => {
    const list = [
      batch(),
      batch({ id: 'b2', status: 'completed' }),
      batch({ id: 'b3', status: 'in_progress' }),
    ];
    expect(consumableBatches(list).map((batch) => batch.id)).toEqual(['batch-1', 'b3']);
  });
});

describe('stepsForMachine', () => {
  it('filtra por el tipo de la máquina elegida', () => {
    const panes = recipe([{ machineType: 'mixer' }, { machineType: 'oven' }]);
    expect(stepsForMachine(panes, 'mixer').map((step) => step.id)).toEqual(['step-1']);
    // sin máquina elegida aún, la receta completa queda disponible
    expect(stepsForMachine(panes, undefined)).toHaveLength(2);
    expect(stepsForMachine(null, 'mixer')).toEqual([]);
  });
});

describe('selección de lote/material y unidades derivadas', () => {
  it('setInputBatch fija batchId y la unidad del lote', () => {
    let state = addInput(createEmptyRegistrarForm());
    const key = state.inputs[0].key;
    state = setInputBatch(state, key, batch({ id: 'b9', quantity: { amount: 4, unit: 'l' } }));
    expect(state.inputs[0]).toMatchObject({ batchId: 'b9', unit: 'l' });

    // al deseleccionar, el id vuelve a vacío
    state = setInputBatch(state, key, undefined);
    expect(state.inputs[0].batchId).toBe('');
  });

  it('setOutputMaterial fija materialId y la unidad del material (modo catálogo)', () => {
    let state = addOutput(createEmptyRegistrarForm());
    const key = state.outputs[0].key;
    state = setOutputMaterial(state, key, {
      id: 'p1',
      name: 'Pan',
      kind: 'product',
      physicalState: 'solid',
      unitOfMeasure: 'unit',
      active: true,
    });
    expect(state.outputs[0]).toMatchObject({ materialId: 'p1', unit: 'unit' });
  });

  it('el modo manual edita materialId y unidad sin derivaciones', () => {
    let state = addOutput(createEmptyRegistrarForm());
    const key = state.outputs[0].key;
    state = setOutputMaterialId(state, key, 'p-crudo');
    state = setOutputUnit(state, key, 'l');
    state = setOutputAmount(state, key, '3.5');
    expect(state.outputs[0]).toMatchObject({
      materialId: 'p-crudo',
      unit: 'l',
      amount: '3.5',
    });
  });

  it('los cambios de máquina invalidan el paso elegido', () => {
    let state = createEmptyRegistrarForm();
    state = addInput(state);
    state = setRecipeStep(setMachine(state, 'm1'), 'step-1');
    expect(state.recipeStepId).toBe('step-1');
    state = setMachine(state, 'm2');
    expect(state.machineId).toBe('m2');
    expect(state.recipeStepId).toBe('');
  });

  it('resetKeepingMachine conserva solo la máquina', () => {
    let state = createEmptyRegistrarForm();
    state = setMachine(state, 'm1');
    state = addInput(state);
    state = setObservation(state, 'nota');
    state = resetKeepingMachine(state);
    expect(state).toEqual({
      machineId: 'm1',
      recipeStepId: '',
      inputs: [],
      outputs: [],
      observation: '',
    });
  });

  it('removeInput quita solo la fila pedida', () => {
    let state = addInput(createEmptyRegistrarForm());
    state = addInput(state);
    const [first, second] = state.inputs;
    state = removeInput(state, first.key);
    expect(state.inputs.map((row) => row.key)).toEqual([second.key]);
  });
});

describe('validateRegistrarForm', () => {
  it('exige máquina y al menos un input o output', () => {
    const result = validateRegistrarForm(createEmptyRegistrarForm());
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      'Elegí la máquina donde se registra la transformación.',
      'La transformación debe declarar al menos un input o un output.',
    ]);
  });

  it('las filas incompletas y los lotes repetidos marcan issues', () => {
    let state = createEmptyRegistrarForm();
    state = setMachine(state, 'm1');
    state = addInput(state);
    state = addInput(state);
    state = addOutput(state);
    state = setOutputMaterialId(state, state.outputs[0].key, 'p1');
    state = setOutputAmount(state, state.outputs[0].key, '1');

    const result = validateRegistrarForm(state);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      'Completá el lote del insumo 1.',
      'Ingresá una cantidad válida para el insumo 1.',
      'Completá el lote del insumo 2.',
      'Ingresá una cantidad válida para el insumo 2.',
    ]);

    // Completar ambos inputs con el MISMO lote → duplicate-input
    const key1 = state.inputs[0].key;
    const key2 = state.inputs[1].key;
    let filled = setInputBatch(state, key1, batch());
    filled = setInputBatch(filled, key2, batch());
    filled = setInputAmount(filled, key1, '2');
    filled = setInputAmount(filled, key2, '1');
    const duplicate = validateRegistrarForm(filled);
    expect(duplicate.valid).toBe(false);
    expect(duplicate.issues).toContain('El lote está repetido en los insumos.');
  });

  it('cantidades no numéricas o <= 0 fallan; un formulario bien cargado es válido', () => {
    let state = createEmptyRegistrarForm();
    state = setMachine(state, 'm1');
    state = addInput(state);
    state = addOutput(state);
    state = setInputBatch(state, state.inputs[0].key, batch());
    state = setInputAmount(state, state.inputs[0].key, '-1');
    state = setOutputMaterialId(state, state.outputs[0].key, 'p1');
    state = setOutputAmount(state, state.outputs[0].key, '0');

    expect(validateRegistrarForm(state).issues).toEqual([
      'Ingresá una cantidad válida para el insumo 1.',
      'Ingresá una cantidad válida para la salida 1.',
    ]);

    const ok = setOutputAmount(
      setInputAmount(state, state.inputs[0].key, '2'),
      state.outputs[0].key,
      '3',
    );
    expect(validateRegistrarForm(ok)).toEqual({ valid: true, issues: [] });
  });

  it('la observación se limita a MAX_OBSERVATION_LENGTH del dominio', () => {
    let state = createEmptyRegistrarForm();
    state = setMachine(state, 'm1');
    state = addInput(state);
    state = setInputBatch(state, state.inputs[0].key, batch());
    state = setInputAmount(state, state.inputs[0].key, '1');
    state = addOutput(state);
    state = setOutputMaterialId(state, state.outputs[0].key, 'p1');
    state = setOutputAmount(state, state.outputs[0].key, '1');
    state = setObservation(state, 'a'.repeat(MAX_OBSERVATION_LENGTH + 1));

    expect(validateRegistrarForm(state).issues).toContain(
      `La observación no puede superar ${MAX_OBSERVATION_LENGTH} caracteres.`,
    );
  });
});

describe('toTransformPayload', () => {
  it('arma el body exacto: sin workerId ni timestamp; filtra observación y paso vacíos', () => {
    let state = createEmptyRegistrarForm();
    state = setMachine(state, 'm1');
    state = addInput(state);
    state = addInput(state);
    state = setInputBatch(state, state.inputs[0].key, batch({ id: 'b1' }));
    state = setInputAmount(state, state.inputs[0].key, '2');
    state = setInputBatch(
      state,
      state.inputs[1].key,
      batch({ id: 'b2', quantity: { amount: 1, unit: 'm3' } }),
    );
    state = setInputAmount(state, state.inputs[1].key, '0.5');
    state = setRecipeStep(state, 'step-9');
    state = addOutput(state);
    state = setOutputMaterialId(state, state.outputs[0].key, 'p1');
    state = setOutputUnit(state, state.outputs[0].key, 'unit');
    state = setOutputAmount(state, state.outputs[0].key, '4');
    state = setObservation(state, '  primera hornada  ');

    const payload = toTransformPayload(state);

    expect(payload).toEqual({
      machineId: 'm1',
      recipeStepId: 'step-9',
      inputs: [
        { batchId: 'b1', quantity: { amount: 2, unit: 'kg' } },
        { batchId: 'b2', quantity: { amount: 0.5, unit: 'm3' } },
      ],
      outputs: [{ materialId: 'p1', quantity: { amount: 4, unit: 'unit' } }],
      observation: 'primera hornada',
    });
  });

  it('sin observación ni paso, el body no incluye esas claves', () => {
    let state = createEmptyRegistrarForm();
    state = setMachine(state, 'm1');
    state = addInput(state);
    state = setInputBatch(state, state.inputs[0].key, batch({ id: 'b1' }));
    state = setInputAmount(state, state.inputs[0].key, '1');
    state = addOutput(state);
    state = setOutputMaterialId(state, state.outputs[0].key, 'p1');
    state = setOutputAmount(state, state.outputs[0].key, '1');

    const payload = toTransformPayload(state);
    expect(payload).not.toHaveProperty('observation');
    expect(payload).not.toHaveProperty('recipeStepId');
    expect(payload).not.toHaveProperty('timestamp');
    expect(payload).not.toHaveProperty('workerId');
  });
});

describe('helpers de contexto', () => {
  it('recipeIdFromInputs devuelve la receta del primer input que la declara', () => {
    const batches = new Map<string, BatchWire>([
      ['b1', batch({ id: 'b1', recipeId: 'r1' })],
      ['b2', batch({ id: 'b2', recipeId: 'r2' })],
      ['b3', batch({ id: 'b3' })],
    ]);
    let state = addInput(createEmptyRegistrarForm());
    state = setInputBatch(state, state.inputs[0].key, batches.get('b3'));
    expect(recipeIdFromInputs(state, batches)).toBeNull();

    state = setInputBatch(state, state.inputs[0].key, batches.get('b2'));
    state = addInput(state);
    state = setInputBatch(state, state.inputs[1].key, batches.get('b1'));
    expect(recipeIdFromInputs(state, batches)).toBe('r2');
  });

  it('observationCount muestra n/máximo', () => {
    expect(observationCount('')).toBe(`0/${MAX_OBSERVATION_LENGTH}`);
    expect(observationCount('hola')).toBe(`${4}/${MAX_OBSERVATION_LENGTH}`);
  });
});
