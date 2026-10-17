import type { FactoryProvider } from '@nestjs/common';
import {
  AssignWorkerToMachine,
  CompleteProduction,
  CreateLocation,
  CreateMachine,
  CreateMaterial,
  CreateRecipe,
  CreateWorker,
  DeactivateMaterial,
  DeactivateWorker,
  GetLocation,
  GetMachine,
  GetMaterial,
  GetRecipe,
  GetStockByLocation,
  GetStockMovements,
  GetWorker,
  ListBatchEvents,
  ListLocations,
  ListMachineSchedule,
  ListMachines,
  ListMaterials,
  ListRecipes,
  ListWorkerSchedule,
  ListWorkers,
  MoveMachine,
  RecordTransformation,
  RegisterSupplyArrival,
  StartProduction,
  StoreBatch,
  TraceBatch,
  TraceForward,
  UnassignWorker,
  UpdateLocation,
  UpdateMachine,
  UpdateMaterial,
  UpdateRecipe,
  UpdateWorker,
  type AssignmentRepository,
  type BatchEventRepository,
  type BatchRepository,
  type EventBus,
  type LocationRepository,
  type MachineRepository,
  type MaterialRepository,
  type RecipeRepository,
  type StockMovementRepository,
  type UnitOfWork,
  type WorkerRepository,
} from '@fabrik/domain';

import {
  ASSIGNMENT_REPOSITORY,
  BATCH_EVENT_REPOSITORY,
  BATCH_REPOSITORY,
  EVENT_BUS,
  LOCATION_REPOSITORY,
  MACHINE_REPOSITORY,
  MATERIAL_REPOSITORY,
  RECIPE_REPOSITORY,
  STOCK_MOVEMENT_REPOSITORY,
  UNIT_OF_WORK,
  WORKER_REPOSITORY,
} from './tokens.js';

// Wiring de los 37 casos de uso del dominio (Fase 2, docs/09).
//
// Patrón: **un factory provider por caso de uso**. Cada entrada construye la
// clase con las dependencias que declara su constructor (`{ puertos, events }`)
// resolviéndolas por token de DI. Se prefirió esto a un registrador genérico
// (reflexión sobre `design:paramtypes`) porque los constructores reciben
// *interfaces* —borradas en runtime—, así que el grafo ha de ser explícito. Con
// el factory, el token del use case es la propia clase: se inyecta con
// `constructor(private readonly createMaterial: CreateMaterial)` o
// `@Inject(CreateMaterial)`.
//
// Mantener el orden y agrupar por fichero del dominio facilita revisar que todos
// los casos de uso del barrel están cableados (lo verifica un test).

// --- Catálogos: materiales ---

export const materialUseCaseProviders: FactoryProvider[] = [
  {
    provide: CreateMaterial,
    useFactory: (materials: MaterialRepository, events: EventBus) =>
      new CreateMaterial({ materials, events }),
    inject: [MATERIAL_REPOSITORY, EVENT_BUS],
  },
  {
    provide: UpdateMaterial,
    useFactory: (materials: MaterialRepository, events: EventBus) =>
      new UpdateMaterial({ materials, events }),
    inject: [MATERIAL_REPOSITORY, EVENT_BUS],
  },
  {
    provide: DeactivateMaterial,
    useFactory: (materials: MaterialRepository, events: EventBus) =>
      new DeactivateMaterial({ materials, events }),
    inject: [MATERIAL_REPOSITORY, EVENT_BUS],
  },
  {
    provide: GetMaterial,
    useFactory: (materials: MaterialRepository) => new GetMaterial({ materials }),
    inject: [MATERIAL_REPOSITORY],
  },
  {
    provide: ListMaterials,
    useFactory: (materials: MaterialRepository) => new ListMaterials({ materials }),
    inject: [MATERIAL_REPOSITORY],
  },
];

// --- Catálogos: lugares ---

export const locationUseCaseProviders: FactoryProvider[] = [
  {
    provide: CreateLocation,
    useFactory: (locations: LocationRepository) => new CreateLocation({ locations }),
    inject: [LOCATION_REPOSITORY],
  },
  {
    provide: UpdateLocation,
    useFactory: (locations: LocationRepository) => new UpdateLocation({ locations }),
    inject: [LOCATION_REPOSITORY],
  },
  {
    provide: GetLocation,
    useFactory: (locations: LocationRepository) => new GetLocation({ locations }),
    inject: [LOCATION_REPOSITORY],
  },
  {
    provide: ListLocations,
    useFactory: (locations: LocationRepository) => new ListLocations({ locations }),
    inject: [LOCATION_REPOSITORY],
  },
];

