# Referencia — Entidades

Entidades de `@fabrik/domain` (`src/entities/`). Todas son **inmutables**: no tienen
setters; las transiciones devuelven una instancia nueva. El patrón uniforme es:

- `create(props)` — construye una entidad nueva con **id autogenerado** y valida.
- `fromPersistence(snapshot)` — reconstituye una entidad ya persistida (mismo shape
  con `id` requerido) y **vuelve a aplicar las validaciones** de construcción.

Cuando una entidad tiene estado mutable, expone métodos copy-on-write que devuelven
otra instancia. Las instancias se congelan (`Object.freeze`).

> Invariantes I1–I7 y dónde se aplican: [explicacion/invariantes.md](../explicacion/invariantes.md).

## `Factory` (`factory.ts`)

Raíz del contexto. `FactorySnapshot extends FactoryProps { id: FactoryId }`.

| | |
|---|---|
| Campos | `id: FactoryId`, `name: string` |
| `FactoryProps` | `{ name: string }` |
| Métodos | `static create(props): Factory`, `static fromPersistence(snapshot): Factory` |

## `Material` (`material.ts`)

Ítem del catálogo. La validación que garantiza por sí mismo es la coherencia unidad ↔
estado físico (I6). `active` habilita la baja lógica.

| | |
|---|---|
| Campos | `id: MaterialId`, `name: string`, `description?: string`, `kind: MaterialKind`, `physicalState: PhysicalState`, `unitOfMeasure: UnitOfMeasure`, `active: boolean` |
| Tipos | `MaterialKind = 'supply' \| 'product'` |
| `MaterialProps` | `name`, `description?`, `kind`, `physicalState`, `unitOfMeasure`, `active?` (default `true`) |
| Métodos | `create(props)`, `fromPersistence(snapshot)`, `activate()`, `deactivate()` |
| Errores | `IncompatibleUnitError` si `unitOfMeasure` no es coherente con `physicalState` |

`activate()` / `deactivate()` son **idempotentes**: devuelven la misma instancia si el
estado no cambia.

## `Location` (`location.ts`)

Lugar físico. `kind` decide si aloja máquinas (`production`) o guarda stock (`storage`).

| | |
|---|---|
| Campos | `id: LocationId`, `name: string`, `kind: LocationKind` |
| Tipos | `LocationKind = 'production' \| 'storage'` |
| `LocationProps` | `{ name, kind }` |
| Métodos | `create(props)`, `fromPersistence(snapshot)` |

## `Machine` (`machine.ts`)

Máquina de la fábrica. Máquina de estados: `idle ⇄ running`; `idle → maintenance → idle`.

| | |
|---|---|
| Campos | `id: MachineId`, `name: string`, `type: MachineType`, `locationId: LocationId`, `status: MachineStatus` |
| Tipos | `MachineType = string` (catálogo abierto), `MachineStatus = 'idle' \| 'running' \| 'maintenance'` |
| `MachineProps` | `name`, `type`, `locationId`, `status?` (default `'idle'`) |
| `ProductionLocationRef` | `{ id: LocationId; kind: LocationKind }` |
| Métodos | `create`, `fromPersistence`, `moveTo(location)`, `start()`, `stop()`, `startMaintenance()`, `finishMaintenance()` |
| Errores | `InvalidLocationKindError` (I2 en `moveTo`), `InvalidStateTransitionError` (transición no permitida) |

Transiciones:

| Método | De → a |
|---|---|
| `start()` | `idle → running` |
| `stop()` | `running → idle` |
| `startMaintenance()` | `idle → maintenance` |
| `finishMaintenance()` | `maintenance → idle` |
| `moveTo(location)` | exige `location.kind === 'production'` (I2) |

## `Worker` (`worker.ts`)

Trabajador. El rol es dato de identidad; la autorización ocurre en los casos de uso.

| | |
|---|---|
| Campos | `id: WorkerId`, `name: string`, `role: WorkerRole`, `active: boolean` |
| Tipos | `WorkerRole = 'admin' \| 'worker' \| 'auditor'` |
| `WorkerProps` | `name`, `role`, `active?` (default `true`) |
| Métodos | `create`, `fromPersistence`, `activate()`, `deactivate()`, `isAdmin()`, `isWorker()`, `isAuditor()` |

`activate()` / `deactivate()` son idempotentes.

## `Recipe` y `RecipeStep` (`recipe.ts`)

Cadena ordenada e inmutable de pasos para fabricar un producto. La coherencia de orden
(posiciones `1..N`) y del output final (I7) la garantiza el agregado `Recipe`, que
conoce el conjunto completo; `RecipeStep` no la valida por sí solo.

### `RecipeStep`

