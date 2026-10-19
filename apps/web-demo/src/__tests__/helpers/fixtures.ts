import type {
  AssignmentWire,
  BatchEventWire,
  BatchQuantityWire,
  BatchWire,
  LocationWire,
  MachineWire,
  MaterialQuantityWire,
  MaterialWire,
  MeScheduleItemWire,
  QuantityWire,
  RecipeStepWire,
  RecipeWire,
  StockByLocationEntryWire,
  StockMovementWire,
  TimeSlotWire,
  TransformationWire,
  WorkerWire,
} from '@/lib/api/types';

/**
 * Fábricas de los DTOs de wire de la API (Fase 7, docs/10-plan-de-web.md
 * §Testing): objetos válidos listos para las respuestas de los mocks de
 * `lib/api/modules/*`, con overrides a un nivel.
 *
 * Convenciones:
 * - **Defaults deterministas**: los ids se auto-generan por secuencia
 *   (`loc-01`, `mat-01`, …) y las referencias cruzadas apuntan al *primer*
 *   id de su tipo (`machine.locationId = 'loc-01'`, etc.). En los tests que
 *   aserten sobre ids concretos, pásalos explícitos por override.
 * - Los overrides son **a un nivel**: un objeto anidado (`quantity`, `slot`,
 *   `delta`, `machine`) se reemplaza entero — no hay merge profundo. Para
 *   construirlos en una línea usá `quantity()` / `slot()`.
 * - Los campos opcionales del wire (`recipeId`, `originBatchEventId`,
 *   `observation`, …) quedan **omitidos** por defecto, como en la API real.
 *
 * El mockeo de la capa HTTP sigue siendo el de siempre: `vi.fn()` sobre los
 * módulos de `lib/api/modules/*` (`client.ts` / su adaptador axios se eliminaron
 * con la migración demo — docs/11-plan-demo.md §T5). **No se usa msw** — ver
 * `src/__tests__/helpers/README.md`.
 */

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${String(seq).padStart(2, '0')}`;
}

/** ISO fijo para `timestamp` de eventos y movimientos (un lunes, 10:00 UTC). */
export const FIXED_TIMESTAMP = '2026-03-02T10:00:00.000Z';

/** `QuantityWire` para los overrides anidados. */
export function quantity(amount: number, unit: QuantityWire['unit'] = 'unit'): QuantityWire {
  return { amount, unit };
}

/** `TimeSlotWire` para los overrides anidados (lun–vie 08:00–17:00 por defecto). */
export function slot(overrides: Partial<TimeSlotWire> = {}): TimeSlotWire {
  return {
    daysOfWeek: [1, 2, 3, 4, 5],
    start: '08:00',
    end: '17:00',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

export function makeMaterial(overrides: Partial<MaterialWire> = {}): MaterialWire {
  return {
    id: nextId('mat'),
    name: 'Material',
    kind: 'supply',
    physicalState: 'solid',
    unitOfMeasure: 'kg',
    active: true,
    ...overrides,
  };
}

export function makeLocation(overrides: Partial<LocationWire> = {}): LocationWire {
  return {
    id: nextId('loc'),
    name: 'Ubicación',
    kind: 'storage',
    ...overrides,
  };
}

export function makeMachine(overrides: Partial<MachineWire> = {}): MachineWire {
  return {
    id: nextId('maq'),
    name: 'Máquina',
    type: 'mixer',
    locationId: 'loc-01',
    status: 'idle',
    ...overrides,
  };
}

export function makeWorker(overrides: Partial<WorkerWire> = {}): WorkerWire {
  return {
    id: nextId('w'),
    name: 'Operario',
    role: 'worker',
    active: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Recetas
// ---------------------------------------------------------------------------

/** Material + cantidad de un input/output de paso (o de evento). */
export function makeMaterialQuantity(
  overrides: Partial<MaterialQuantityWire> = {},
): MaterialQuantityWire {
  return {
    materialId: 'mat-01',
    quantity: quantity(1),
    ...overrides,
  };
}

export function makeRecipeStep(overrides: Partial<RecipeStepWire> = {}): RecipeStepWire {
  return {
    id: nextId('step'),
    position: 1,
    machineType: 'mixer',
    inputs: [],
    outputProductId: 'mat-01',
    outputQuantity: quantity(1),
    ...overrides,
  };
}

export function makeRecipe(overrides: Partial<RecipeWire> = {}): RecipeWire {
  return {
    id: nextId('recipe'),
    name: 'Receta',
    outputProductId: 'mat-01',
    outputQuantity: quantity(1),
    steps: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Asignaciones
// ---------------------------------------------------------------------------

export function makeAssignment(overrides: Partial<AssignmentWire> = {}): AssignmentWire {
  return {
    id: nextId('asg'),
    workerId: 'w-01',
    machineId: 'maq-01',
    slot: slot(),
    ...overrides,
  };
}

/** `GET /me/schedule`: asignación + máquina resuelta + vigencia server-side. */
export function makeMeScheduleItem(
  overrides: Partial<MeScheduleItemWire> = {},
): MeScheduleItemWire {
  const assignment: AssignmentWire = makeAssignment(overrides);
  return {
    ...assignment,
    machine: makeMachine({ id: assignment.machineId }),
    activeNow: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Lotes y eventos
// ---------------------------------------------------------------------------

export function makeBatch(overrides: Partial<BatchWire> = {}): BatchWire {
  return {
    id: nextId('batch'),
    materialId: 'mat-01',
    quantity: quantity(1),
    status: 'in_progress',
    ...overrides,
  };
}

/** Referencia material+cantidad dentro de un evento (`inputs[]`/`outputs[]`). */
export function makeBatchQuantity(overrides: Partial<BatchQuantityWire> = {}): BatchQuantityWire {
  return {
    batchId: 'batch-01',
    materialId: 'mat-01',
    quantity: quantity(1),
    ...overrides,
  };
}

export function makeBatchEvent(overrides: Partial<BatchEventWire> = {}): BatchEventWire {
  return {
    id: nextId('ev'),
    machineId: 'maq-01',
    workerId: 'w-01',
    locationId: 'loc-01',
    inputs: [],
    outputs: [],
    timestamp: FIXED_TIMESTAMP,
    ...overrides,
  };
}

/** Respuesta de `POST /production/transform`. */
export function makeTransformation(
  overrides: Partial<TransformationWire> = {},
): TransformationWire {
  return {
    event: makeBatchEvent(),
    outputBatches: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

export function makeStockEntry(
  overrides: Partial<StockByLocationEntryWire> = {},
): StockByLocationEntryWire {
  return {
    materialId: 'mat-01',
    amount: 10,
    unit: 'unit',
    ...overrides,
  };
}

export function makeStockMovement(overrides: Partial<StockMovementWire> = {}): StockMovementWire {
  return {
    id: nextId('mv'),
    locationId: 'loc-01',
    materialId: 'mat-01',
    delta: quantity(1),
    reason: 'supply_in',
    timestamp: FIXED_TIMESTAMP,
    ...overrides,
  };
}
