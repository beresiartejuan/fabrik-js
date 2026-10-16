import type { Repositories } from '../ports';

import { InMemoryAssignmentRepository } from './in-memory-assignment-repository';
import { InMemoryBatchEventRepository } from './in-memory-batch-event-repository';
import { InMemoryBatchRepository } from './in-memory-batch-repository';
import { InMemoryLocationRepository } from './in-memory-location-repository';
import { InMemoryMachineRepository } from './in-memory-machine-repository';
import { InMemoryMaterialRepository } from './in-memory-material-repository';
import { InMemoryRecipeRepository } from './in-memory-recipe-repository';
import { InMemoryStockMovementRepository } from './in-memory-stock-movement-repository';
import { InMemoryWorkerRepository } from './in-memory-worker-repository';

/**
 * Agregado de fakes con tipos concretos: además de satisfacer `Repositories`,
 * expone `clear()` en cada uno para aislar tests.
 */
export interface InMemoryRepositories extends Repositories {
  readonly materials: InMemoryMaterialRepository;
  readonly machines: InMemoryMachineRepository;
  readonly workers: InMemoryWorkerRepository;
  readonly locations: InMemoryLocationRepository;
  readonly recipes: InMemoryRecipeRepository;
  readonly batches: InMemoryBatchRepository;
  readonly batchEvents: InMemoryBatchEventRepository;
  readonly assignments: InMemoryAssignmentRepository;
  readonly stockMovements: InMemoryStockMovementRepository;
}

/** Crea un agregado nuevo de repositorios in-memory (uno por test). */
export function inMemoryRepositories(): InMemoryRepositories {
  return {
    materials: new InMemoryMaterialRepository(),
    machines: new InMemoryMachineRepository(),
    workers: new InMemoryWorkerRepository(),
    locations: new InMemoryLocationRepository(),
    recipes: new InMemoryRecipeRepository(),
    batches: new InMemoryBatchRepository(),
    batchEvents: new InMemoryBatchEventRepository(),
    assignments: new InMemoryAssignmentRepository(),
    stockMovements: new InMemoryStockMovementRepository(),
  };
}
