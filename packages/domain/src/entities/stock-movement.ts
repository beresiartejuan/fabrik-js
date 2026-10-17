import { InvalidStockMovementError } from '../errors/index.js';
import {
  StockMovementId,
  type BatchEventId,
  type LocationId,
  type MaterialId,
} from '../value-objects/ids.js';
import type { StockDelta } from '../value-objects/stock-delta.js';

// Motivo de un movimiento de stock (docs/02).
export type StockMovementReason =
  | 'produced'
  | 'consumed'
  | 'supply_in'
  | 'transfer_in'
  | 'transfer_out'
  | 'manual_adjustment';

// Los motivos de producción exigen batchEventId; transferencia/ajuste/suministro lo prohíben.
const REASONS_REQUIRING_EVENT: readonly StockMovementReason[] = ['produced', 'consumed'];

export interface StockMovementProps {
  readonly locationId: LocationId;
  readonly materialId: MaterialId;
  readonly delta: StockDelta;
  readonly reason: StockMovementReason;
  readonly batchEventId?: BatchEventId;
  readonly timestamp?: Date;
}

export interface StockMovementSnapshot extends Omit<StockMovementProps, 'timestamp'> {
  readonly id: StockMovementId;
  readonly timestamp: Date;
}

/**
 * Movimiento de stock inmutable (docs/02, I4). `delta` es un valor con signo:
 * positivo = entrada, negativo = salida. El stock es la suma de movimientos.
 */
export class StockMovement {
  readonly id: StockMovementId;
  readonly locationId: LocationId;
  readonly materialId: MaterialId;
  readonly delta: StockDelta;
  readonly reason: StockMovementReason;
  readonly batchEventId?: BatchEventId;
  readonly timestamp: Date;

  private constructor(snapshot: StockMovementSnapshot) {
    StockMovement.validate(snapshot);
    this.id = snapshot.id;
    this.locationId = snapshot.locationId;
    this.materialId = snapshot.materialId;
    this.delta = Object.freeze({ ...snapshot.delta });
    this.reason = snapshot.reason;
    this.batchEventId = snapshot.batchEventId;
    this.timestamp = snapshot.timestamp;
    Object.freeze(this);
  }

  /** Registra un movimiento nuevo (id autogenerado, `timestamp` por defecto ahora). */
  static create(props: StockMovementProps): StockMovement {
    return StockMovement.build({
      ...props,
      id: StockMovementId.create(),
      timestamp: props.timestamp ?? new Date(),
    });
  }

  /** Reconstituye un movimiento ya persistido. */
  static fromPersistence(snapshot: StockMovementSnapshot): StockMovement {
    return StockMovement.build(snapshot);
  }

  private static validate(snapshot: StockMovementSnapshot): void {
    const { reason, batchEventId, delta } = snapshot;
    if (!Number.isFinite(delta.amount) || delta.amount === 0) {
      throw new InvalidStockMovementError(
        reason,
        'el delta debe ser un número finito distinto de 0 (positivo = entrada, negativo = salida)',
      );
    }
    const requiresEvent = REASONS_REQUIRING_EVENT.includes(reason);
    if (requiresEvent && batchEventId === undefined) {
      throw new InvalidStockMovementError(reason, 'requiere un batchEventId');
    }
    if (!requiresEvent && batchEventId !== undefined) {
      throw new InvalidStockMovementError(reason, 'no admite batchEventId');
    }
  }

  private static build(snapshot: StockMovementSnapshot): StockMovement {
    return new StockMovement(snapshot);
  }
}
