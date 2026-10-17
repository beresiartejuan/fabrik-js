import type { BatchId } from '../value-objects/ids.js';

import { DomainError } from './domain-error.js';

// `CompleteProduction` exige que el lote pertenezca a una receta (el evento
// `production.completed` requiere `recipeId`). Completar un suministro o un lote
// intermedio no es completar una orden de producción.
export class NotAProductionOrderError extends DomainError {
  readonly batchId: BatchId;

  constructor(batchId: BatchId) {
    super(
      `El lote ${batchId} no pertenece a una receta; solo las órdenes de producción pueden completarse`,
    );
    this.name = 'NotAProductionOrderError';
    this.batchId = batchId;
  }
}
