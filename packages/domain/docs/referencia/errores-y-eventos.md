# Referencia — Errores y Eventos

Catálogos de `src/errors/` y `src/events/`. Ambos se re-exportan desde el barrel público.

## Errores de dominio

Todos heredan de `DomainError` y fijan su propio `name`.

```ts
class DomainError extends Error {
  constructor(message: string); // name = 'DomainError'
}
```

### Catálogo

| Clase | Constructor | Contexto tipado | Lanzado por (resumen) |
|---|---|---|---|
| `NotFoundError` | `(entity: string, id: string)` | `entity`, `id` | Lecturas y casos transaccionales cuando falta la entidad |
| `OverlappingScheduleError` | `(workerId: WorkerId, conflictingAssignmentId: AssignmentId)` | `workerId`, `conflictingAssignmentId` | `AssignWorkerToMachine` (I1) |
| `InsufficientStockError` | `(materialId: MaterialId, requested: Quantity, available: Quantity)` | `materialId`, `requested`, `available` | Definido para I5; **aún no se lanza** (I5 diferido) |
| `WorkerNotAssignedError` | `(workerId: WorkerId, machineId: MachineId, at?: Date)` | `workerId`, `machineId`, `at?` | `RecordTransformation` (I3) |
| `InactiveMachineError` | `(machineId: MachineId, status: 'idle' \| 'running' \| 'maintenance')` | `machineId`, `status` | `RecordTransformation` (máquina en `maintenance`) |
| `InactiveWorkerError` | `(workerId: WorkerId)` | `workerId` | `AssignWorkerToMachine`, `RecordTransformation` |
| `RecipeIntegrityError` | `(recipeId: RecipeId, reason: string)` | `recipeId`, `reason` | Construcción de `Recipe` (I7 y posiciones) |
| `UnauthorizedRoleError` | `(role: WorkerRole, useCase: string)` | `role`, `useCase` | `requireRole` y `RecordTransformation` (actor ≠ workerId) |
| `IncompatibleUnitError` | `(expected: UnitOfMeasure, received: UnitOfMeasure, materialId?: MaterialId, physicalState?: PhysicalState)` | `expected`, `received`, `materialId?`, `physicalState?` | `Material.build` (I6), `RegisterSupplyArrival`, `RecordTransformation` |
| `InvalidLocationKindError` | `(kind: string, locationId?: LocationId, expected?: string)` | `kind`, `locationId?`, `expected?` | `Machine.moveTo` (I2), `CreateMachine`, `MoveMachine`, `RegisterSupplyArrival`, `StoreBatch` |
| `InvalidObservationError` | `(length: number, maxLength?: number)` | `length`, `maxLength` | Normalización de `BatchEvent.observation` |
| `InvalidStateTransitionError` | `(entity: string, from: string, to: string)` | `entity`, `from`, `to` | `Machine`, `Batch` |
| `InvalidStockMovementError` | `(reason: string, detail: string)` | `reason` | Construcción de `StockMovement` |
| `InvalidQuantityError` | `(message: string)` | — | `Quantity` (monto o unidades) |
| `InvalidTimeSlotError` | `(message: string)` | — | `TimeSlot.create` |
| `MaterialKindMismatchError` | `(materialId: MaterialId, expected: MaterialKind, received: MaterialKind)` | `materialId`, `expected`, `received` | `RegisterSupplyArrival` (exige `supply`) |
| `InvalidTransformationError` | `(reason: 'empty' \| 'duplicate-input', detail: string, batchId?: BatchId)` | `reason`, `batchId?` | `RecordTransformation` (comando vacío o input duplicado) |
| `NotAProductionOrderError` | `(batchId: BatchId)` | `batchId` | `CompleteProduction` (lote sin `recipeId`) |

Constante exportada:

```ts
const MAX_OBSERVATION_LENGTH = 500; // src/errors/invalid-observation-error.ts
```

`IncompatibleUnitError` tiene doble mensaje: cuando se provee `physicalState` describe
unidad incompatible con el estado físico; sin él, describe el par esperado/recibido.

## Eventos de dominio

### Contrato base (`domain-event.ts`)

```ts
interface DomainEventBase<Name extends string = string, Payload extends object = Record<string, unknown>> {
  readonly name: Name;
  readonly occurredAt: Date;
  readonly payload: Payload;
}

function createDomainEvent<Name extends string, Payload extends object>(
  name: Name,
  payload: Payload,
  occurredAt?: Date, // default: ahora
): DomainEventBase<Name, Payload>;
```

`createDomainEvent` sella el nombre, fija `occurredAt` y **congela el payload**
(`Object.freeze`). `DomainEvent` es la unión discriminada por `name` de todo el
catálogo, y `DomainEventName = DomainEvent['name']`.

### Bus (`event-bus.ts`)

```ts
interface EventBus {
  publish(event: DomainEvent): void | Promise<void>;
}
```

### Catálogo

| `name` | Interfaz | Payload | Fábrica | Emitido por |
|---|---|---|---|---|
| `material.created` | `MaterialCreated` | `{ materialId }` | `materialCreated` | `CreateMaterial` |
| `material.updated` | `MaterialUpdated` | `{ materialId }` | `materialUpdated` | `UpdateMaterial`, `DeactivateMaterial` (solo si cambia) |
| `machine.created` | `MachineCreated` | `{ machineId, locationId }` | `machineCreated` | `CreateMachine` |
| `machine.moved` | `MachineMoved` | `{ machineId, locationId }` | `machineMoved` | `MoveMachine` |
| `worker.assigned` | `WorkerAssigned` | `{ assignmentId, workerId, machineId, slot: TimeSlot }` | `workerAssigned` | `AssignWorkerToMachine` |
| `worker.unassigned` | `WorkerUnassigned` | `{ assignmentId }` | `workerUnassigned` | `UnassignWorker` |
| `supply.arrived` | `SupplyArrived` | `{ batchId, materialId, quantity, locationId }` | `supplyArrived` | `RegisterSupplyArrival` |
| `batch.created` | `BatchCreated` | `{ batchId, recipeId }` | `batchCreated` | `StartProduction` |
| `batch.transformed` | `BatchTransformed` | `{ eventId, machineId, workerId, inputs: BatchQuantitySummary[], outputs: BatchQuantitySummary[], observation? }` | `batchTransformed` | `RecordTransformation` |
| `batch.stored` | `BatchStored` | `{ batchId, locationId }` | `batchStored` | `StoreBatch` |
| `production.completed` | `ProductionCompleted` | `{ batchId, recipeId }` | `productionCompleted` | `CompleteProduction` |
| `stock.moved` | `StockMoved` | `{ movementId, locationId, materialId, delta: StockDelta, batchEventId? }` | `stockMoved` | **Ninguno todavía** (ver abajo) |

Todas las fábricas comparten la firma `(payload, occurredAt?: Date) => Event`.

`BatchQuantitySummary` (en el payload de `batch.transformed`) es
`{ batchId: BatchId; materialId: MaterialId; quantity: Quantity }`: a diferencia de
`BatchQuantity` (entidad), `batchId` es **requerido**, porque el evento se emite después
de crear los lotes de output.

### Nota sobre `stock.moved`

La interfaz, el payload y la fábrica `stockMoved` existen y se exportan, pero **ningún
caso de uso lo emite** en esta fase: los eventos publicados son los enumerados por caso
de uso. Es una de las deferencias documentadas en
[explicacion/decisiones-y-limitaciones.md](../explicacion/decisiones-y-limitaciones.md).
