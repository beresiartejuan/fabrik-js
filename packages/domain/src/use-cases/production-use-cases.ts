// Casos de uso de producción e inventario (Fase 7, docs/03 y docs/04).
//
// Decisiones de alcance de esta fase (documentadas también en cada caso de uso):
//  - El lote raíz de `StartProduction` guarda `recipe.outputQuantity` como
//    cantidad *planificada*; la realidad se registra en los lotes de output.
//  - I5 (suficiencia de stock) queda **diferido**: los consumos se descuentan en
//    el lugar de la máquina y los outputs solo ingresan a stock al pasar por
//    `StoreBatch` (`produced`), por lo que una comprobación de no-negatividad
//    sería incoherente hasta cerrar el flujo de almacenamiento.
//  - No se emite el evento genérico `stock.moved` (docs/05) en esta fase: los
//    eventos publicados son los enumerados por caso de uso en docs/04.
import {
  InactiveMachineError,
  InactiveWorkerError,
  IncompatibleUnitError,
  InvalidLocationKindError,
  InvalidTransformationError,
  MaterialKindMismatchError,
  NotAProductionOrderError,
  NotFoundError,
  UnauthorizedRoleError,
  WorkerNotAssignedError,
} from '../errors/index.js';
import { Batch } from '../entities/batch.js';
import { BatchEvent } from '../entities/batch-event.js';
import { StockMovement } from '../entities/stock-movement.js';
import type { WorkerRole } from '../entities/worker.js';
import type { EventBus } from '../events/event-bus.js';
import {
  batchCreated,
  batchStored,
  batchTransformed,
  productionCompleted,
  supplyArrived,
} from '../events/production-events.js';
import type { BatchRepository } from '../ports/batch-repository.js';
import type { RecipeRepository } from '../ports/recipe-repository.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type {
  BatchId,
  LocationId,
  MachineId,
  MaterialId,
  RecipeId,
  RecipeStepId,
  WorkerId,
} from '../value-objects/ids.js';
import type { Quantity } from '../value-objects/quantity.js';

import { requireRole, type Actor } from './actor.js';

// --- Roles (docs/04) ---

/** Ingreso de suministros y almacenamiento: A, W. */
const PRODUCTION_WRITE_ROLES: readonly WorkerRole[] = ['admin', 'worker'];
/** Inicio de producción: A. */
const ADMIN_ROLES: readonly WorkerRole[] = ['admin'];
/** Registro de transformaciones: W (los administradores no operan máquinas). */
const WORKER_ROLES: readonly WorkerRole[] = ['worker'];

// --- Dependencias ---

/**
 * Casos de uso que escriben en varios agregados (lote + movimiento de stock) y
 * que por tanto corren dentro de una unidad de trabajo (docs/04): el bus se
 * publica después del commit.
 */
export interface ProductionTransactionalDeps {
  readonly unitOfWork: UnitOfWork;
  readonly events: EventBus;
}

/** Casos de uso que escriben un único agregado (`Batch`). */
export interface BatchWriteDeps {
  readonly batches: BatchRepository;
  readonly events: EventBus;
}

/** `StartProduction` además resuelve la receta. */
export interface StartProductionDeps extends BatchWriteDeps {
  readonly recipes: RecipeRepository;
}

// --- Comandos ---

export interface RegisterSupplyArrivalCommand {
  readonly materialId: MaterialId;
  readonly quantity: Quantity;
  readonly locationId: LocationId;
}

export interface StartProductionCommand {
  readonly recipeId: RecipeId;
}

/** Referencia a un lote a consumir, con la cantidad realmente usada. */
export interface TransformationInput {
  readonly batchId: BatchId;
  readonly quantity: Quantity;
}

/** Material y cantidad realmente producida por la transformación. */
export interface TransformationOutput {
  readonly materialId: MaterialId;
  readonly quantity: Quantity;
}

export interface RecordTransformationCommand {
  readonly machineId: MachineId;
  readonly workerId: WorkerId;
  readonly recipeStepId?: RecipeStepId;
  readonly inputs: readonly TransformationInput[];
  readonly outputs: readonly TransformationOutput[];
  readonly observation?: string;
  /** Inyectable en tests; por defecto, el instante actual. */
  readonly timestamp?: Date;
}

export interface StoreBatchCommand {
  readonly batchId: BatchId;
  readonly locationId: LocationId;
}

export interface CompleteProductionCommand {
  readonly batchId: BatchId;
}

