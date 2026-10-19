import { MAX_OBSERVATION_LENGTH, type MachineType, type UnitOfMeasure } from '@fabrik/domain';

import type { RecordTransformationInput } from '@/lib/api/modules/productionApi';
import type {
  BatchWire,
  MachineWire,
  MaterialWire,
  MeScheduleItemWire,
  RecipeWire,
} from '@/lib/api/types';

/**
 * Estado puro del **formulario de transformación** (`/produccion/registrar`,
 * docs/pantallas.md §Pantalla 11). Mismo patrón que `recipe-builder-state`:
 * borradores con `amount` como string y operaciones/validación sin React.
 *
 * Decisiones fijadas (verificadas contra `apps/api`):
 * - Las máquinas salen de `GET /me/schedule`; solo se ofrecen las **activas
 *   ahora** (`activeNow` del servidor, no se recalcula I3 en el cliente) y **no
 *   en mantenimiento**.
 * - El picker de inputs usa `GET /batches` (A/Au/W y trae unidad/cantidad por
 *   lote); los lotes `completed` no se ofrecen como consumibles.
 * - El `workerId` y el `timestamp` **no viajan** en el payload (el actor lo
 *   resuelve la API y el reloj es del servidor).
 * - La observación respeta `MAX_OBSERVATION_LENGTH` del dominio (500).
 */

export interface RegistrarInputRow {
  readonly key: string;
  readonly batchId: string;
  readonly amount: string;
  readonly unit: UnitOfMeasure;
}

export interface RegistrarOutputRow {
  readonly key: string;
  readonly materialId: string;
  readonly amount: string;
  readonly unit: UnitOfMeasure;
}

export interface RegistrarFormState {
  readonly machineId: string;
  readonly recipeStepId: string;
  readonly inputs: readonly RegistrarInputRow[];
  readonly outputs: readonly RegistrarOutputRow[];
  readonly observation: string;
}

export interface RegistrarValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

let keySequence = 0;

function nextKey(prefix: 'input' | 'output'): string {
  keySequence += 1;
  return `${prefix}-${keySequence}`;
}

const FIRST_UNIT: UnitOfMeasure = 'unit';

/** Estado inicial del borrador de transformación. */
export function createEmptyRegistrarForm(): RegistrarFormState {
  return {
    machineId: '',
    recipeStepId: '',
    inputs: [],
    outputs: [],
    observation: '',
  };
}

// ---------------------------------------------------------------------------
// Derivaciones de catálogos (puras, testeables sin React)
// ---------------------------------------------------------------------------

/**
 * Máquinas candidatas para operar **ahora**: `activeNow` (calculado en el
 * servidor) + máquina resuelta + no en mantenimiento. Deduplica por id porque
 * pueden existir varias franjas para la misma máquina.
 */
export function activeMachinesFromSchedule(schedule: readonly MeScheduleItemWire[]): MachineWire[] {
  const byId = new Map<string, MachineWire>();
  for (const item of schedule) {
    if (!item.activeNow || !item.machine || item.machine.status === 'maintenance') {
      continue;
    }
    byId.set(item.machine.id, item.machine);
  }
  return [...byId.values()];
}

/**
 * Lotes que el formulario ofrece para consumir como inputs:
 * `GET /batches` sin filtros, descartando los `completed` (una orden cerrada no
 * es un consumible físico). El orden del repositorio se conserva.
 */
export function consumableBatches(batches: readonly BatchWire[]): BatchWire[] {
  return batches.filter((batch) => batch.status !== 'completed');
}

/** Pasos de una receta compatibles con el tipo de la máquina elegida. */
export function stepsForMachine(
  recipe: RecipeWire | null,
  machineType: MachineType | undefined,
): RecipeWire['steps'] {
  if (!recipe || !machineType) {
    return recipe?.steps ?? [];
  }
  return recipe.steps.filter((step) => step.machineType === machineType);
}

/**
 * Receta "de contexto" de la transformación: la del **primer input** que la
 * declare. Si algún lote no está en el listado cargado no se fuerza lectura
 * extra: sin contexto sale 422/404 del servidor y la UI lo muestra mapeado.
 */
