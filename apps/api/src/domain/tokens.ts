// Tokens de inyección de Nest (Fase 2). Los puertos del dominio son interfaces
// TypeScript: no existen en runtime, así que no pueden usarse como token de DI.
// La API define aquí un `symbol` por puerto y lo usa tanto en los providers
// (`provide`/`inject`) como en los tests. Es el único "contrato de nombres" entre
// la capa de wiring y los adaptadores.

/** Conexión Drizzle/Turso compartida (se abre una vez y se inyecta en los adaptadores). */
export const DB = Symbol('FABRIK_DB');

/** Bus de eventos de dominio (`EventBus`). */
export const EVENT_BUS = Symbol('FABRIK_EVENT_BUS');

/** Frontera transaccional (`UnitOfWork`). */
export const UNIT_OF_WORK = Symbol('FABRIK_UNIT_OF_WORK');

// --- Puertos de repositorio (9) ---

export const MATERIAL_REPOSITORY = Symbol('MaterialRepository');
export const MACHINE_REPOSITORY = Symbol('MachineRepository');
export const WORKER_REPOSITORY = Symbol('WorkerRepository');
export const LOCATION_REPOSITORY = Symbol('LocationRepository');
export const RECIPE_REPOSITORY = Symbol('RecipeRepository');
export const BATCH_REPOSITORY = Symbol('BatchRepository');
export const BATCH_EVENT_REPOSITORY = Symbol('BatchEventRepository');
export const ASSIGNMENT_REPOSITORY = Symbol('AssignmentRepository');
export const STOCK_MOVEMENT_REPOSITORY = Symbol('StockMovementRepository');

/** Tokens de los puertos, en el mismo orden que `Repositories` del dominio. */
export const REPOSITORY_TOKENS = {
  materials: MATERIAL_REPOSITORY,
  machines: MACHINE_REPOSITORY,
  workers: WORKER_REPOSITORY,
  locations: LOCATION_REPOSITORY,
  recipes: RECIPE_REPOSITORY,
  batches: BATCH_REPOSITORY,
  batchEvents: BATCH_EVENT_REPOSITORY,
  assignments: ASSIGNMENT_REPOSITORY,
  stockMovements: STOCK_MOVEMENT_REPOSITORY,
} as const;

/** Lista plana de tokens de repositorio (útil para exportar/reimportar). */
export const REPOSITORY_TOKEN_LIST: readonly symbol[] = Object.values(REPOSITORY_TOKENS);
