import type { AssignmentRepository } from './assignment-repository.js';
import type { BatchEventRepository } from './batch-event-repository.js';
import type { BatchRepository } from './batch-repository.js';
import type { LocationRepository } from './location-repository.js';
import type { MachineRepository } from './machine-repository.js';
import type { MaterialRepository } from './material-repository.js';
import type { RecipeRepository } from './recipe-repository.js';
import type { StockMovementRepository } from './stock-movement-repository.js';
import type { WorkerRepository } from './worker-repository.js';

/**
 * Agregado de repositorios que participan de una misma unidad de trabajo.
 * Los nombres son plurales cortos para inyectarlos cómodamente en los use cases.
 */
export interface Repositories {
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

/**
 * Frontera transaccional para operaciones que escriben en varios agregados
 * (docs/04, `RecordTransformation`): evento + movimientos de stock + lotes
 * deben confirmarse o revertirse como un todo.
 *
 * Diseño elegido: **inyección de repositorios**. `run` entrega a `fn` un
 * `Repositories` ligado a una transacción abierta; si `fn` resuelve se confirma
 * (commit) y si lanza se revierte (rollback). Se prefirió este estilo al clásico
 * `begin/commit/rollback` porque no expone el ciclo de vida de la transacción al
 * use case (que solo ve puertos) y evita que un `commit` olvidado deje la unidad
 * abierta. El adaptador de `apps/api` implementa `run` sobre la conexión Drizzle;
 * en tests basta una pasada directa (`InMemoryUnitOfWork`).
 */
export interface UnitOfWork {
  run<T>(fn: (repositories: Repositories) => Promise<T>): Promise<T>;
}
