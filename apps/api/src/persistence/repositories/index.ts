import type { Repositories } from '@fabrik/domain';

import type { Executor } from '../executor.js';

import { DrizzleAssignmentRepository } from './drizzle-assignment.repository.js';
import { DrizzleBatchRepository } from './drizzle-batch.repository.js';
import { DrizzleBatchEventRepository } from './drizzle-batch-event.repository.js';
import { DrizzleLocationRepository } from './drizzle-location.repository.js';
import { DrizzleMachineRepository } from './drizzle-machine.repository.js';
import { DrizzleMaterialRepository } from './drizzle-material.repository.js';
import { DrizzleRecipeRepository } from './drizzle-recipe.repository.js';
import { DrizzleStockMovementRepository } from './drizzle-stock-movement.repository.js';
import { DrizzleWorkerRepository } from './drizzle-worker.repository.js';

export { DrizzleAssignmentRepository } from './drizzle-assignment.repository.js';
export { DrizzleBatchRepository } from './drizzle-batch.repository.js';
export { DrizzleBatchEventRepository } from './drizzle-batch-event.repository.js';
export { DrizzleLocationRepository } from './drizzle-location.repository.js';
export { DrizzleMachineRepository } from './drizzle-machine.repository.js';
export { DrizzleMaterialRepository } from './drizzle-material.repository.js';
export { DrizzleRecipeRepository } from './drizzle-recipe.repository.js';
export { DrizzleStockMovementRepository } from './drizzle-stock-movement.repository.js';
export { DrizzleWorkerRepository } from './drizzle-worker.repository.js';

/**
 * Construye el agregado `Repositories` ligado a un `Executor` (la conexión o un
 * `tx` dentro del `UnitOfWork`). Es el único punto que conoce las clases concretas.
 */
export function createRepositories(db: Executor): Repositories {
  return {
    materials: new DrizzleMaterialRepository(db),
    machines: new DrizzleMachineRepository(db),
    workers: new DrizzleWorkerRepository(db),
    locations: new DrizzleLocationRepository(db),
    recipes: new DrizzleRecipeRepository(db),
    batches: new DrizzleBatchRepository(db),
    batchEvents: new DrizzleBatchEventRepository(db),
    assignments: new DrizzleAssignmentRepository(db),
    stockMovements: new DrizzleStockMovementRepository(db),
  };
}
