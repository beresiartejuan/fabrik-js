import type { WorkerId } from '../value-objects/ids.js';

import { DomainError } from './domain-error.js';

// Invariante anti-lockout: no se puede desactivar ni degradar al último
// administrador activo, porque el sistema quedaría sin nadie que gestione los
// catálogos.
export type LastAdminAction = 'deactivate' | 'demote';

export class LastAdminError extends DomainError {
  readonly workerId: WorkerId;
  readonly useCase: string;
  readonly action: LastAdminAction;

  constructor(workerId: WorkerId, useCase: string, action: LastAdminAction) {
    const what =
      action === 'deactivate' ? `desactivar a ${workerId}` : `quitar el rol de admin a ${workerId}`;
    super(`No se puede ${what} en ${useCase}: es el último administrador activo`);
    this.name = 'LastAdminError';
    this.workerId = workerId;
    this.useCase = useCase;
    this.action = action;
  }
}
