import type { MaterialId } from '../value-objects/ids';
import type { UnitOfMeasure } from '../value-objects/quantity';

import { DomainError } from './domain-error';

// Invariante I6: las cantidades deben ser coherentes con la unidad del material.
// Reservado para uso futuro: quantity.ts todavía lanza InvalidQuantityError en el mismatch.
export class IncompatibleUnitError extends DomainError {
  readonly expected: UnitOfMeasure;
  readonly received: UnitOfMeasure;
  readonly materialId?: MaterialId;

  constructor(expected: UnitOfMeasure, received: UnitOfMeasure, materialId?: MaterialId) {
    const subject = materialId ? ` para ${materialId}` : '';
    super(`Unidad incompatible${subject}: se esperaba ${expected} y se recibió ${received}`);
    this.name = 'IncompatibleUnitError';
    this.expected = expected;
    this.received = received;
    this.materialId = materialId;
  }
}