/**
 * `RegisterSupplyArrival` (roles A, W): ingresa un suministro externo.
 *
 * Validaciones: el material existe y es `kind: 'supply'` (si no,
 * `MaterialKindMismatchError`); el lugar existe y es `kind: 'storage'`
 * (`InvalidLocationKindError`); la cantidad usa la unidad del material (I6,
 * `IncompatibleUnitError`).
 *
 * Efectos (transaccionales): crea el `Batch` de suministro **ya en estado
 * `stored`** (el ingreso llega directo al almacén, docs/03) y un `StockMovement`
 * `supply_in` con delta `+quantity` en ese lugar. Emite `supply.arrived` tras el
 * commit.
 */
export class RegisterSupplyArrival {
  constructor(private readonly deps: ProductionTransactionalDeps) {}

  async execute(actor: Actor, command: RegisterSupplyArrivalCommand): Promise<Batch> {
    requireRole(actor, PRODUCTION_WRITE_ROLES, 'RegisterSupplyArrival');

    const batch = await this.deps.unitOfWork.run(async (repos) => {
      const material = await repos.materials.findById(command.materialId);
      if (!material) {
        throw new NotFoundError('Material', command.materialId);
      }
      if (material.kind !== 'supply') {
        throw new MaterialKindMismatchError(material.id, 'supply', material.kind);
      }

      const location = await repos.locations.findById(command.locationId);
      if (!location) {
        throw new NotFoundError('Location', command.locationId);
      }
      if (location.kind !== 'storage') {
        throw new InvalidLocationKindError(location.kind, location.id, 'storage');
      }

      // I6: en esta fase no hay conversión de unidades; la cantidad debe usar
      // exactamente la unidad del material.
      if (command.quantity.unit !== material.unitOfMeasure) {
        throw new IncompatibleUnitError(material.unitOfMeasure, command.quantity.unit, material.id);
      }

      const created = Batch.create({
        materialId: material.id,
        quantity: command.quantity,
        status: 'stored',
      });
      await repos.batches.save(created);
      await repos.stockMovements.add(
        StockMovement.create({
          locationId: location.id,
          materialId: material.id,
          delta: { amount: command.quantity.amount, unit: command.quantity.unit },
          reason: 'supply_in',
        }),
      );
      return created;
    });

    await this.deps.events.publish(
      supplyArrived({
        batchId: batch.id,
        materialId: batch.materialId,
        quantity: batch.quantity,
        locationId: command.locationId,
      }),
    );
    return batch;
  }
}

/**
 * `StartProduction` (rol A): crea el **lote raíz** de la orden de producción a
 * partir de la receta y lo deja `in_progress` (docs/03).
 *
 * Decisión de modelado: el lote raíz representa la *orden*, no producto físico
 * aún. Como `Batch.quantity` es obligatorio y no existe un concepto separado de
 * "cantidad planeada", se usa `recipe.outputQuantity` como **cantidad objetivo
 * planificada**. Las cantidades reales se registran en los lotes de output de
 * cada `RecordTransformation` (permite ver mermas al auditar). Emite
 * `batch.created`.
 */
export class StartProduction {
  constructor(private readonly deps: StartProductionDeps) {}

  async execute(actor: Actor, command: StartProductionCommand): Promise<Batch> {
    requireRole(actor, ADMIN_ROLES, 'StartProduction');

    const recipe = await this.deps.recipes.findById(command.recipeId);
    if (!recipe) {
      throw new NotFoundError('Recipe', command.recipeId);
    }

    const root = Batch.create({
      materialId: recipe.outputProductId,
      quantity: recipe.outputQuantity,
      recipeId: recipe.id,
      status: 'in_progress',
    });
    await this.deps.batches.save(root);
    await this.deps.events.publish(batchCreated({ batchId: root.id, recipeId: recipe.id }));
    return root;
  }
}

/**
 * `RecordTransformation` (rol W): núcleo operativo (docs/03, docs/04). Registra
 * de forma transaccional e inmutable una transformación en máquina.
 *
 * Validaciones, en orden:
 *  a. rol `worker`;
 *  b. el comando declara al menos un input o un output y no repite un mismo
 *     `batchId` entre sus inputs (evita el doble consumo) →
 *     `InvalidTransformationError`;
 *  c. el worker existe y está activo; el actor solo puede registrar sus propios
 *     eventos (`actor.workerId === command.workerId`, si no `UnauthorizedRoleError`);
 *  d. la máquina existe y no está en `maintenance` (`InactiveMachineError`);
 *  e. **I3**: el worker tiene una asignación a ESA máquina cuya franja contiene
 *     el `timestamp` (`WorkerNotAssignedError`);
 *  f. cada lote de input existe (`NotFoundError`);
 *  g. **I6**: cada material de output existe y su cantidad usa la unidad del
 *     material (`IncompatibleUnitError`).
 *
 * Efectos (transaccionales, vía `UnitOfWork`): crea el `BatchEvent`, un
 * `StockMovement` `consumed` (delta negativo, `batchEventId`) por input en el
 * lugar de la máquina, y un `Batch` `in_progress` con `originBatchEventId` por
 * output. Emite `batch.transformed` tras el commit.
 *
 * Diferido (documentado): la suficiencia de stock **I5** no se valida todavía.
 * El stock consumido se descuenta en el lugar de la máquina y los outputs solo
 * ingresan a stock al pasar por `StoreBatch` (`produced`), por lo que una
 * comprobación de no-negatividad en el lugar de producción sería incoherente.
 * I5 llegará junto al flujo de almacenamiento. Tampoco se valida la coherencia de
 * unidad de los inputs ni la suficiencia de cantidad por lote (los `Batch` son
 * inmutables y no hay contador de consumo parcial).
 */