// --- Catálogos: máquinas ---

export const machineUseCaseProviders: FactoryProvider[] = [
  {
    provide: CreateMachine,
    useFactory: (machines: MachineRepository, locations: LocationRepository, events: EventBus) =>
      new CreateMachine({ machines, locations, events }),
    inject: [MACHINE_REPOSITORY, LOCATION_REPOSITORY, EVENT_BUS],
  },
  {
    provide: UpdateMachine,
    useFactory: (machines: MachineRepository) => new UpdateMachine({ machines }),
    inject: [MACHINE_REPOSITORY],
  },
  {
    provide: MoveMachine,
    useFactory: (machines: MachineRepository, locations: LocationRepository, events: EventBus) =>
      new MoveMachine({ machines, locations, events }),
    inject: [MACHINE_REPOSITORY, LOCATION_REPOSITORY, EVENT_BUS],
  },
  {
    provide: GetMachine,
    useFactory: (machines: MachineRepository) => new GetMachine({ machines }),
    inject: [MACHINE_REPOSITORY],
  },
  {
    provide: ListMachines,
    useFactory: (machines: MachineRepository) => new ListMachines({ machines }),
    inject: [MACHINE_REPOSITORY],
  },
];

// --- Catálogos: trabajadores ---

export const workerUseCaseProviders: FactoryProvider[] = [
  {
    provide: CreateWorker,
    useFactory: (workers: WorkerRepository) => new CreateWorker({ workers }),
    inject: [WORKER_REPOSITORY],
  },
  {
    provide: UpdateWorker,
    useFactory: (workers: WorkerRepository) => new UpdateWorker({ workers }),
    inject: [WORKER_REPOSITORY],
  },
  {
    provide: DeactivateWorker,
    useFactory: (workers: WorkerRepository) => new DeactivateWorker({ workers }),
    inject: [WORKER_REPOSITORY],
  },
  {
    provide: GetWorker,
    useFactory: (workers: WorkerRepository) => new GetWorker({ workers }),
    inject: [WORKER_REPOSITORY],
  },
  {
    provide: ListWorkers,
    useFactory: (workers: WorkerRepository) => new ListWorkers({ workers }),
    inject: [WORKER_REPOSITORY],
  },
];

// --- Catálogos: recetas ---

export const recipeUseCaseProviders: FactoryProvider[] = [
  {
    provide: CreateRecipe,
    useFactory: (recipes: RecipeRepository) => new CreateRecipe({ recipes }),
    inject: [RECIPE_REPOSITORY],
  },
  {
    provide: UpdateRecipe,
    useFactory: (recipes: RecipeRepository) => new UpdateRecipe({ recipes }),
    inject: [RECIPE_REPOSITORY],
  },
  {
    provide: GetRecipe,
    useFactory: (recipes: RecipeRepository) => new GetRecipe({ recipes }),
    inject: [RECIPE_REPOSITORY],
  },
  {
    provide: ListRecipes,
    useFactory: (recipes: RecipeRepository) => new ListRecipes({ recipes }),
    inject: [RECIPE_REPOSITORY],
  },
];

// --- Asignaciones ---

