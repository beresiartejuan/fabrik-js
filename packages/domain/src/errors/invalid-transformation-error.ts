import type { BatchId } from '../value-objects/ids';

import { DomainError } from './domain-error';

// Motivos por los que `RecordTransformation` rechaza un comando antes de tocar
// el dominio: transformación vacía (ni inputs ni outputs) o lote de input
// repetido (doble consumo del mismo lote).
export type InvalidTransformationReason = 'empty' | 'duplicate-input';

export class InvalidTransformationError extends DomainError {
  readonly reason: InvalidTransformationReason;
  /** Presente cuando `reason === 'duplicate-input'`. */
  readonly batchId?: BatchId;

  constructor(reason: InvalidTransformationReason, detail: string, batchId?: BatchId) {
    super(
      batchId === undefined
        ? `Transformación inválida (${reason}): ${detail}`
        : `Transformación inválida (${reason}): ${detail} (lote ${batchId})`,
    );
    this.name = 'InvalidTransformationError';
    this.reason = reason;
    this.batchId = batchId;
  }
}
