import type { MaterialKind } from '../entities/material';
import type { MaterialId } from '../value-objects/ids';

import { DomainError } from './domain-error';

// El material referenciado no es del tipo (kind) que exige el caso de uso: p. ej.
// `RegisterSupplyArrival` solo acepta materiales `supply` (docs/04).
export class MaterialKindMismatchError extends DomainError {
  readonly materialId: MaterialId;
  readonly expected: MaterialKind;
  readonly received: MaterialKind;

  constructor(materialId: MaterialId, expected: MaterialKind, received: MaterialKind) {
    super(`El material ${materialId} es de tipo "${received}"; se esperaba "${expected}"`);
    this.name = 'MaterialKindMismatchError';
    this.materialId = materialId;
    this.expected = expected;
    this.received = received;
  }
}
