# Referencia — Casos de Uso

Un caso de uso es **una clase** con dependencias inyectadas por constructor y un único
método:

```ts
async execute(actor: Actor, command: Command): Promise<Result>;
```

La autorización se aplica con `requireRole` **antes** de cualquier validación o efecto.
Los eventos se publican **después** de persistir (o después del commit, si el caso de
uso es transaccional).

> Diseño general y modelo de roles: [explicacion/arquitectura-y-reglas.md](../explicacion/arquitectura-y-reglas.md).

## Actor y roles (`actor.ts`)

```ts
interface Actor {
  readonly workerId: WorkerId;
  readonly role: WorkerRole;
}

function requireRole(actor: Actor, allowed: readonly WorkerRole[], useCase: string): void;

const CATALOG_WRITE_ROLES: readonly WorkerRole[] = ['admin'];
const CATALOG_READ_ROLES: readonly WorkerRole[] = ['admin', 'auditor'];
const ALL_ROLES: readonly WorkerRole[] = ['admin', 'worker', 'auditor'];
```

`requireRole` lanza `UnauthorizedRoleError` si `actor.role` no está en `allowed`.

Leyenda de roles en las tablas: **A** = admin, **W** = worker, **Au** = auditor.

---

## Catálogos

| Caso de uso | Roles | Deps | Comando | Devuelve | Errores | Evento |
|---|---|---|---|---|---|---|
| `CreateMaterial` | A | `MaterialWriteDeps` | `{ name, description?, kind, physicalState, unitOfMeasure }` | `Material` | `IncompatibleUnitError` | `material.created` |
| `UpdateMaterial` | A | `MaterialWriteDeps` | `{ id, name?, description?, unitOfMeasure? }` | `Material` | `NotFoundError`, `IncompatibleUnitError` | `material.updated` |
| `DeactivateMaterial` | A | `MaterialWriteDeps` | `{ id }` | `Material` | `NotFoundError` | `material.updated` (solo si cambia) |
| `GetMaterial` | A, Au | `MaterialReadDeps` | `{ id }` | `Material` | `NotFoundError` | — |
| `ListMaterials` | A, Au | `MaterialReadDeps` | `{ filter? }` | `readonly Material[]` | — | — |
| `CreateLocation` | A | `LocationWriteDeps` | `{ name, kind }` | `Location` | — | — |
| `UpdateLocation` | A | `LocationWriteDeps` | `{ id, name? }` | `Location` | `NotFoundError` | — |
| `GetLocation` | A, Au | `LocationReadDeps` | `{ id }` | `Location` | `NotFoundError` | — |
| `ListLocations` | A, Au | `LocationReadDeps` | `{ filter? }` | `readonly Location[]` | — | — |
| `CreateMachine` | A | `MachineLocationDeps` | `{ name, type, locationId }` | `Machine` | `NotFoundError`, `InvalidLocationKindError` (I2) | `machine.created` |
| `UpdateMachine` | A | `MachineWriteDeps` | `{ id, name?, type? }` | `Machine` | `NotFoundError` | — |
| `MoveMachine` | A | `MachineLocationDeps` | `{ id, locationId }` | `Machine` | `NotFoundError`, `InvalidLocationKindError` (I2) | `machine.moved` |
| `GetMachine` | A, Au | `MachineReadDeps` | `{ id }` | `Machine` | `NotFoundError` | — |
| `ListMachines` | A, Au | `MachineReadDeps` | `{ filter? }` | `readonly Machine[]` | — | — |
| `CreateWorker` | A | `WorkerWriteDeps` | `{ name, role }` | `Worker` | — | — |
| `UpdateWorker` | A | `WorkerWriteDeps` | `{ id, name?, role? }` | `Worker` | `NotFoundError` | — |
| `DeactivateWorker` | A | `WorkerWriteDeps` | `{ id }` | `Worker` | `NotFoundError` | — |
| `GetWorker` | A, Au | `WorkerReadDeps` | `{ id }` | `Worker` | `NotFoundError` | — |
| `ListWorkers` | A, Au | `WorkerReadDeps` | `{ filter? }` | `readonly Worker[]` | — | — |
| `CreateRecipe` | A | `RecipeWriteDeps` | `{ name, outputProductId, outputQuantity, steps: RecipeStepProps[] }` | `Recipe` | `RecipeIntegrityError` | — |
| `UpdateRecipe` | A | `RecipeWriteDeps` | `{ id, name?, outputProductId?, outputQuantity?, steps? }` | `Recipe` | `NotFoundError`, `RecipeIntegrityError` | — |
| `GetRecipe` | A, Au | `RecipeReadDeps` | `{ id }` | `Recipe` | `NotFoundError` | — |
| `ListRecipes` | A, Au | `RecipeReadDeps` | `{ filter? }` | `readonly Recipe[]` | — | — |

