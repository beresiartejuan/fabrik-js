# Referencia — Puertos

Interfaces que el dominio **define** y la infraestructura (`apps/api` con Drizzle +
Turso) **implementa**. Viven en `src/ports/`. El dominio nunca conoce las
implementaciones.

> Justificación del diseño de `UnitOfWork` y de la inmutabilidad: ver
> [explicacion/arquitectura-y-reglas.md](../explicacion/arquitectura-y-reglas.md) y
> [explicacion/decisiones-y-limitaciones.md](../explicacion/decisiones-y-limitaciones.md).

## Convenciones

- `findById(id)` devuelve `T | null` (nunca lanza si no existe; el `NotFoundError` lo
  produce la capa de casos de uso).
- `save(entity)` es **upsert por `id`**: inserta si no existe, reemplaza si ya existe.
- Los repositorios de `BatchEvent` y `StockMovement` son **append-only**: solo exponen
  `add` (no `save`/`delete`), para preservar I4.
- Cada repositorio tiene un filtro explícito y pequeño para `list`; los campos son
  opcionales y "ausente = sin restricción".

## Repositorios (9)

### `MaterialRepository` — `material-repository.ts`

```ts
interface MaterialFilter {
  readonly kind?: MaterialKind;
  readonly physicalState?: PhysicalState;
}

interface MaterialRepository {
  findById(id: MaterialId): Promise<Material | null>;
  list(filter?: MaterialFilter): Promise<readonly Material[]>;
  save(material: Material): Promise<void>;
  existsByName?(name: string): Promise<boolean>; // opcional
}
```

`existsByName` es opcional: los adaptadores que no lo soporten pueden omitirlo.

### `LocationRepository` — `location-repository.ts`

```ts
interface LocationFilter { readonly kind?: LocationKind; }

interface LocationRepository {
  findById(id: LocationId): Promise<Location | null>;
  list(filter?: LocationFilter): Promise<readonly Location[]>;
  save(location: Location): Promise<void>;
}
```

### `MachineRepository` — `machine-repository.ts`

```ts
interface MachineFilter {
  readonly locationId?: LocationId;
  readonly status?: MachineStatus;
  readonly type?: MachineType;
}

interface MachineRepository {
  findById(id: MachineId): Promise<Machine | null>;
  list(filter?: MachineFilter): Promise<readonly Machine[]>;
  save(machine: Machine): Promise<void>;
}
```

### `WorkerRepository` — `worker-repository.ts`

```ts
interface WorkerFilter {
  readonly role?: WorkerRole;
  readonly active?: boolean;
}

interface WorkerRepository {
  findById(id: WorkerId): Promise<Worker | null>;
  list(filter?: WorkerFilter): Promise<readonly Worker[]>;
  save(worker: Worker): Promise<void>;
}
```

### `RecipeRepository` — `recipe-repository.ts`

```ts
interface RecipeFilter { readonly outputProductId?: MaterialId; }

interface RecipeRepository {
  findById(id: RecipeId): Promise<Recipe | null>;
  list(filter?: RecipeFilter): Promise<readonly Recipe[]>;
  save(recipe: Recipe): Promise<void>;
}
```

### `BatchRepository` — `batch-repository.ts`

```ts
interface BatchFilter {
  readonly materialId?: MaterialId;
  readonly status?: BatchStatus;
  readonly recipeId?: RecipeId;
  readonly originBatchEventId?: BatchEventId; // trazabilidad hacia adelante / recall
}

interface BatchRepository {
  findById(id: BatchId): Promise<Batch | null>;
  findByMaterial?(materialId: MaterialId): Promise<readonly Batch[]>; // atajo de list({ materialId })
  list(filter?: BatchFilter): Promise<readonly Batch[]>;
  save(batch: Batch): Promise<void>;
}
```

### `BatchEventRepository` — `batch-event-repository.ts` (append-only)

```ts
interface DateRange {
  readonly from?: Date;
  readonly to?: Date; // rango inclusivo [from, to]
}

interface BatchEventFilter {
  readonly machineId?: MachineId;
  readonly workerId?: WorkerId;
  readonly materialId?: MaterialId; // match si el material aparece en inputs O outputs
  readonly dateRange?: DateRange;
}

interface BatchEventRepository {
  add(event: BatchEvent): Promise<void>; // idempotente por id (re-add reemplaza)
  findById(id: BatchEventId): Promise<BatchEvent | null>;
  listBy(filters?: BatchEventFilter): Promise<readonly BatchEvent[]>;
  listByInputBatchId(batchId: BatchId): Promise<readonly BatchEvent[]>; // eventos cuyos inputs referencian el batch
}
```

### `AssignmentRepository` — `assignment-repository.ts`

```ts
interface AssignmentRepository {
  findById(id: AssignmentId): Promise<Assignment | null>;
  findByWorker(workerId: WorkerId): Promise<readonly Assignment[]>;
  findByMachine(machineId: MachineId): Promise<readonly Assignment[]>;
  save(assignment: Assignment): Promise<void>;
  delete(id: AssignmentId): Promise<void>;
}
```

`findByWorker` es la consulta que valida I1 (solapamiento); `findByMachine` arma la
agenda de una máquina. Es el único repositorio con `delete`.

### `StockMovementRepository` — `stock-movement-repository.ts` (append-only)

```ts
interface StockMovementRepository {
  add(movement: StockMovement): Promise<void>; // idempotente por id
  listByLocation(locationId: LocationId, materialId?: MaterialId): Promise<readonly StockMovement[]>;
  sumByLocationAndMaterial(locationId: LocationId, materialId: MaterialId): Promise<StockDelta | null>;
}
```

`sumByLocationAndMaterial` devuelve la suma firmada de los deltas de un lugar +
material, o **`null`** si no hay movimientos: la unidad solo puede inferirse de los
movimientos, y `StockDelta` exige una unidad. (El caso de uso `GetStockByLocation`
prefiere agregar en memoria y tomar la unidad del `Material`.)

## Transacciones

### `Repositories` y `UnitOfWork` — `unit-of-work.ts`

```ts
interface Repositories {
  readonly materials: MaterialRepository;
  readonly machines: MachineRepository;
  readonly workers: WorkerRepository;
  readonly locations: LocationRepository;
  readonly recipes: RecipeRepository;
  readonly batches: BatchRepository;
  readonly batchEvents: BatchEventRepository;
  readonly assignments: AssignmentRepository;
  readonly stockMovements: StockMovementRepository;
}

interface UnitOfWork {
  run<T>(fn: (repositories: Repositories) => Promise<T>): Promise<T>;
}
```

Semántica: `run` entrega a `fn` un `Repositories` ligado a una transacción abierta. Si
`fn` resuelve, la transacción se confirma (**commit**); si lanza, se revierte
(**rollback**). Los casos de uso transaccionales publican sus eventos **después** del
commit. El adaptador de `apps/api` implementa `run` sobre la conexión Drizzle.

## Herramientas de test (privadas)

`src/testing/` contiene fakes in-memory de los 9 repositorios, `InMemoryUnitOfWork`,
`inMemoryRepositories()` y `collectingEventBus()`. **No** se re-exportan desde el barrel
público y no son parte del contrato estable.
