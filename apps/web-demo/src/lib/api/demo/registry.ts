import type { WorkerRole } from '@fabrik/domain';
import {
  type Actor,
  AssignWorkerToMachine,
  CompleteProduction,
  CreateLocation,
  CreateMachine,
  CreateMaterial,
  CreateRecipe,
  CreateWorker,
  DeactivateMaterial,
  DeactivateWorker,
  type DomainEvent,
  type EventBus,
  GetBatch,
  GetLocation,
  GetMachine,
  GetMaterial,
  GetRecipe,
  GetStockByLocation,
  GetStockMovements,
  GetWorker,
  ListBatchEvents,
  ListBatches,
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
  type Repositories,
  StartProduction,
  StoreBatch,
  TraceBatch,
  TraceForward,
  UnassignWorker,
  type UnitOfWork,
  UpdateLocation,
  UpdateMachine,
  UpdateMaterial,
  UpdateRecipe,
  UpdateWorker,
  WorkerId,
} from '@fabrik/domain';

import type { ActorWire } from '../types';
import { createDemoRepositories, DemoUnitOfWork } from './repos';

/**
 * Registro de dependencias del runtime DEMO: la composición de todos los
 * casos de uso de `@fabrik/domain` sobre los repositorios de `sessionStorage`
 * (`repos.ts`). Espeja los factory providers de
 * `apps/api/src/domain/use-case.providers.ts` — **los 39 casos de uso**, con el
 * mismo grafo de dependencias (repositorios + `EventBus`), agrupados por
 * módulo del dominio con la clase como clave (el API real los inyecta por
 * clase; aquí las instancias ya vienen armadas).
 *
 * - Los adaptadores son *stateless* (leen/escriben `sessionStorage` en cada
 *   llamada), así que un único registro compartido sirve a toda la pestaña.
 * - `clock()` expone el reloj del navegador (el backend real usa el del
 *   servidor). Los use cases toman `new Date()` por defecto, que en el demo
 *   es también el reloj del navegador: los timestamps del histórico quedan
 *   sellados con la hora de la primera carga.
 * - El `EventBus` del demo acumula lo publicado (igual que el
 *   `InMemoryEventBus` de la API) para inspección en tests/debug.
 *
 * Los módulos del demo futuros (`lib/api/modules/*` con runtime DEMO) llaman a
 * cada caso de uso con el `Actor` del dominio resuelto por el auth demo:
 *
 *     const actor = toDomainActor(demoActor);
 *     await registry.production.StartProduction.execute(actor, { recipeId });
 */

/** Bus de eventos in-process del demo (idéntico al de `apps/api` en forma: acumula). */
export class DemoEventBus implements EventBus {
  private readonly events: DomainEvent[] = [];

  /** Eventos publicados en orden de emisión (copia, sin compartir referencias). */
  get published(): readonly DomainEvent[] {
    return [...this.events];
  }

  publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  /** Vacía el histórico de eventos publicados (solo tests/debug). */
  clear(): void {
    this.events.length = 0;
  }
}

/**
 * Actor demo, derived de un usuario autenticado: `userId` es el id del worker
 * (`DemoUserRow.id === workers.id`, misma identidad que la API real). El módulo
 * auth lo compone desde sus respuestas; los módulos del demo lo convierten al
 * `Actor` del dominio con `toDomainActor` antes de `useCase.execute`.
 */
export interface DemoActor {
  readonly userId: string;
  readonly role: WorkerRole;
}

/** Convierte el actor demo al `Actor` del dominio (los ids son strings en runtime). */
export function toDomainActor(actor: DemoActor): Actor {
  return { workerId: WorkerId.from(actor.userId), role: actor.role };
}

/** Deriva el actor demo desde un `ActorWire` (respuesta de `login`/`me`). */
export function demoActorFromWire(wire: ActorWire): DemoActor {
  return { userId: wire.workerId, role: wire.role };
}

/** Reloj del demo: `now` del navegador a cada llamada. */
export function clock(): Date {
  return new Date();
}

// ---------------------------------------------------------------------------
// Catálogo tipado de casos de uso (agrupado como los módulos del API)
// ---------------------------------------------------------------------------

export interface DemoUseCases {
  readonly materials: {
    readonly CreateMaterial: CreateMaterial;
    readonly UpdateMaterial: UpdateMaterial;
    readonly DeactivateMaterial: DeactivateMaterial;
    readonly GetMaterial: GetMaterial;
    readonly ListMaterials: ListMaterials;
  };
  readonly locations: {
    readonly CreateLocation: CreateLocation;
    readonly UpdateLocation: UpdateLocation;
    readonly GetLocation: GetLocation;
    readonly ListLocations: ListLocations;
  };
  readonly machines: {
    readonly CreateMachine: CreateMachine;
    readonly UpdateMachine: UpdateMachine;
    readonly MoveMachine: MoveMachine;
    readonly GetMachine: GetMachine;
    readonly ListMachines: ListMachines;
  };
  readonly workers: {
    readonly CreateWorker: CreateWorker;
    readonly UpdateWorker: UpdateWorker;
    readonly DeactivateWorker: DeactivateWorker;
    readonly GetWorker: GetWorker;
    readonly ListWorkers: ListWorkers;
  };
  readonly recipes: {
    readonly CreateRecipe: CreateRecipe;
    readonly UpdateRecipe: UpdateRecipe;
    readonly GetRecipe: GetRecipe;
    readonly ListRecipes: ListRecipes;
  };
  readonly assignments: {
    readonly AssignWorkerToMachine: AssignWorkerToMachine;
    readonly UnassignWorker: UnassignWorker;
    readonly ListWorkerSchedule: ListWorkerSchedule;
    readonly ListMachineSchedule: ListMachineSchedule;
  };
  readonly production: {
    readonly RegisterSupplyArrival: RegisterSupplyArrival;
    readonly StartProduction: StartProduction;
    readonly RecordTransformation: RecordTransformation;
    readonly StoreBatch: StoreBatch;
    readonly CompleteProduction: CompleteProduction;
  };
  readonly traceability: {
    readonly TraceBatch: TraceBatch;
    readonly TraceForward: TraceForward;
    readonly GetStockByLocation: GetStockByLocation;
    readonly GetStockMovements: GetStockMovements;
    readonly ListBatchEvents: ListBatchEvents;
    readonly GetBatch: GetBatch;
    readonly ListBatches: ListBatches;
  };
}

