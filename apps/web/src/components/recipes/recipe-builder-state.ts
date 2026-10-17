import { isUnitCompatibleWith, type UnitOfMeasure } from '@fabrik/domain';

import type { CreateRecipeInput, RecipeStepInput } from '@/lib/api/modules/recipesApi';
import type { MaterialWire, RecipeWire } from '@/lib/api/types';
import { unitLabel } from '@/lib/format/units';

/**
 * Estado puro del **builder de recetas** (docs/10-plan-de-web.md §Pantalla 7).
 *
 * El formulario trabaja con borradores (`amount` como string, ids sin resolver)
 * y este módulo concentra las operaciones de lista: alta/baja de pasos e insumos,
 * reordenamiento con **recálculo de `position` 1..N**, selección de materiales
 * (que corrige la unidad) y la validación pre-flight.
 *
 * Se mantiene sin React para poder testear el comportamiento crítico (reordenar,
 * I7, filas incompletas, coherencia de unidades) sin montar el componente.
 */

export interface BuilderQuantity {
  readonly amount: string;
  readonly unit: UnitOfMeasure;
}

export interface BuilderInput {
  readonly key: string;
  readonly materialId: string;
  readonly quantity: BuilderQuantity;
}

export interface BuilderStep {
  readonly key: string;
  readonly position: number;
  readonly machineType: string;
  readonly inputs: readonly BuilderInput[];
  readonly outputProductId: string;
  readonly outputQuantity: BuilderQuantity;
}

export interface RecipeBuilderState {
  readonly name: string;
  readonly outputProductId: string;
  readonly outputQuantity: BuilderQuantity;
  readonly steps: readonly BuilderStep[];
}

export interface RecipeValidationIssue {
  /** Ruta estable para resaltar el campo (`steps.1.inputs.2.materialId`, etc.). */
  readonly path: string;
  readonly message: string;
}

export interface RecipeValidation {
  readonly valid: boolean;
  readonly issues: readonly RecipeValidationIssue[];
}

let keySequence = 0;

function nextKey(prefix: 'step' | 'input'): string {
  keySequence += 1;
  return `${prefix}-${keySequence}`;
}

function emptyQuantity(unit: UnitOfMeasure = 'unit'): BuilderQuantity {
  return { amount: '1', unit };
}

function createInput(unit: UnitOfMeasure = 'unit'): BuilderInput {
  return { key: nextKey('input'), materialId: '', quantity: emptyQuantity(unit) };
}

function createStep(position: number): BuilderStep {
  return {
    key: nextKey('step'),
    position,
    machineType: '',
    inputs: [createInput()],
    outputProductId: '',
    outputQuantity: emptyQuantity(),
  };
}

/** Estado inicial para `/recetas/nueva` (sin pasos; el usuario agrega el primero). */
export function createEmptyBuilderState(): RecipeBuilderState {
  return {
    name: '',
    outputProductId: '',
    outputQuantity: emptyQuantity(),
    steps: [],
  };
}

/** Convierte una receta del wire al estado editable del builder. */
export function builderStateFromRecipe(recipe: RecipeWire): RecipeBuilderState {
  return {
    name: recipe.name,
    outputProductId: recipe.outputProductId,
    outputQuantity: {
      amount: String(recipe.outputQuantity.amount),
      unit: recipe.outputQuantity.unit,
    },
    steps: recalcPositions(
      recipe.steps.map((step) => ({
        key: nextKey('step'),
        position: step.position,
        machineType: step.machineType,
        inputs: step.inputs.map((input) => ({
          key: nextKey('input'),
          materialId: input.materialId,
          quantity: { amount: String(input.quantity.amount), unit: input.quantity.unit },
        })),
        outputProductId: step.outputProductId,
        outputQuantity: {
          amount: String(step.outputQuantity.amount),
          unit: step.outputQuantity.unit,
        },
      })),
    ),
  };
}

/** Fuerza `position` consecutivas 1..N respetando el orden actual del array. */
export function recalcPositions(steps: readonly BuilderStep[]): readonly BuilderStep[] {
  return steps.map((step, index) => ({ ...step, position: index + 1 }));
}

export function addStep(state: RecipeBuilderState): RecipeBuilderState {
  const steps = [...state.steps, createStep(state.steps.length + 1)];
  return { ...state, steps: recalcPositions(steps) };
}

export function removeStep(state: RecipeBuilderState, stepKey: string): RecipeBuilderState {
  const steps = state.steps.filter((step) => step.key !== stepKey);
  return { ...state, steps: recalcPositions(steps) };
}