Notas:

- `UpdateLocation` **solo renombra**; `kind` no es modificable.
- `CreateMachine`/`MoveMachine` validan existencia y `kind` `production` del lugar
  (I2). `Machine.moveTo` también aplica I2.
- Todas las lecturas usan `NotFoundError`.
- Los casos de uso de catálogo escriben con rol `admin` y leen con `admin`/`auditor`.

---

## Asignaciones

| Caso de uso | Roles | Deps | Comando | Devuelve | Errores | Evento |
|---|---|---|---|---|---|---|
| `AssignWorkerToMachine` | A | `AssignmentWriteDeps` | `{ workerId, machineId, slot: TimeSlot }` | `Assignment` | `NotFoundError` (Worker/Machine), `InactiveWorkerError`, `OverlappingScheduleError` (I1) | `worker.assigned` |
| `UnassignWorker` | A | `AssignmentWriteDeps` | `{ assignmentId }` | `void` | `NotFoundError` (Assignment) | `worker.unassigned` |
| `ListWorkerSchedule` | A, Au | `AssignmentReadDeps` | `{ workerId }` | `readonly Assignment[]` | `NotFoundError` (Worker) | — |
| `ListMachineSchedule` | A, Au | `AssignmentReadDeps` | `{ machineId }` | `readonly Assignment[]` | `NotFoundError` (Machine) | — |

`AssignWorkerToMachine` valida, en orden: worker existe → worker activo → máquina existe
→ **I1** (ninguna asignación del mismo worker solapa con `slot`). Las franjas adyacentes
(`end === start`) no solapan. Las agendas validan la existencia del worker/máquina para
no devolver una agenda vacía engañosa.

---

## Producción

| Caso de uso | Roles | Deps | Comando | Devuelve | Errores | Evento |
|---|---|---|---|---|---|---|
| `RegisterSupplyArrival` | A, W | `ProductionTransactionalDeps` | `{ materialId, quantity, locationId }` | `Batch` (`stored`) | `NotFoundError`, `MaterialKindMismatchError`, `InvalidLocationKindError`, `IncompatibleUnitError` | `supply.arrived` |
| `StartProduction` | A | `StartProductionDeps` | `{ recipeId }` | `Batch` (`in_progress`) | `NotFoundError` (Recipe) | `batch.created` |
| `RecordTransformation` | W | `ProductionTransactionalDeps` | `RecordTransformationCommand` | `BatchEvent` | ver detalle | `batch.transformed` |
| `StoreBatch` | A, W | `ProductionTransactionalDeps` | `{ batchId, locationId }` | `Batch` (`stored`) | `NotFoundError`, `InvalidStateTransitionError`, `InvalidLocationKindError` | `batch.stored` |
| `CompleteProduction` | A, W | `BatchWriteDeps` | `{ batchId }` | `Batch` (`completed`) | `NotFoundError`, `NotAProductionOrderError`, `InvalidStateTransitionError` | `production.completed` |

### `RecordTransformation` (detalle)

```ts
interface RecordTransformationCommand {
  readonly machineId: MachineId;
  readonly workerId: WorkerId;
  readonly recipeStepId?: RecipeStepId;
  readonly inputs: readonly TransformationInput[];  // { batchId, quantity }
  readonly outputs: readonly TransformationOutput[]; // { materialId, quantity }
  readonly observation?: string;
  readonly timestamp?: Date;
}
```

Validaciones, en orden: rol `worker`; el comando declara al menos un input u output y no
repite un `batchId` entre inputs → `InvalidTransformationError`; el worker existe y está
activo (`InactiveWorkerError`) y `actor.workerId === command.workerId` (si no,
`UnauthorizedRoleError`); la máquina existe y no está en `maintenance`
(`InactiveMachineError`); **I3**: hay una asignación del worker a esa máquina cuya franja
contiene el `timestamp` (`WorkerNotAssignedError`); cada lote de input existe
(`NotFoundError`); cada material de output existe y usa su unidad (**I6**,
`IncompatibleUnitError`).

