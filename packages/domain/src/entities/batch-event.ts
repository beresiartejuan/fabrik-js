import { InvalidObservationError, MAX_OBSERVATION_LENGTH } from '../errors/index.js';
import {
  BatchEventId,
  type BatchId,
  type LocationId,
  type MachineId,
  type MaterialId,
  type RecipeStepId,
  type WorkerId,
} from '../value-objects/ids.js';
import type { Quantity } from '../value-objects/quantity.js';

/**
 * Cantidad asociada a un lote dentro de un BatchEvent.
 * - inputs: referencia a batches consumidos (`batchId` presente).
 * - outputs: material + cantidad producida (`batchId` opcional, puede referir al
 *   batch creado). Se modela con un único shape, según docs/02.
 */
export interface BatchQuantity {
  readonly batchId?: BatchId;
  readonly materialId: MaterialId;
  readonly quantity: Quantity;
}

export interface BatchEventProps {
  readonly machineId: MachineId;
  readonly workerId: WorkerId;
  readonly locationId: LocationId;
  /** Paso de receta que se estaba ejecutando. */
  readonly recipeStepId?: RecipeStepId;
  readonly inputs: readonly BatchQuantity[];
  readonly outputs: readonly BatchQuantity[];
  readonly observation?: string;
  readonly timestamp?: Date;
}

export interface BatchEventSnapshot extends Omit<BatchEventProps, 'timestamp'> {
  readonly id: BatchEventId;
  readonly timestamp: Date;
}

// Trim de la observación: vacía → undefined; por encima del máximo → error.
function normalizeObservation(observation?: string): string | undefined {
  if (observation === undefined) {
    return undefined;
  }
  const trimmed = observation.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > MAX_OBSERVATION_LENGTH) {
    throw new InvalidObservationError(trimmed.length, MAX_OBSERVATION_LENGTH);
  }
  return trimmed;
}

function freezeQuantities(items: readonly BatchQuantity[]): readonly BatchQuantity[] {
  return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}

/**
 * Registro inmutable de una transformación en máquina: el corazón de la
 * trazabilidad (docs/02, I4). No tiene setters ni métodos de mutación.
 */
export class BatchEvent {
  readonly id: BatchEventId;
  readonly machineId: MachineId;
  readonly workerId: WorkerId;
  readonly locationId: LocationId;
  readonly recipeStepId?: RecipeStepId;
  readonly inputs: readonly BatchQuantity[];
  readonly outputs: readonly BatchQuantity[];
  readonly observation?: string;
  readonly timestamp: Date;

  private constructor(snapshot: BatchEventSnapshot) {
    this.id = snapshot.id;
    this.machineId = snapshot.machineId;
    this.workerId = snapshot.workerId;
    this.locationId = snapshot.locationId;
    this.recipeStepId = snapshot.recipeStepId;
    this.inputs = freezeQuantities(snapshot.inputs);
    this.outputs = freezeQuantities(snapshot.outputs);
    this.observation = normalizeObservation(snapshot.observation);
    this.timestamp = snapshot.timestamp;
    Object.freeze(this);
  }

  /** Registra un evento nuevo (id autogenerado, `timestamp` por defecto ahora). */
  static create(props: BatchEventProps): BatchEvent {
    return BatchEvent.build({
      ...props,
      id: BatchEventId.create(),
      timestamp: props.timestamp ?? new Date(),
    });
  }

  /** Reconstituye un evento ya persistido. */
  static fromPersistence(snapshot: BatchEventSnapshot): BatchEvent {
    return BatchEvent.build(snapshot);
  }

  private static build(snapshot: BatchEventSnapshot): BatchEvent {
    return new BatchEvent(snapshot);
  }
}