export class RecordTransformation {
  constructor(private readonly deps: ProductionTransactionalDeps) {}

  async execute(actor: Actor, command: RecordTransformationCommand): Promise<BatchEvent> {
    requireRole(actor, WORKER_ROLES, 'RecordTransformation');

    // (b) El comando debe describir una transformación real: al menos un input o
    // un output, y sin lotes de input repetidos (doble consumo). Son chequeos
    // puros del comando, así que corren antes de abrir la unidad de trabajo.
    if (command.inputs.length === 0 && command.outputs.length === 0) {
      throw new InvalidTransformationError(
        'empty',
        'la transformación debe declarar al menos un input o un output',
      );
    }
    const seenInputBatchIds = new Set<BatchId>();
    for (const input of command.inputs) {
      if (seenInputBatchIds.has(input.batchId)) {
        throw new InvalidTransformationError(
          'duplicate-input',
          `el lote ${input.batchId} aparece más de una vez en los inputs`,
          input.batchId,
        );
      }
      seenInputBatchIds.add(input.batchId);
    }

    const timestamp = command.timestamp ?? new Date();

    const { event, outputBatches } = await this.deps.unitOfWork.run(async (repos) => {
      const worker = await repos.workers.findById(command.workerId);
      if (!worker) {
        throw new NotFoundError('Worker', command.workerId);
      }
      if (!worker.active) {
        throw new InactiveWorkerError(worker.id);
      }
      // Un worker solo puede registrar sus propios eventos.
      if (actor.workerId !== command.workerId) {
        throw new UnauthorizedRoleError(actor.role, 'RecordTransformation');
      }

      const machine = await repos.machines.findById(command.machineId);
      if (!machine) {
        throw new NotFoundError('Machine', command.machineId);
      }
      if (machine.status === 'maintenance') {
        throw new InactiveMachineError(machine.id, machine.status);
      }

      // I3: asignación vigente del worker a esta máquina en el instante dado.
      const assignments = await repos.assignments.findByWorker(worker.id);
      const assigned = assignments.some(
        (assignment) =>
          assignment.machineId === machine.id && assignment.slot.contains(timestamp),
      );
      if (!assigned) {
        throw new WorkerNotAssignedError(worker.id, machine.id, timestamp);
      }

      // (f) inputs: cada lote referenciado debe existir.
      const resolvedInputs: { batch: Batch; quantity: Quantity }[] = [];
      for (const input of command.inputs) {
        const batch = await repos.batches.findById(input.batchId);
        if (!batch) {
          throw new NotFoundError('Batch', input.batchId);
        }
        resolvedInputs.push({ batch, quantity: input.quantity });
      }

      // (g) outputs: material existente + coherencia de unidad (I6).
      for (const output of command.outputs) {
        const material = await repos.materials.findById(output.materialId);
        if (!material) {
          throw new NotFoundError('Material', output.materialId);
        }
        if (output.quantity.unit !== material.unitOfMeasure) {
          throw new IncompatibleUnitError(material.unitOfMeasure, output.quantity.unit, material.id);
        }
      }

      // El evento se crea primero (docs/04): los outputs referencian su id como
      // `originBatchEventId`; a su vez el evento puede referenciar los batches de
      // input que consume. El `batchId` de los outputs se completa en el payload
      // del evento de dominio tras crear los lotes.
      const event = BatchEvent.create({
        machineId: machine.id,
        workerId: worker.id,
        locationId: machine.locationId,
        recipeStepId: command.recipeStepId,
        inputs: resolvedInputs.map(({ batch, quantity }) => ({
          batchId: batch.id,
          materialId: batch.materialId,
          quantity,
        })),
        outputs: command.outputs.map((output) => ({
          materialId: output.materialId,
          quantity: output.quantity,
        })),
        observation: command.observation,
        timestamp,
      });
      await repos.batchEvents.add(event);

      // Inputs: salida de stock vinculada al evento, en el lugar de la máquina.
      for (const { batch, quantity } of resolvedInputs) {
        await repos.stockMovements.add(
          StockMovement.create({
            locationId: machine.locationId,
            materialId: batch.materialId,
            delta: { amount: -quantity.amount, unit: quantity.unit },
            reason: 'consumed',
            batchEventId: event.id,
            timestamp,
          }),
        );
      }

      // Outputs: nuevos lotes en proceso, originados por este evento.
      const outputBatches: Batch[] = [];
      for (const output of command.outputs) {
        const batch = Batch.create({
          materialId: output.materialId,
          quantity: output.quantity,
          originBatchEventId: event.id,
          status: 'in_progress',
        });
        await repos.batches.save(batch);
        outputBatches.push(batch);
      }

      return { event, outputBatches };
    });

    await this.deps.events.publish(
      batchTransformed({
        eventId: event.id,
        machineId: event.machineId,
        workerId: event.workerId,
        inputs: event.inputs.map((input) => ({
          batchId: input.batchId as BatchId,
          materialId: input.materialId,
          quantity: input.quantity,
        })),
        outputs: outputBatches.map((batch) => ({
          batchId: batch.id,
          materialId: batch.materialId,
          quantity: batch.quantity,
        })),
        observation: event.observation,
      }),
    );
    return event;
  }
}