Efectos transaccionales (vía `UnitOfWork`): crea el `BatchEvent`; un `StockMovement`
`consumed` (delta negativo, con `batchEventId`) por input en el lugar de la máquina; y un
`Batch` `in_progress` con `originBatchEventId` por output. Emite `batch.transformed` tras
el commit.

Los chequeos puros del comando (vacío / input duplicado) corren **antes** de abrir la
unidad de trabajo.

### `RegisterSupplyArrival` (detalle)

Valida que el material exista y sea `supply` (`MaterialKindMismatchError`), que el lugar
exista y sea `storage` (`InvalidLocationKindError`) y que la cantidad use la unidad del
material (I6, `IncompatibleUnitError`). Crea el `Batch` **ya en `stored`** y un
`StockMovement` `supply_in` con delta `+quantity`. Emite `supply.arrived` tras el commit.

### `StoreBatch` (detalle)

El estado se valida en la entidad (`store()` lanza `InvalidStateTransitionError` si el
lote ya está `stored`/`completed`); el lugar debe ser `storage`. El `reason` del
movimiento de entrada depende del origen: si el lote tiene `originBatchEventId` es
`produced` (vinculado a ese evento); si no, es `transfer_in` (porque `produced` exige
`batchEventId`).

### `CompleteProduction` (detalle)

Marca un lote como `completed`. Como el evento `production.completed` exige `recipeId`,
solo se pueden completar lotes que pertenecen a una receta. La comprobación de que el
lote es una orden corre **antes** de `complete()`: un lote sin `recipeId` lanza
`NotAProductionOrderError` y no transiciona.

---

## Trazabilidad y consulta

| Caso de uso | Roles | Deps | Comando | Devuelve | Errores | Evento |
|---|---|---|---|---|---|---|
| `TraceBatch` | A, Au | `TraceabilityReadDeps` | `{ batchId }` | `BatchTraceNode` | `NotFoundError` (Batch) | — |
| `TraceForward` | A, Au | `TraceabilityReadDeps` | `{ batchId }` | `BatchForwardNode` | `NotFoundError` (Batch) | — |
| `GetStockByLocation` | A, Au, **W** | `StockByLocationDeps` | `{ locationId }` | `readonly StockByLocationEntry[]` | `NotFoundError` (Location/Material) | — |
| `GetStockMovements` | A, Au | `StockMovementsDeps` | `{ locationId, materialId? }` | `readonly StockMovement[]` | `NotFoundError` (Location) | — |
| `ListBatchEvents` | A, Au | `BatchEventQueryDeps` | `BatchEventFilter` | `readonly BatchEvent[]` | — | — |

Son **lecturas puras**: no escriben ni emiten eventos. Todos los listados devuelven el
orden cronológico ascendente por `timestamp`.

### DTOs

```ts
interface BatchTraceNode {  // genealogía hacia atrás
  readonly batch: Batch;
  readonly event?: BatchEvent; // la transformación que lo originó (ausente en hojas)
  readonly children: readonly BatchTraceNode[];
  readonly cycleDetected?: boolean;
}

interface BatchForwardNode { // genealogía hacia adelante (recall)
  readonly batch?: Batch;
  readonly event?: BatchEvent;
  readonly children: readonly BatchForwardNode[];
  readonly cycleDetected?: boolean;
}

interface StockByLocationEntry {
  readonly materialId: MaterialId;
  readonly amount: number;
  readonly unit: UnitOfMeasure;
}
```

### Comportamiento destacado

- **`TraceBatch`**: sigue `originBatchEventId` hacia atrás. Cada nodo es un lote y el
  `event` es la transformación que lo produjo; las hojas (suministros/raíces) no tienen
  evento. Referencias de input colgantes se ignoran; ante un ciclo en datos corruptos, la
  rama se corta con `cycleDetected: true`.
- **`TraceForward`**: usa `listByInputBatchId` + `list({ originBatchEventId })`. Un nodo
  de lote lleva `batch`; un nodo de evento lleva `event` y cuelga de un lote. Mismo guard
  de ciclos.
- **`GetStockByLocation`**: agrega deltas por material conservando el orden de primera
  aparición; **omite** los materiales con delta neto `0`; toma la **unidad del material**
  (no del movimiento). Un movimiento que referencia un material inexistente lanza
  `NotFoundError` (dato corrupto).