/** Mueve un paso una posición arriba/abajo y recalcula las posiciones 1..N. */
export function moveStep(
  state: RecipeBuilderState,
  stepKey: string,
  direction: 'up' | 'down',
): RecipeBuilderState {
  const index = state.steps.findIndex((step) => step.key === stepKey);
  if (index < 0) {
    return state;
  }
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= state.steps.length) {
    return state;
  }
  const steps = [...state.steps];
  const current = steps[index];
  const other = steps[target];
  if (!current || !other) {
    return state;
  }
  steps[index] = other;
  steps[target] = current;
  return { ...state, steps: recalcPositions(steps) };
}

export function addInput(state: RecipeBuilderState, stepKey: string): RecipeBuilderState {
  return updateStep(state, stepKey, (step) => ({
    ...step,
    inputs: [...step.inputs, createInput()],
  }));
}

export function removeInput(
  state: RecipeBuilderState,
  stepKey: string,
  inputKey: string,
): RecipeBuilderState {
  return updateStep(state, stepKey, (step) => ({
    ...step,
    inputs: step.inputs.filter((input) => input.key !== inputKey),
  }));
}

/** Aplica un cambio inmutable a un paso identificado por su key. */
export function updateStep(
  state: RecipeBuilderState,
  stepKey: string,
  updater: (step: BuilderStep) => BuilderStep,
): RecipeBuilderState {
  return {
    ...state,
    steps: state.steps.map((step) => (step.key === stepKey ? updater(step) : step)),
  };
}

/** Aplica un cambio inmutable a un insumo de un paso. */
export function updateInput(
  state: RecipeBuilderState,
  stepKey: string,
  inputKey: string,
  updater: (input: BuilderInput) => BuilderInput,
): RecipeBuilderState {
  return updateStep(state, stepKey, (step) => ({
    ...step,
    inputs: step.inputs.map((input) => (input.key === inputKey ? updater(input) : input)),
  }));
}

export function updateRecipe(
  state: RecipeBuilderState,
  patch: Partial<Pick<RecipeBuilderState, 'name' | 'outputProductId' | 'outputQuantity'>>,
): RecipeBuilderState {
  return { ...state, ...patch };
}

/**
 * Selecciona el producto de salida de la receta y **deriva la unidad** de su
 * `unitOfMeasure` (docs/10-plan-web §Pantalla 7). Si el producto no existe,
 * solo cambia el id.
 */
export function selectOutputProduct(
  state: RecipeBuilderState,
  product: MaterialWire | undefined,
): RecipeBuilderState {
  if (!product) {
    return state;
  }
  return {
    ...state,
    outputProductId: product.id,
    outputQuantity: { ...state.outputQuantity, unit: product.unitOfMeasure },
  };
}

/** Selecciona el producto de salida de un paso y corrige su unidad. */
export function selectStepOutputProduct(
  state: RecipeBuilderState,
  stepKey: string,
  product: MaterialWire | undefined,
): RecipeBuilderState {
  if (!product) {
    return state;
  }
  return updateStep(state, stepKey, (step) => ({
    ...step,
    outputProductId: product.id,
    outputQuantity: { ...step.outputQuantity, unit: product.unitOfMeasure },
  }));
}

