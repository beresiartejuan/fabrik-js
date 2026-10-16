import type { MaterialId } from '../value-objects/ids';
import type { Quantity } from '../value-objects/quantity';

import { DomainError } from './domain-error';

// Invariante I5: una salida requiere stock suficiente; el stock no puede quedar negativo.
export class InsufficientStockError extends DomainError {
  readonly materialId: MaterialId;
  readonly requested: Quantity;
  readonly available: Quantity;

  constructor(materialId: MaterialId, requested: Quantity, available: Quantity) {
    super(
      `Stock insuficiente de ${materialId}: solicitado ${requested.toString()}, disponible ${available.toString()}`,
    );
    this.name = 'InsufficientStockError';
    this.materialId = materialId;
    this.requested = requested;
    this.available = available;
  }
}
