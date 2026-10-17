import { InvalidStateTransitionError } from '../errors/index.js';
import { BatchId, type BatchEventId, type MaterialId, type RecipeId } from '../value-objects/ids.js';
import type { Quantity } from '../value-objects/quantity.js';

// Ciclo de vida de un lote (docs/02).
export type BatchStatus = 'in_progress' | 'completed' | 'stored';

export interface BatchProps {
  readonly materialId: MaterialId;
  readonly quantity: Quantity;
  /** null/undefined para lotes de suministro (ingreso). */
  readonly recipeId?: RecipeId;
  /** Evento que lo generó; undefined = ingreso externo. */
  readonly originBatchEventId?: BatchEventId;
  readonly status?: BatchStatus;
}

export interface BatchSnapshot extends BatchProps {
  readonly id: BatchId;
}

/**
 * Lote: instancia física trazable de un material. Patrón de mutación: inmutable
 * con transiciones que devuelven una instancia nueva.
 *
 * Máquina de estados elegida (pragmática):
 *   in_progress ⇄ stored        (`store()` / `resume()`)
 *   in_progress | stored → completed  (`complete()`, estado final)
 * Una vez `completed` no admite ninguna transición.
 */
export class Batch {
  readonly id: BatchId;
  readonly materialId: MaterialId;
  readonly quantity: Quantity;
  readonly recipeId?: RecipeId;
  readonly originBatchEventId?: BatchEventId;
  readonly status: BatchStatus;

  private constructor(snapshot: BatchSnapshot) {
    this.id = snapshot.id;
    this.materialId = snapshot.materialId;
    this.quantity = snapshot.quantity;
    this.recipeId = snapshot.recipeId;
    this.originBatchEventId = snapshot.originBatchEventId;
    this.status = snapshot.status ?? 'in_progress';
    Object.freeze(this);
  }

  /** Crea un lote nuevo (id autogenerado, estado `in_progress` por defecto). */
  static create(props: BatchProps): Batch {
    return Batch.build({ ...props, id: BatchId.create() });
  }

  /** Reconstituye un lote ya persistido. */
  static fromPersistence(snapshot: BatchSnapshot): Batch {
    return Batch.build(snapshot);
  }

  /** `in_progress → stored`. */
  store(): Batch {
    return this.transition('in_progress', 'stored');
  }

  /** `stored → in_progress`. */
  resume(): Batch {
    return this.transition('stored', 'in_progress');
  }

  /** `in_progress | stored → completed` (estado final). */
  complete(): Batch {
    if (this.status === 'completed') {
      throw new InvalidStateTransitionError('Batch', this.status, 'completed');
    }
    return new Batch({ ...this.toSnapshot(), status: 'completed' });
  }

  private transition(from: BatchStatus, to: BatchStatus): Batch {
    if (this.status !== from) {
      throw new InvalidStateTransitionError('Batch', this.status, to);
    }
    return new Batch({ ...this.toSnapshot(), status: to });
  }

  private toSnapshot(): BatchSnapshot {
    return {
      id: this.id,
      materialId: this.materialId,
      quantity: this.quantity,
      recipeId: this.recipeId,
      originBatchEventId: this.originBatchEventId,
      status: this.status,
    };
  }

  private static build(snapshot: BatchSnapshot): Batch {
    return new Batch(snapshot);
  }
}
