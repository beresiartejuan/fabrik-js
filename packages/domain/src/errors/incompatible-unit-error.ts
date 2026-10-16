import type { MaterialId } from '../value-objects/ids';
import type { PhysicalState, UnitOfMeasure } from '../value-objects/quantity';

import { DomainError } from './domain-error';

// Invariante I6: las cantidades deben ser coherentes con la unidad del material.
// También cubre la coherencia unidad ↔ estado físico (docs/02) cuando se provee
// `physicalState`.
export class IncompatibleUnitError extends DomainError {
  readonly expected: UnitOfMeasure;
  readonly received: UnitOfMeasure;
  readonly materialId?: MaterialId;
  readonly physicalState?: PhysicalState;

  constructor(
    expected: UnitOfMeasure,
    received: UnitOfMeasure,
    materialId?: MaterialId,
    physicalState?: PhysicalState,
  ) {
    const subject = materialId ? ` para ${materialId}` : '';
    if (physicalState) {
      super(`Unidad incompatible${subject}: ${received} no es válida para estado físico ${physicalState}`);
    } else {
      super(`Unidad incompatible${subject}: se esperaba ${expected} y se recibió ${received}`);
    }
    this.name = 'IncompatibleUnitError';
    this.expected = expected;
    this.received = received;
    this.materialId = materialId;
    this.physicalState = physicalState;
  }
}
