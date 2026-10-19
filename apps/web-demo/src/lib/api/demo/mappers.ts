import {
  Assignment,
  AssignmentId,
  Batch,
  BatchEvent,
  BatchEventId,
  BatchId,
  type BatchQuantity,
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
  Worker,
  WorkerId,
} from '@fabrik/domain';

import type {
  AssignmentWire,
  BatchEventWire,
  BatchQuantityWire,
  BatchWire,
  LocationWire,
  MachineWire,
  MaterialQuantityWire,
  MaterialWire,
  QuantityWire,
  RecipeStepWire,
  RecipeWire,
  StockDeltaWire,
  StockMovementWire,
  WorkerWire,
} from '../types';

/**
 * Mappers del runtime DEMO: entidad de dominio ↔ DTO de wire (`../types`).
 *
 * Espejan 1:1 la capa de persistencia de `apps/api`:
 * - El camino **hidratación** (`*FromWire`) equivale a los `rowTo*` de
 *   `apps/api/src/persistence/mappers.ts`: reconstitución con `*Id.from`,
 *   `Quantity.create`/`TimeSlot.create` (que revalidan los invariantes) y
 *   `*fromPersistence` (que revalida la entidad, p. ej. la integridad de las
 *   recetas o la coherencia unidad ↔ estado físico).
 * - El camino **serialización** (`*ToWire`) equivale a
 *   `apps/api/src/common/entity-serializers.ts`: serialización explícita por
 *   lista blanca de campos (no sirve spread sobre `TimeSlot`, que lleva campos
 *   internos) y **campos opcionales omitidos** (nunca `undefined` en el wire).
 *
 * En el demo no hay `row` separada del wire: la fila persistida en
 * `sessionStorage` ES el DTO de wire (ver `db.ts`), así que cada repositorio
 * de `repos.ts` usa exactamente estos dos caminos.
 */

// ---------------------------------------------------------------------------
// Value objects compartidos
// ---------------------------------------------------------------------------

/** Reconstruye una `Quantity` (valida `amount > 0`). */
export function quantityFromWire(wire: QuantityWire): Quantity {
  return Quantity.create(wire.amount, wire.unit);
}

/** Serializa una `Quantity`: `{ amount, unit }`. */
export function quantityToWire(quantity: Quantity): QuantityWire {
  return { amount: quantity.amount, unit: quantity.unit };
}

/** Reconstruye un `StockDelta` (admite signo; no valida positividad). */
export function stockDeltaFromWire(wire: StockDeltaWire): StockDelta {
  return { amount: wire.amount, unit: wire.unit };
}

/** Delta de stock en el wire: signo en `amount`. */
export function stockDeltaToWire(delta: StockDelta): StockDeltaWire {
  return { amount: delta.amount, unit: delta.unit };
}

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

export function materialFromWire(row: MaterialWire): Material {
  return Material.fromPersistence({
    id: MaterialId.from(row.id),
    name: row.name,
    ...(row.description !== undefined ? { description: row.description } : {}),
    kind: row.kind,
    physicalState: row.physicalState,
    unitOfMeasure: row.unitOfMeasure,
    active: row.active,
  });
}

export function materialToWire(material: Material): MaterialWire {
  return {
    id: material.id,
    name: material.name,
    ...(material.description !== undefined ? { description: material.description } : {}),
    kind: material.kind,
    physicalState: material.physicalState,
    unitOfMeasure: material.unitOfMeasure,
    active: material.active,
  };
}

export function locationFromWire(row: LocationWire): Location {
  return Location.fromPersistence({
    id: LocationId.from(row.id),
    name: row.name,
    kind: row.kind,
  });
}

export function locationToWire(location: Location): LocationWire {
  return { id: location.id, name: location.name, kind: location.kind };
}

export function machineFromWire(row: MachineWire): Machine {
  return Machine.fromPersistence({
    id: MachineId.from(row.id),
    name: row.name,
    type: row.type,
    locationId: LocationId.from(row.locationId),
    status: row.status,
  });
}

export function machineToWire(machine: Machine): MachineWire {
  return {
    id: machine.id,
    name: machine.name,
    type: machine.type,
    locationId: machine.locationId,
    status: machine.status,
  };
}

export function workerFromWire(row: WorkerWire): Worker {
  return Worker.fromPersistence({
    id: WorkerId.from(row.id),
    name: row.name,
    role: row.role,
    active: row.active,
  });
}

export function workerToWire(worker: Worker): WorkerWire {
  return { id: worker.id, name: worker.name, role: worker.role, active: worker.active };
}

// ---------------------------------------------------------------------------
// Recetas
// ---------------------------------------------------------------------------

export function materialQuantityFromWire(row: MaterialQuantityWire): MaterialQuantity {
  return { materialId: MaterialId.from(row.materialId), quantity: quantityFromWire(row.quantity) };
}

export function materialQuantityToWire(quantity: MaterialQuantity): MaterialQuantityWire {
  return { materialId: quantity.materialId, quantity: quantityToWire(quantity.quantity) };
}

export function recipeStepFromWire(row: RecipeStepWire): RecipeStep {
  return RecipeStep.fromPersistence({
    id: RecipeStepId.from(row.id),
    position: row.position,
    machineType: row.machineType,
    inputs: row.inputs.map(materialQuantityFromWire),
    outputProductId: MaterialId.from(row.outputProductId),
    outputQuantity: quantityFromWire(row.outputQuantity),
  });
}

export function recipeStepToWire(step: RecipeStep): RecipeStepWire {
  return {
    id: step.id,
    position: step.position,
    machineType: step.machineType,
    inputs: step.inputs.map(materialQuantityToWire),
    outputProductId: step.outputProductId,
    outputQuantity: quantityToWire(step.outputQuantity),
  };
}

