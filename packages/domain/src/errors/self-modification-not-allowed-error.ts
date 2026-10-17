import type { WorkerId } from '../value-objects/ids.js';

import { DomainError } from './domain-error.js';

// Invariante anti-lockout: un administrador no puede quitarse a sí mismo el rol
// ni desactivarse, para no perder el acceso de gestión por error.
export type SelfModificationField = 'role' | 'active';

export class SelfModificationNotAllowedError extends DomainError {
  readonly workerId: WorkerId;
  readonly useCase: string;
  readonly field: SelfModificationField;

  constructor(workerId: WorkerId, useCase: string, field: SelfModificationField) {
    const what = field === 'role' ? 'su propio rol' : 'su propio estado activo';
    super(`El trabajador ${workerId} no puede modificar ${what} en ${useCase}`);
    this.name = 'SelfModificationNotAllowedError';
    this.workerId = workerId;
    this.useCase = useCase;
    this.field = field;
  }
}