/**
 * `StoreBatch` (roles A, W): mueve un lote `in_progress` a un lugar de
 * almacenamiento (docs/04). El estado se valida en la entidad (`store()` lanza
 * `InvalidStateTransitionError` si el lote ya está `stored`/`completed`); el
 * lugar debe existir y ser `kind: 'storage'` (`InvalidLocationKindError`).
 *
 * Efectos (transaccionales): lote `stored` + `StockMovement` de entrada. Decisión
 * de `reason`: si el lote tiene `originBatchEventId` (es output de una
 * transformación) el ingreso de stock es `produced` vinculado a ese evento; si no
 * (lote sin origen de producción) es `transfer_in`, porque `produced` exige un
 * `batchEventId`. Emite `batch.stored` tras el commit.
 */
export class StoreBatch {
  constructor(private readonly deps: ProductionTransactionalDeps) {}

  async execute(actor: Actor, command: StoreBatchCommand): Promise<Batch> {
    requireRole(actor, PRODUCTION_WRITE_ROLES, 'StoreBatch');

    const stored = await this.deps.unitOfWork.run(async (repos) => {
      const batch = await repos.batches.findById(command.batchId);
      if (!batch) {
        throw new NotFoundError('Batch', command.batchId);
      }

      const moved = batch.store();

      const location = await repos.locations.findById(command.locationId);
      if (!location) {
        throw new NotFoundError('Location', command.locationId);
      }
      if (location.kind !== 'storage') {
        throw new InvalidLocationKindError(location.kind, location.id, 'storage');
      }

      await repos.batches.save(moved);

      const originEventId = moved.originBatchEventId;
      await repos.stockMovements.add(
        StockMovement.create({
          locationId: location.id,
          materialId: moved.materialId,
          delta: { amount: moved.quantity.amount, unit: moved.quantity.unit },
          reason: originEventId ? 'produced' : 'transfer_in',
          batchEventId: originEventId,
        }),
      );

      return moved;
    });

    await this.deps.events.publish(
      batchStored({ batchId: stored.id, locationId: command.locationId }),
    );
    return stored;
  }
}

/**
 * `CompleteProduction` (roles A, W): marca un lote como `completed` (estado
 * final; la entidad lanza `InvalidStateTransitionError` si ya lo estaba) y emite
 * `production.completed`.
 *
 * Decisión: el evento exige un `recipeId`, por lo que solo se pueden completar
 * lotes que pertenecen a una receta — en el flujo actual, el lote raíz creado por
 * `StartProduction` (la orden de producción). La comprobación de que el lote es
 * una orden se ejecuta **antes** de `complete()`: un lote sin receta no transiciona
 * y lanza `NotAProductionOrderError`.
 */
export class CompleteProduction {
  constructor(private readonly deps: BatchWriteDeps) {}

  async execute(actor: Actor, command: CompleteProductionCommand): Promise<Batch> {
    requireRole(actor, PRODUCTION_WRITE_ROLES, 'CompleteProduction');

    const batch = await this.deps.batches.findById(command.batchId);
    if (!batch) {
      throw new NotFoundError('Batch', command.batchId);
    }

    // Validar antes de tocar el estado: un lote sin receta no es una orden.
    const recipeId = batch.recipeId;
    if (!recipeId) {
      throw new NotAProductionOrderError(batch.id);
    }

    const completed = batch.complete();
    await this.deps.batches.save(completed);
    await this.deps.events.publish(
      productionCompleted({ batchId: completed.id, recipeId }),
    );
    return completed;
  }
}