export function recipeIdFromInputs(
  state: RegistrarFormState,
  batchesById: ReadonlyMap<string, BatchWire>,
): string | null {
  for (const row of state.inputs) {
    if (row.batchId.length === 0) {
      continue;
    }
    const recipeId = batchesById.get(row.batchId)?.recipeId;
    if (recipeId) {
      return recipeId;
    }
  }
  return null;
}

/** Contador visible de la observación: `n/500`. */
export function observationCount(observation: string): string {
  return `${observation.length}/${MAX_OBSERVATION_LENGTH}`;
}

// ---------------------------------------------------------------------------
// Alta/baja y edición de filas
// ---------------------------------------------------------------------------

function addRow<T>(rows: readonly T[], row: T): T[] {
  return [...rows, row];
}

function withoutRow<T>(rows: readonly T[], key: string, getId: (row: T) => string): T[] {
  return rows.filter((row) => getId(row) !== key);
}

export function addInput(state: RegistrarFormState): RegistrarFormState {
  return {
    ...state,
    inputs: addRow(state.inputs, {
      key: nextKey('input'),
      batchId: '',
      amount: '',
      unit: FIRST_UNIT,
    }),
  };
}

export function removeInput(state: RegistrarFormState, key: string): RegistrarFormState {
  return { ...state, inputs: [...withoutRow(state.inputs, key, (row) => row.key)] };
}

/**
 * Elige el lote de un input: fija el `batchId` y **deriva la unidad** de la
 * cantidad del lote (es la unidad física en la que existe): la UI no la edita.
 */
export function setInputBatch(
  state: RegistrarFormState,
  key: string,
  batch: BatchWire | undefined,
): RegistrarFormState {
  return {
    ...state,
    inputs: state.inputs.map((row) =>
      row.key === key
        ? {
            ...row,
            ...(batch ? { batchId: batch.id, unit: batch.quantity.unit } : { batchId: '' }),
          }
        : row,
    ),
  };
}

export function setInputAmount(
  state: RegistrarFormState,
  key: string,
  amount: string,
): RegistrarFormState {
  return {
    ...state,
    inputs: state.inputs.map((row) => (row.key === key ? { ...row, amount } : row)),
  };
}

export function addOutput(state: RegistrarFormState): RegistrarFormState {
  return {
    ...state,
    outputs: addRow(state.outputs, {
      key: nextKey('output'),
      materialId: '',
      amount: '',
      unit: FIRST_UNIT,
    }),
  };
}

export function removeOutput(state: RegistrarFormState, key: string): RegistrarFormState {
  return { ...state, outputs: [...withoutRow(state.outputs, key, (row) => row.key)] };
}

/**
 * Elige el material de un output (modo **catálogo**): fija la unidad del
 * material (I6 la revalida la API).
 */
export function setOutputMaterial(
  state: RegistrarFormState,
  key: string,
  material: MaterialWire | undefined,
): RegistrarFormState {
  return {
    ...state,
    outputs: state.outputs.map((row) =>
      row.key === key
        ? {
            ...row,
            ...(material
              ? { materialId: material.id, unit: material.unitOfMeasure }
              : { materialId: '' }),
          }
        : row,
    ),
  };
}

/** Modo manual (sin catálogo de materiales): edita el id del material. */
export function setOutputMaterialId(
  state: RegistrarFormState,
  key: string,
  materialId: string,
): RegistrarFormState {
  return {
    ...state,
    outputs: state.outputs.map((row) => (row.key === key ? { ...row, materialId } : row)),
  };
}

/** Modo manual: edita la unidad (la validación final la hace la API, I6). */
export function setOutputUnit(
  state: RegistrarFormState,
  key: string,
  unit: UnitOfMeasure,
): RegistrarFormState {
  return {
    ...state,
    outputs: state.outputs.map((row) => (row.key === key ? { ...row, unit } : row)),
  };
}

