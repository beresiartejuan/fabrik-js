import type { LocationId } from '../value-objects/ids';

import { DomainError } from './domain-error';

// Invariante I2: una máquina solo puede ubicarse en un Location de kind 'production'.
// El parámetro opcional `expected` generaliza el error para otros casos de uso que
// exigen un `kind` concreto (p. ej. producción/inventario requieren 'storage').
export class InvalidLocationKindError extends DomainError {
  readonly kind: string;
  readonly locationId?: LocationId;
  readonly expected?: string;

  constructor(kind: string, locationId?: LocationId, expected?: string) {
    const subject = locationId ? ` ${locationId}` : '';
    if (expected) {
      super(`El lugar${subject} es de tipo "${kind}"; se esperaba un lugar de tipo "${expected}"`);
    } else {
      super(
        `Una máquina solo puede ubicarse en un lugar de producción (kind "production"); el lugar${subject} es "${kind}"`,
      );
    }
    this.name = 'InvalidLocationKindError';
    this.kind = kind;
    this.locationId = locationId;
    this.expected = expected;
  }
}