/** Selecciona el material de un insumo y corrige la unidad de su cantidad. */
export function selectInputMaterial(
  state: RecipeBuilderState,
  stepKey: string,
  inputKey: string,
  material: MaterialWire | undefined,
): RecipeBuilderState {
  if (!material) {
    return state;
  }
  return updateInput(state, stepKey, inputKey, (input) => ({
    ...input,
    materialId: material.id,
    quantity: { ...input.quantity, unit: material.unitOfMeasure },
  }));
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function isPositiveAmount(value: string): boolean {
  const amount = Number(value);
  return value.trim().length > 0 && Number.isFinite(amount) && amount > 0;
}

function quantityIssues(
  path: string,
  quantity: BuilderQuantity,
  material: MaterialWire | undefined,
): RecipeValidationIssue[] {
  const issues: RecipeValidationIssue[] = [];
  if (!isPositiveAmount(quantity.amount)) {
    issues.push({ path: `${path}.amount`, message: 'La cantidad debe ser un número mayor que 0.' });
  }
  if (material && !isUnitCompatibleWith(quantity.unit, material.physicalState)) {
    issues.push({
      path: `${path}.unit`,
      message: `La unidad «${unitLabel(quantity.unit)}» no es compatible con «${material.name}».`,
    });
  }
  return issues;
}

function outputProductIssues(
  path: string,
  materialId: string,
  material: MaterialWire | undefined,
): RecipeValidationIssue[] {
  if (!isNonEmpty(materialId)) {
    return [{ path, message: 'Elegí el producto de salida.' }];
  }
  if (!material) {
    return [{ path, message: 'El material seleccionado no existe.' }];
  }
  if (material.kind !== 'product') {
    return [{ path, message: 'El producto de salida debe ser un material de tipo producto.' }];
  }
  return [];
}

/**
 * Validación pre-flight en español. Espeja las reglas de la fábrica `Recipe`
 * del dominio (≥1 paso, posiciones 1..N e **I7**) y agrega comprobaciones de
 * formulario: campos completos, cantidades positivas, material existente y
 * unidad coherente con el estado físico (`isUnitCompatibleWith`).
 *
 * El dominio sigue siendo la autoridad final: la API revalida y un
 * `RecipeIntegrityError` (422) se muestra mapeado con `errorToMessage`.
 */
export function validateRecipe(
  state: RecipeBuilderState,
  materials: readonly MaterialWire[],
): RecipeValidation {
  const issues: RecipeValidationIssue[] = [];
  const materialById = new Map(materials.map((material) => [material.id, material]));

  if (!isNonEmpty(state.name)) {
    issues.push({ path: 'name', message: 'El nombre de la receta es obligatorio.' });
  }

  const outputProduct = materialById.get(state.outputProductId);
  issues.push(...outputProductIssues('outputProductId', state.outputProductId, outputProduct));
  issues.push(...quantityIssues('outputQuantity', state.outputQuantity, outputProduct));

  if (state.steps.length === 0) {
    issues.push({ path: 'steps', message: 'La receta debe tener al menos un paso.' });
    return { valid: false, issues };
  }

  state.steps.forEach((step, index) => {
    const expected = index + 1;
    const stepPath = `steps.${expected}`;

    if (step.position !== expected) {
      issues.push({
        path: 'steps',
        message: 'Las posiciones de los pasos deben ser consecutivas empezando en 1.',
      });
    }

    if (!isNonEmpty(step.machineType)) {
      issues.push({
        path: `${stepPath}.machineType`,
        message: 'El tipo de máquina es obligatorio.',
      });
    }

    step.inputs.forEach((input, inputIndex) => {
      const inputPath = `${stepPath}.inputs.${inputIndex + 1}`;
      const material = materialById.get(input.materialId);
      if (!isNonEmpty(input.materialId)) {
        issues.push({
          path: `${inputPath}.materialId`,
          message: 'Elegí un material para el insumo.',
        });
      } else if (!material) {
        issues.push({
          path: `${inputPath}.materialId`,
          message: 'El material seleccionado no existe.',
        });
      }
      issues.push(...quantityIssues(inputPath, input.quantity, material));
    });

    const stepOutput = materialById.get(step.outputProductId);
    issues.push(
      ...outputProductIssues(`${stepPath}.outputProductId`, step.outputProductId, stepOutput),
    );
    issues.push(...quantityIssues(`${stepPath}.outputQuantity`, step.outputQuantity, stepOutput));
  });

  // I7: el output del último paso debe coincidir con el de la receta.
  const lastStep = state.steps[state.steps.length - 1];
  if (
    lastStep &&
    isNonEmpty(lastStep.outputProductId) &&
    isNonEmpty(state.outputProductId) &&
    lastStep.outputProductId !== state.outputProductId
  ) {
    issues.push({
      path: `steps.${lastStep.position}.outputProductId`,
      message:
        'El output del último paso debe coincidir con el producto de salida de la receta (I7).',
    });
  }

  return { valid: issues.length === 0, issues };
}

/** Primer mensaje de una ruta (para resaltar un campo concreto). */
export function issueForPath(
  issues: readonly RecipeValidationIssue[],
  path: string,
): string | undefined {
  return issues.find((issue) => issue.path === path)?.message;
}

/**
 * Payload para `POST /recipes` / `PATCH /recipes/:id`. Recalcula posiciones para
 * garantizar 1..N y normaliza los montos a `number`.
 */
export function toRecipePayload(state: RecipeBuilderState): CreateRecipeInput {
  const steps: RecipeStepInput[] = recalcPositions(state.steps).map((step) => ({
    position: step.position,
    machineType: step.machineType.trim(),
    inputs: step.inputs.map((input) => ({
      materialId: input.materialId,
      quantity: { amount: Number(input.quantity.amount), unit: input.quantity.unit },
    })),
    outputProductId: step.outputProductId,
    outputQuantity: {
      amount: Number(step.outputQuantity.amount),
      unit: step.outputQuantity.unit,
    },
  }));

  return {
    name: state.name.trim(),
    outputProductId: state.outputProductId,
    outputQuantity: {
      amount: Number(state.outputQuantity.amount),
      unit: state.outputQuantity.unit,
    },
    steps,
  };
}
