import {
  Assignment,
  AssignmentId,
  Batch,
  BatchEvent,
  BatchEventId,
  BatchId,
  type BatchQuantity,
  type DayOfWeek,
  Factory,
  FactoryId,
  Location,
  LocationId,
  Machine,
  MachineId,
  Material,
  MaterialId,
  type MaterialQuantity,
  Quantity,
  Recipe,
  RecipeId,
  RecipeStep,
  RecipeStepId,
  type StockDelta,
  StockMovement,
  StockMovementId,
  TimeSlot,
  type UnitOfMeasure,
  Worker,
  WorkerId,
} from '@fabrik/domain';

import type {
  AssignmentRow,
  BatchEventInputRow,
  BatchEventOutputRow,
  BatchEventRow,
  BatchRow,
  FactoryRow,
  LocationRow,
  MachineRow,
  MaterialRow,
  RecipeRow,
  RecipeStepInputRow,
  RecipeStepRow,
  StockMovementRow,
  WorkerRow,
} from './schema.js';

// ---------------------------------------------------------------------------
// Helpers de value objects
// ---------------------------------------------------------------------------

/** Reconstruye una `Quantity` (valida `amount > 0`). */
export function toQuantity(amount: number, unit: UnitOfMeasure): Quantity {
  return Quantity.create(amount, unit);
}

/** Reconstruye un `StockDelta` (admite signo; no valida positividad). */
export function toStockDelta(amount: number, unit: UnitOfMeasure): StockDelta {
  return { amount, unit };
}

/** Serializa `daysOfWeek` como `"0,2,5"` (ordenado ascendente). */
export function encodeDays(days: readonly DayOfWeek[]): string {
  return [...days].sort((a, b) => a - b).join(',');
}

/** Días válidos como string canónico (los que produce `encodeDays`). */
const VALID_DAY_TOKENS = new Set(['0', '1', '2', '3', '4', '5', '6']);

/**
 * Reconstruye `daysOfWeek` desde `"0,2,5"`. Parseo **estricto**: un token que no
 * sea exactamente `"0"`..`"6"` indica una fila corrupta, así que lanza un
 * `Error` plano (problema de datos del servidor, no una entrada de usuario: no
 * se mapea a 422 como los errores de dominio de `TimeSlot`).
 */
export function decodeDays(raw: string): DayOfWeek[] {
  return raw.split(',').map((part) => {
    if (!VALID_DAY_TOKENS.has(part)) {
      throw new Error(`daysOfWeek inválido en la base de datos: "${part}"`);
    }
    return Number.parseInt(part, 10) as DayOfWeek;
  });
}

function optionalId<T>(raw: string | null, from: (value: string) => T): T | undefined {
  return raw === null || raw === undefined ? undefined : from(raw);
}

// ---------------------------------------------------------------------------
// Factories (sin puerto; solo esquema) — mapper de conveniencia
// ---------------------------------------------------------------------------

export function rowToFactory(row: FactoryRow): Factory {
  return Factory.fromPersistence({ id: FactoryId.from(row.id), name: row.name });
}

export function factoryToRow(factory: Factory): FactoryRow {
  return { id: factory.id, name: factory.name };
}

// ---------------------------------------------------------------------------
// Material
// ---------------------------------------------------------------------------

export function rowToMaterial(row: MaterialRow): Material {
  return Material.fromPersistence({
    id: MaterialId.from(row.id),
    name: row.name,
    description: row.description ?? undefined,
    kind: row.kind,
    physicalState: row.physicalState,
    unitOfMeasure: row.unitOfMeasure,
    active: row.active,
  });
}