| | |
|---|---|
| Campos | `id: RecipeStepId`, `position: number`, `machineType: MachineType`, `inputs: readonly MaterialQuantity[]`, `outputProductId: MaterialId`, `outputQuantity: Quantity` |
| Tipos | `MaterialQuantity = { materialId: MaterialId; quantity: Quantity }` |
| `RecipeStepProps` | `{ position, machineType, inputs, outputProductId, outputQuantity }` |
| Métodos | `create(props)`, `fromPersistence(snapshot)` |

### `Recipe`

| | |
|---|---|
| Campos | `id: RecipeId`, `name: string`, `outputProductId: MaterialId`, `outputQuantity: Quantity`, `steps: readonly RecipeStep[]` |
| `RecipeProps` | `{ name, outputProductId, outputQuantity, steps }` |
| Métodos | `create`, `fromPersistence` |
| Errores | `RecipeIntegrityError` |

Validaciones en construcción:

1. al menos un paso;
2. posiciones **consecutivas empezando en 1** (se ordena por `position` antes de validar);
3. **I7**: el `outputProductId` del último paso coincide con el `outputProductId` de la receta.

La receta ordena internamente los pasos por `position`, por lo que `steps` siempre sale
ordenado. **No** se valida que el output del paso N sea input del paso N+1 (ver
[decisiones y limitaciones](../explicacion/decisiones-y-limitaciones.md)).

## `Batch` (`batch.ts`)

Lote: instancia física trazable de un material.

| | |
|---|---|
| Campos | `id: BatchId`, `materialId: MaterialId`, `quantity: Quantity`, `recipeId?: RecipeId`, `originBatchEventId?: BatchEventId`, `status: BatchStatus` |
| Tipos | `BatchStatus = 'in_progress' \| 'completed' \| 'stored'` |
| `BatchProps` | `materialId`, `quantity`, `recipeId?`, `originBatchEventId?`, `status?` (default `'in_progress'`) |
| Métodos | `create`, `fromPersistence`, `store()`, `resume()`, `complete()` |
| Errores | `InvalidStateTransitionError` |

Máquina de estados:

| Método | Transición |
|---|---|
| `store()` | `in_progress → stored` |
| `resume()` | `stored → in_progress` |
| `complete()` | `in_progress \| stored → completed` (estado final) |

`completed` no admite ninguna transición. `recipeId` es `undefined` en lotes de
suministro; `originBatchEventId` es `undefined` cuando el lote es un ingreso externo.

## `BatchEvent` (`batch-event.ts`)

Registro **inmutable** de una transformación en máquina: el corazón de la trazabilidad
(I4). No tiene setters ni métodos de mutación.

| | |
|---|---|
| Campos | `id: BatchEventId`, `machineId`, `workerId`, `locationId`, `recipeStepId?: RecipeStepId`, `inputs: readonly BatchQuantity[]`, `outputs: readonly BatchQuantity[]`, `observation?: string`, `timestamp: Date` |
| `BatchQuantity` | `{ batchId?: BatchId; materialId: MaterialId; quantity: Quantity }` |
| `BatchEventProps` | `machineId`, `workerId`, `locationId`, `recipeStepId?`, `inputs`, `outputs`, `observation?`, `timestamp?` (default: ahora) |
| Métodos | `create(props)`, `fromPersistence(snapshot)` |
| Errores | `InvalidObservationError` |

`observation` se normaliza con `trim()`: vacía → `undefined`; supera
`MAX_OBSERVATION_LENGTH` (500) → `InvalidObservationError`.

## `Assignment` (`assignment.ts`)

Asignación horaria trabajador ↔ máquina. **Inmutable.** El invariante I1 (solapamiento)
lo decide el caso de uso; aquí solo se expone el helper puro.

| | |
|---|---|
| Campos | `id: AssignmentId`, `workerId: WorkerId`, `machineId: MachineId`, `slot: TimeSlot` |
| `AssignmentProps` | `{ workerId, machineId, slot }` |
| Métodos | `create`, `fromPersistence`, `overlapsWith(other): boolean`, `isForWorker(workerId): boolean` |

## `StockMovement` (`stock-movement.ts`)

Movimiento de stock **inmutable** (I4). `delta` es un valor con signo; el stock es la
suma de movimientos.

| | |
|---|---|
| Campos | `id: StockMovementId`, `locationId: LocationId`, `materialId: MaterialId`, `delta: StockDelta`, `reason: StockMovementReason`, `batchEventId?: BatchEventId`, `timestamp: Date` |
| `StockMovementReason` | `'produced' \| 'consumed' \| 'supply_in' \| 'transfer_in' \| 'transfer_out' \| 'manual_adjustment'` |
| `StockMovementProps` | `locationId`, `materialId`, `delta`, `reason`, `batchEventId?`, `timestamp?` (default: ahora) |
| Métodos | `create(props)`, `fromPersistence(snapshot)` |
| Errores | `InvalidStockMovementError` |

Reglas de construcción (`validate`):

- `delta.amount` debe ser finito y **distinto de 0**.
- **`produced` y `consumed` exigen `batchEventId`**.
- El resto de los motivos **prohíben** `batchEventId`.
