import {
  Assignment,
  type AssignmentProps,
  Batch,
  BatchEvent,
  type BatchEventProps,
  type BatchProps,
  Location,
  type LocationId,
  type LocationProps,
  Machine,
  type MachineId,
  type MachineProps,
  Material,
  type MaterialId,
  type MaterialProps,
  Quantity,
  Recipe,
  RecipeStep,
  type RecipeStepProps,
  StockMovement,
  type StockMovementProps,
  TimeSlot,
  type UnitOfMeasure,
  Worker,
  type WorkerId,
  type WorkerProps,
} from '@fabrik/domain';

export function aMaterial(overrides: Partial<MaterialProps> = {}): Material {
  return Material.create({
    name: 'Harina',
    kind: 'supply',
    physicalState: 'solid',
    unitOfMeasure: 'kg',
    ...overrides,
  });
}

export function aProduct(name = 'Pan'): Material {
  return Material.create({ name, kind: 'product', physicalState: 'solid', unitOfMeasure: 'unit' });
}

export function aLocation(overrides: Partial<LocationProps> = {}): Location {
  return Location.create({ name: 'Almacén', kind: 'storage', ...overrides });
}

export function aMachine(locationId: LocationId, overrides: Partial<MachineProps> = {}): Machine {
  return Machine.create({ name: 'Horno', type: 'oven', locationId, ...overrides });
}

export function aWorker(overrides: Partial<WorkerProps> = {}): Worker {
  return Worker.create({ name: 'Ana', role: 'worker', ...overrides });
}

export function aRecipeStep(
  outputProductId: MaterialId,
  overrides: Partial<RecipeStepProps> = {},
): RecipeStep {
  return RecipeStep.create({
    position: 1,
    machineType: 'oven',
    inputs: [{ materialId: outputProductId, quantity: Quantity.create(1, 'kg') }],
    outputProductId,
    outputQuantity: Quantity.create(2, 'kg'),
    ...overrides,
  });
}

export function aRecipe(
  outputProductId: MaterialId,
  step: RecipeStep = aRecipeStep(outputProductId),
  overrides: { name?: string } = {},
): Recipe {
  return Recipe.create({
    name: overrides.name ?? 'Masa',
    outputProductId,
    outputQuantity: Quantity.create(2, 'kg'),
    steps: [step],
  });
}

export function anAssignment(
  workerId: WorkerId,
  machineId: MachineId,
  overrides: Partial<AssignmentProps> = {},
): Assignment {
  return Assignment.create({
    workerId,
    machineId,
    slot: TimeSlot.create([1, 3], '08:00', '16:00'),
    ...overrides,
  });
}

export function aBatch(materialId: MaterialId, overrides: Partial<BatchProps> = {}): Batch {
  return Batch.create({ materialId, quantity: Quantity.create(10, 'kg'), ...overrides });
}

export function aBatchEvent(props: BatchEventProps): BatchEvent {
  return BatchEvent.create(props);
}

export function aStockMovement(props: StockMovementProps): StockMovement {
  return StockMovement.create(props);
}

export function quantity(amount: number, unit: UnitOfMeasure): Quantity {
  return Quantity.create(amount, unit);
}