export function recipeFromWire(row: RecipeWire): Recipe {
  // La normalización por posición es del agregado (`Recipe.fromPersistence` la
  // revalida); el orden del wire es incidental, igual que en el mapper Drizzle.
  const steps = [...row.steps].sort((a, b) => a.position - b.position).map(recipeStepFromWire);
  return Recipe.fromPersistence({
    id: RecipeId.from(row.id),
    name: row.name,
    outputProductId: MaterialId.from(row.outputProductId),
    outputQuantity: quantityFromWire(row.outputQuantity),
    steps,
  });
}

export function recipeToWire(recipe: Recipe): RecipeWire {
  // El agregado guarda los pasos ya ordenados por posición.
  return {
    id: recipe.id,
    name: recipe.name,
    outputProductId: recipe.outputProductId,
    outputQuantity: quantityToWire(recipe.outputQuantity),
    steps: recipe.steps.map(recipeStepToWire),
  };
}

// ---------------------------------------------------------------------------
// Asignaciones
// ---------------------------------------------------------------------------

export function assignmentFromWire(row: AssignmentWire): Assignment {
  return Assignment.fromPersistence({
    id: AssignmentId.from(row.id),
    workerId: WorkerId.from(row.workerId),
    machineId: MachineId.from(row.machineId),
    slot: TimeSlot.create(row.slot.daysOfWeek, row.slot.start, row.slot.end),
  });
}

export function assignmentToWire(assignment: Assignment): AssignmentWire {
  return {
    id: assignment.id,
    workerId: assignment.workerId,
    machineId: assignment.machineId,
    slot: {
      daysOfWeek: [...assignment.slot.daysOfWeek],
      start: assignment.slot.start,
      end: assignment.slot.end,
    },
  };
}

// ---------------------------------------------------------------------------
// Lotes y eventos
// ---------------------------------------------------------------------------

export function batchFromWire(row: BatchWire): Batch {
  return Batch.fromPersistence({
    id: BatchId.from(row.id),
    materialId: MaterialId.from(row.materialId),
    quantity: quantityFromWire(row.quantity),
    ...(row.recipeId !== undefined ? { recipeId: RecipeId.from(row.recipeId) } : {}),
    ...(row.originBatchEventId !== undefined
      ? { originBatchEventId: BatchEventId.from(row.originBatchEventId) }
      : {}),
    status: row.status,
  });
}

export function batchToWire(batch: Batch): BatchWire {
  return {
    id: batch.id,
    materialId: batch.materialId,
    quantity: quantityToWire(batch.quantity),
    ...(batch.recipeId !== undefined ? { recipeId: batch.recipeId } : {}),
    ...(batch.originBatchEventId !== undefined
      ? { originBatchEventId: batch.originBatchEventId }
      : {}),
    status: batch.status,
  };
}

export function batchQuantityFromWire(row: BatchQuantityWire): BatchQuantity {
  return {
    ...(row.batchId !== undefined ? { batchId: BatchId.from(row.batchId) } : {}),
    materialId: MaterialId.from(row.materialId),
    quantity: quantityFromWire(row.quantity),
  };
}

export function batchQuantityToWire(quantity: BatchQuantity): BatchQuantityWire {
  return {
    ...(quantity.batchId !== undefined ? { batchId: quantity.batchId } : {}),
    materialId: quantity.materialId,
    quantity: quantityToWire(quantity.quantity),
  };
}

export function batchEventFromWire(row: BatchEventWire): BatchEvent {
  return BatchEvent.fromPersistence({
    id: BatchEventId.from(row.id),
    machineId: MachineId.from(row.machineId),
    workerId: WorkerId.from(row.workerId),
    locationId: LocationId.from(row.locationId),
    ...(row.recipeStepId !== undefined
      ? { recipeStepId: RecipeStepId.from(row.recipeStepId) }
      : {}),
    inputs: row.inputs.map(batchQuantityFromWire),
    outputs: row.outputs.map(batchQuantityFromWire),
    ...(row.observation !== undefined ? { observation: row.observation } : {}),
    timestamp: new Date(row.timestamp),
  });
}

export function batchEventToWire(event: BatchEvent): BatchEventWire {
  return {
    id: event.id,
    machineId: event.machineId,
    workerId: event.workerId,
    locationId: event.locationId,
    ...(event.recipeStepId !== undefined ? { recipeStepId: event.recipeStepId } : {}),
    inputs: event.inputs.map(batchQuantityToWire),
    outputs: event.outputs.map(batchQuantityToWire),
    ...(event.observation !== undefined ? { observation: event.observation } : {}),
    timestamp: event.timestamp.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

export function stockMovementFromWire(row: StockMovementWire): StockMovement {
  return StockMovement.fromPersistence({
    id: StockMovementId.from(row.id),
    locationId: LocationId.from(row.locationId),
    materialId: MaterialId.from(row.materialId),
    delta: stockDeltaFromWire(row.delta),
    reason: row.reason,
    ...(row.batchEventId !== undefined
      ? { batchEventId: BatchEventId.from(row.batchEventId) }
      : {}),
    timestamp: new Date(row.timestamp),
  });
}

export function stockMovementToWire(movement: StockMovement): StockMovementWire {
  return {
    id: movement.id,
    locationId: movement.locationId,
    materialId: movement.materialId,
    delta: stockDeltaToWire(movement.delta),
    reason: movement.reason,
    ...(movement.batchEventId !== undefined ? { batchEventId: movement.batchEventId } : {}),
    timestamp: movement.timestamp.toISOString(),
  };
}