/** Contexto completo del demo: puertos + unidad de trabajo + bus + casos de uso. */
export interface DemoRegistry {
  /** Los 9 adaptadores de puertos (para lecturas de apoyo, p. ej. `/me/schedule`). */
  readonly repos: Repositories;
  readonly unitOfWork: UnitOfWork;
  readonly events: DemoEventBus;
  readonly useCases: DemoUseCases;
}

/**
 * Composición del registro del demo. Todos los casos de uso reciben el mismo
 * grafo que sus factory providers en `apps/api` (los puertos que declara cada
 * constructor, más el bus cuando emite eventos).
 */
export function createDemoRegistry(): DemoRegistry {
  const repos = createDemoRepositories();
  const unitOfWork = new DemoUnitOfWork(repos);
  const events = new DemoEventBus();

  const useCases: DemoUseCases = {
    materials: {
      CreateMaterial: new CreateMaterial({ materials: repos.materials, events }),
      UpdateMaterial: new UpdateMaterial({ materials: repos.materials, events }),
      DeactivateMaterial: new DeactivateMaterial({ materials: repos.materials, events }),
      GetMaterial: new GetMaterial({ materials: repos.materials }),
      ListMaterials: new ListMaterials({ materials: repos.materials }),
    },
    locations: {
      CreateLocation: new CreateLocation({ locations: repos.locations }),
      UpdateLocation: new UpdateLocation({ locations: repos.locations }),
      GetLocation: new GetLocation({ locations: repos.locations }),
      ListLocations: new ListLocations({ locations: repos.locations }),
    },
    machines: {
      CreateMachine: new CreateMachine({
        machines: repos.machines,
        locations: repos.locations,
        events,
      }),
      UpdateMachine: new UpdateMachine({ machines: repos.machines }),
      MoveMachine: new MoveMachine({
        machines: repos.machines,
        locations: repos.locations,
        events,
      }),
      GetMachine: new GetMachine({ machines: repos.machines }),
      ListMachines: new ListMachines({ machines: repos.machines }),
    },
    workers: {
      CreateWorker: new CreateWorker({ workers: repos.workers }),
      UpdateWorker: new UpdateWorker({ workers: repos.workers }),
      DeactivateWorker: new DeactivateWorker({ workers: repos.workers }),
      GetWorker: new GetWorker({ workers: repos.workers }),
      ListWorkers: new ListWorkers({ workers: repos.workers }),
    },
    recipes: {
      CreateRecipe: new CreateRecipe({ recipes: repos.recipes }),
      UpdateRecipe: new UpdateRecipe({ recipes: repos.recipes }),
      GetRecipe: new GetRecipe({ recipes: repos.recipes }),
      ListRecipes: new ListRecipes({ recipes: repos.recipes }),
    },
    assignments: {
      AssignWorkerToMachine: new AssignWorkerToMachine({
        assignments: repos.assignments,
        workers: repos.workers,
        machines: repos.machines,
        events,
      }),
      UnassignWorker: new UnassignWorker({
        assignments: repos.assignments,
        workers: repos.workers,
        machines: repos.machines,
        events,
      }),
      ListWorkerSchedule: new ListWorkerSchedule({
        assignments: repos.assignments,
        workers: repos.workers,
        machines: repos.machines,
      }),
      ListMachineSchedule: new ListMachineSchedule({
        assignments: repos.assignments,
        workers: repos.workers,
        machines: repos.machines,
      }),
    },
    production: {
      RegisterSupplyArrival: new RegisterSupplyArrival({ unitOfWork, events }),
      StartProduction: new StartProduction({
        batches: repos.batches,
        recipes: repos.recipes,
        events,
      }),
      RecordTransformation: new RecordTransformation({ unitOfWork, events }),
      StoreBatch: new StoreBatch({ unitOfWork, events }),
      CompleteProduction: new CompleteProduction({ batches: repos.batches, events }),
    },
    traceability: {
      TraceBatch: new TraceBatch({ batches: repos.batches, batchEvents: repos.batchEvents }),
      TraceForward: new TraceForward({ batches: repos.batches, batchEvents: repos.batchEvents }),
      GetStockByLocation: new GetStockByLocation({
        locations: repos.locations,
        materials: repos.materials,
        stockMovements: repos.stockMovements,
      }),
      GetStockMovements: new GetStockMovements({
        locations: repos.locations,
        stockMovements: repos.stockMovements,
      }),
      ListBatchEvents: new ListBatchEvents({ batchEvents: repos.batchEvents }),
      GetBatch: new GetBatch({ batches: repos.batches }),
      ListBatches: new ListBatches({ batches: repos.batches }),
    },
  };

  return { repos, unitOfWork, events, useCases };
}

/**
 * Registro compartido por la sesión de la pestaña. Los adaptadores y el bus no
 * tienen estado que dependa de instancias (la "base" es `sessionStorage`), así
 * que el singleton es seguro.
 */
export const demoRegistry: DemoRegistry = createDemoRegistry();