export const assignmentUseCaseProviders: FactoryProvider[] = [
  {
    provide: AssignWorkerToMachine,
    useFactory: (
      assignments: AssignmentRepository,
      workers: WorkerRepository,
      machines: MachineRepository,
      events: EventBus,
    ) => new AssignWorkerToMachine({ assignments, workers, machines, events }),
    inject: [ASSIGNMENT_REPOSITORY, WORKER_REPOSITORY, MACHINE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: UnassignWorker,
    useFactory: (
      assignments: AssignmentRepository,
      workers: WorkerRepository,
      machines: MachineRepository,
      events: EventBus,
    ) => new UnassignWorker({ assignments, workers, machines, events }),
    inject: [ASSIGNMENT_REPOSITORY, WORKER_REPOSITORY, MACHINE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: ListWorkerSchedule,
    useFactory: (
      assignments: AssignmentRepository,
      workers: WorkerRepository,
      machines: MachineRepository,
    ) => new ListWorkerSchedule({ assignments, workers, machines }),
    inject: [ASSIGNMENT_REPOSITORY, WORKER_REPOSITORY, MACHINE_REPOSITORY],
  },
  {
    provide: ListMachineSchedule,
    useFactory: (
      assignments: AssignmentRepository,
      workers: WorkerRepository,
      machines: MachineRepository,
    ) => new ListMachineSchedule({ assignments, workers, machines }),
    inject: [ASSIGNMENT_REPOSITORY, WORKER_REPOSITORY, MACHINE_REPOSITORY],
  },
];

// --- Producción e inventario ---

export const productionUseCaseProviders: FactoryProvider[] = [
  {
    provide: RegisterSupplyArrival,
    useFactory: (unitOfWork: UnitOfWork, events: EventBus) =>
      new RegisterSupplyArrival({ unitOfWork, events }),
    inject: [UNIT_OF_WORK, EVENT_BUS],
  },
  {
    provide: StartProduction,
    useFactory: (batches: BatchRepository, recipes: RecipeRepository, events: EventBus) =>
      new StartProduction({ batches, recipes, events }),
    inject: [BATCH_REPOSITORY, RECIPE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: RecordTransformation,
    useFactory: (unitOfWork: UnitOfWork, events: EventBus) =>
      new RecordTransformation({ unitOfWork, events }),
    inject: [UNIT_OF_WORK, EVENT_BUS],
  },
  {
    provide: StoreBatch,
    useFactory: (unitOfWork: UnitOfWork, events: EventBus) => new StoreBatch({ unitOfWork, events }),
    inject: [UNIT_OF_WORK, EVENT_BUS],
  },
  {
    provide: CompleteProduction,
    useFactory: (batches: BatchRepository, events: EventBus) =>
      new CompleteProduction({ batches, events }),
    inject: [BATCH_REPOSITORY, EVENT_BUS],
  },
];

// --- Trazabilidad y stock ---

export const traceabilityUseCaseProviders: FactoryProvider[] = [
  {
    provide: TraceBatch,
    useFactory: (batches: BatchRepository, batchEvents: BatchEventRepository) =>
      new TraceBatch({ batches, batchEvents }),
    inject: [BATCH_REPOSITORY, BATCH_EVENT_REPOSITORY],
  },
  {
    provide: TraceForward,
    useFactory: (batches: BatchRepository, batchEvents: BatchEventRepository) =>
      new TraceForward({ batches, batchEvents }),
    inject: [BATCH_REPOSITORY, BATCH_EVENT_REPOSITORY],
  },
  {
    provide: GetStockByLocation,
    useFactory: (
      locations: LocationRepository,
      materials: MaterialRepository,
      stockMovements: StockMovementRepository,
    ) => new GetStockByLocation({ locations, materials, stockMovements }),
    inject: [LOCATION_REPOSITORY, MATERIAL_REPOSITORY, STOCK_MOVEMENT_REPOSITORY],
  },
  {
    provide: GetStockMovements,
    useFactory: (locations: LocationRepository, stockMovements: StockMovementRepository) =>
      new GetStockMovements({ locations, stockMovements }),
    inject: [LOCATION_REPOSITORY, STOCK_MOVEMENT_REPOSITORY],
  },
  {
    provide: ListBatchEvents,
    useFactory: (batchEvents: BatchEventRepository) => new ListBatchEvents({ batchEvents }),
    inject: [BATCH_EVENT_REPOSITORY],
  },
];

/** Todos los factories de casos de uso, agrupados por fichero del dominio. */
export const useCaseProviders: FactoryProvider[] = [
  ...materialUseCaseProviders,
  ...locationUseCaseProviders,
  ...machineUseCaseProviders,
  ...workerUseCaseProviders,
  ...recipeUseCaseProviders,
  ...assignmentUseCaseProviders,
  ...productionUseCaseProviders,
  ...traceabilityUseCaseProviders,
];

/** Tokens (las propias clases) de todos los casos de uso cableados. */
export const useCaseTokens = useCaseProviders.map((provider) => provider.provide);
