import { DomainError } from './domain-error.js';

// Autorización por rol: el rol del worker no puede ejecutar el caso de uso.
export class UnauthorizedRoleError extends DomainError {
  readonly role: 'admin' | 'worker' | 'auditor';
  readonly useCase: string;

  constructor(role: 'admin' | 'worker' | 'auditor', useCase: string) {
    super(`El rol "${role}" no está autorizado para ejecutar ${useCase}`);
    this.name = 'UnauthorizedRoleError';
    this.role = role;
    this.useCase = useCase;
  }
}