export function materialToRow(material: Material): MaterialRow {
  return {
    id: material.id,
    name: material.name,
    description: material.description ?? null,
    kind: material.kind,
    physicalState: material.physicalState,
    unitOfMeasure: material.unitOfMeasure,
    active: material.active,
  };
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export function rowToLocation(row: LocationRow): Location {
  return Location.fromPersistence({
    id: LocationId.from(row.id),
    name: row.name,
    kind: row.kind,
  });
}

export function locationToRow(location: Location): LocationRow {
  return { id: location.id, name: location.name, kind: location.kind };
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

export function rowToMachine(row: MachineRow): Machine {
  return Machine.fromPersistence({
    id: MachineId.from(row.id),
    name: row.name,
    type: row.type,
    locationId: LocationId.from(row.locationId),
    status: row.status,
  });
}

export function machineToRow(machine: Machine): MachineRow {
  return {
    id: machine.id,
    name: machine.name,
    type: machine.type,
    locationId: machine.locationId,
    status: machine.status,
  };
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export function rowToWorker(row: WorkerRow): Worker {
  return Worker.fromPersistence({
    id: WorkerId.from(row.id),
    name: row.name,
    role: row.role,
    active: row.active,
  });
}

export function workerToRow(worker: Worker): WorkerRow {
  return { id: worker.id, name: worker.name, role: worker.role, active: worker.active };
}

// ---------------------------------------------------------------------------
// Recipe (+ steps + step inputs)
// ---------------------------------------------------------------------------

export function rowToRecipeStepInput(row: RecipeStepInputRow): MaterialQuantity {
  return {
    materialId: MaterialId.from(row.materialId),
    quantity: toQuantity(row.amount, row.unit),
  };
}

export function rowToRecipeStep(
  row: RecipeStepRow,
  inputs: readonly RecipeStepInputRow[],
): RecipeStep {
  return RecipeStep.fromPersistence({
    id: RecipeStepId.from(row.id),
    position: row.position,
    machineType: row.machineType,
    inputs: inputs.map(rowToRecipeStepInput),
    outputProductId: MaterialId.from(row.outputProductId),
    outputQuantity: toQuantity(row.outputAmount, row.outputUnit),
  });
}

export function rowToRecipe(
  row: RecipeRow,
  steps: readonly { step: RecipeStepRow; inputs: readonly RecipeStepInputRow[] }[],
): Recipe {
  return Recipe.fromPersistence({
    id: RecipeId.from(row.id),
    name: row.name,
    outputProductId: MaterialId.from(row.outputProductId),
    outputQuantity: toQuantity(row.outputAmount, row.outputUnit),
    steps: steps
      .slice()
      .sort((a, b) => a.step.position - b.step.position)
      .map(({ step, inputs }) => rowToRecipeStep(step, inputs)),
  });
}

export function recipeToRow(recipe: Recipe): RecipeRow {
  return {
    id: recipe.id,
    name: recipe.name,
    outputProductId: recipe.outputProductId,
    outputAmount: recipe.outputQuantity.amount,
    outputUnit: recipe.outputQuantity.unit,
  };
}

export function recipeStepToRow(recipeId: RecipeId, step: RecipeStep): RecipeStepRow {
  return {
    id: step.id,
    recipeId,
    position: step.position,
    machineType: step.machineType,
    outputProductId: step.outputProductId,
    outputAmount: step.outputQuantity.amount,
    outputUnit: step.outputQuantity.unit,
  };
}

export function recipeStepInputsToRows(step: RecipeStep): RecipeStepInputRow[] {
  return step.inputs.map((input, ordinal) => ({
    recipeStepId: step.id,
    ordinal,
    materialId: input.materialId,
    amount: input.quantity.amount,
    unit: input.quantity.unit,
  }));
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export function rowToAssignment(row: AssignmentRow): Assignment {
  return Assignment.fromPersistence({
    id: AssignmentId.from(row.id),
    workerId: WorkerId.from(row.workerId),
    machineId: MachineId.from(row.machineId),
    slot: TimeSlot.create(decodeDays(row.daysOfWeek), row.start, row.end),
  });
}

export function assignmentToRow(assignment: Assignment): AssignmentRow {
  return {
    id: assignment.id,
    workerId: assignment.workerId,
    machineId: assignment.machineId,
    daysOfWeek: encodeDays(assignment.slot.daysOfWeek),
    start: assignment.slot.start,
    end: assignment.slot.end,
  };
}

// ---------------------------------------------------------------------------
// Batch
// ---------------------------------------------------------------------------

export function rowToBatch(row: BatchRow): Batch {
  return Batch.fromPersistence({
    id: BatchId.from(row.id),
    materialId: MaterialId.from(row.materialId),
    quantity: toQuantity(row.amount, row.unit),
    recipeId: optionalId(row.recipeId, (raw) => RecipeId.from(raw)),
    originBatchEventId: optionalId(row.originBatchEventId, (raw) => BatchEventId.from(raw)),
    status: row.status,
  });
}

export function batchToRow(batch: Batch): BatchRow {
  return {
    id: batch.id,
    materialId: batch.materialId,
    amount: batch.quantity.amount,
    unit: batch.quantity.unit,
    recipeId: batch.recipeId ?? null,
    originBatchEventId: batch.originBatchEventId ?? null,
    status: batch.status,
  };
}

// ---------------------------------------------------------------------------
// BatchEvent (+ inputs/outputs)
// ---------------------------------------------------------------------------

function rowToBatchQuantity(row: BatchEventInputRow | BatchEventOutputRow): BatchQuantity {
  return {
    batchId: optionalId(row.batchId, (raw) => BatchId.from(raw)),
    materialId: MaterialId.from(row.materialId),
    quantity: toQuantity(row.amount, row.unit),
  };
}

export function rowToBatchEvent(
  row: BatchEventRow,
  inputs: readonly BatchEventInputRow[],
  outputs: readonly BatchEventOutputRow[],
): BatchEvent {
  const byOrdinal = <T extends { ordinal: number }>(a: T, b: T) => a.ordinal - b.ordinal;
  return BatchEvent.fromPersistence({
    id: BatchEventId.from(row.id),
    machineId: MachineId.from(row.machineId),
    workerId: WorkerId.from(row.workerId),
    locationId: LocationId.from(row.locationId),
    recipeStepId: optionalId(row.recipeStepId, (raw) => RecipeStepId.from(raw)),
    inputs: inputs.slice().sort(byOrdinal).map(rowToBatchQuantity),
    outputs: outputs.slice().sort(byOrdinal).map(rowToBatchQuantity),
    observation: row.observation ?? undefined,
    timestamp: row.timestamp,
  });
}

export function batchEventToRow(event: BatchEvent): BatchEventRow {
  return {
    id: event.id,
    machineId: event.machineId,
    workerId: event.workerId,
    locationId: event.locationId,
    recipeStepId: event.recipeStepId ?? null,
    observation: event.observation ?? null,
    timestamp: event.timestamp,
  };
}

export function batchEventQuantityToInputRow(
  eventId: BatchEventId,
  items: readonly BatchQuantity[],
): BatchEventInputRow[] {
  return items.map((item, ordinal) => ({
    eventId,
    ordinal,
    batchId: item.batchId ?? null,
    materialId: item.materialId,
    amount: item.quantity.amount,
    unit: item.quantity.unit,
  }));
}

export function batchEventQuantityToOutputRow(
  eventId: BatchEventId,
  items: readonly BatchQuantity[],
): BatchEventOutputRow[] {
  return items.map((item, ordinal) => ({
    eventId,
    ordinal,
    batchId: item.batchId ?? null,
    materialId: item.materialId,
    amount: item.quantity.amount,
    unit: item.quantity.unit,
  }));
}

// ---------------------------------------------------------------------------
// StockMovement
// ---------------------------------------------------------------------------

export function rowToStockMovement(row: StockMovementRow): StockMovement {
  return StockMovement.fromPersistence({
    id: StockMovementId.from(row.id),
    locationId: LocationId.from(row.locationId),
    materialId: MaterialId.from(row.materialId),
    delta: toStockDelta(row.deltaAmount, row.deltaUnit),
    reason: row.reason,
    batchEventId: optionalId(row.batchEventId, (raw) => BatchEventId.from(raw)),
    timestamp: row.timestamp,
  });
}

export function stockMovementToRow(movement: StockMovement): StockMovementRow {
  return {
    id: movement.id,
    locationId: movement.locationId,
    materialId: movement.materialId,
    deltaAmount: movement.delta.amount,
    deltaUnit: movement.delta.unit,
    reason: movement.reason,
    batchEventId: movement.batchEventId ?? null,
    timestamp: movement.timestamp,
  };
}