export function setOutputAmount(
  state: RegistrarFormState,
  key: string,
  amount: string,
): RegistrarFormState {
  return {
    ...state,
    outputs: state.outputs.map((row) => (row.key === key ? { ...row, amount } : row)),
  };
}

export function setMachine(state: RegistrarFormState, machineId: string): RegistrarFormState {
  // Cambiar de máquina invalida el paso elegido (podría exigir otro tipo).
  return { ...state, machineId, recipeStepId: '' };
}

export function setRecipeStep(state: RegistrarFormState, recipeStepId: string): RegistrarFormState {
  return { ...state, recipeStepId };
}

export function setObservation(state: RegistrarFormState, observation: string): RegistrarFormState {
  return { ...state, observation };
}

/** Reinicia el formulario conservando la máquina elegida. */
export function resetKeepingMachine(state: RegistrarFormState): RegistrarFormState {
  return { ...createEmptyRegistrarForm(), machineId: state.machineId };
}

// ---------------------------------------------------------------------------
// Validación pre-flight y payload
// ---------------------------------------------------------------------------

/** Parsea un `amount` de borrador: número finito `> 0` o `null`. */
function parseAmount(amount: string): number | null {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

/**
 * Validación pre-flight en español (espeja las reglas exactas del dominio para
 * fallar temprano, pero la API siempre revalida):
 * - máquina requerida;
 * - `InvalidTransformationError` espejado: al menos un input o un output;
 * - filas completas (lote/material + cantidad > 0);
 * - lotes de input sin repetir (`duplicate-input`);
 * - observación ≤ `MAX_OBSERVATION_LENGTH`.
 */
export function validateRegistrarForm(state: RegistrarFormState): RegistrarValidation {
  const issues: string[] = [];

  if (state.machineId.length === 0) {
    issues.push('Elegí la máquina donde se registra la transformación.');
  }

  if (state.inputs.length === 0 && state.outputs.length === 0) {
    issues.push('La transformación debe declarar al menos un input o un output.');
  }

  state.inputs.forEach((row, index) => {
    const position = index + 1;
    if (row.batchId.length === 0) {
      issues.push(`Completá el lote del insumo ${position}.`);
    }
    if (parseAmount(row.amount) === null) {
      issues.push(`Ingresá una cantidad válida para el insumo ${position}.`);
    }
  });

  const seen = new Set<string>();
  for (const row of state.inputs) {
    if (row.batchId.length === 0) {
      continue;
    }
    if (seen.has(row.batchId)) {
      issues.push(`El lote está repetido en los insumos.`);
    }
    seen.add(row.batchId);
  }

  state.outputs.forEach((row, index) => {
    const position = index + 1;
    if (row.materialId.length === 0) {
      issues.push(`Completá el material de la salida ${position}.`);
    }
    if (parseAmount(row.amount) === null) {
      issues.push(`Ingresá una cantidad válida para la salida ${position}.`);
    }
  });

  if (state.observation.trim().length > MAX_OBSERVATION_LENGTH) {
    issues.push(`La observación no puede superar ${MAX_OBSERVATION_LENGTH} caracteres.`);
  }

  return { valid: issues.length === 0, issues };
}

/** Construye el body de `POST /production/transform` (sin worker ni timestamp). */
export function toTransformPayload(state: RegistrarFormState): RecordTransformationInput {
  return {
    machineId: state.machineId,
    ...(state.recipeStepId.length > 0 ? { recipeStepId: state.recipeStepId } : {}),
    inputs: state.inputs
      .filter((row) => row.batchId.length > 0)
      .map((row) => ({
        batchId: row.batchId,
        quantity: { amount: parseAmount(row.amount) ?? 0, unit: row.unit },
      })),
    outputs: state.outputs
      .filter((row) => row.materialId.length > 0)
      .map((row) => ({
        materialId: row.materialId,
        quantity: { amount: parseAmount(row.amount) ?? 0, unit: row.unit },
      })),
    ...(state.observation.trim().length > 0 ? { observation: state.observation.trim() } : {}),
  };
}
