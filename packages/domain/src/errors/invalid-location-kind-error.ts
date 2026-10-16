import type { LocationId } from '../value-objects/ids';

import { DomainError } from './domain-error';

// Invariante I2: una máquina solo puede ubicarse en un Location de kind 'production'.
export class InvalidLocationKindError extends DomainError {
  readonly kind: string;
  readonly locationId?: LocationId;

  constructor(kind: string, locationId?: LocationId) {
    const subject = locationId ? ` ${locationId}` : '';
    super(
      `Una máquina solo puede ubicarse en un lugar de producción (kind "production"); el lugar${subject} es "${kind}"`,
    );
    this.name = 'InvalidLocationKindError';
    this.kind = kind;
    this.locationId = locationId;
  }
}
