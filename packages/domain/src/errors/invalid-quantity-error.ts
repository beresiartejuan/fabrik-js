import { DomainError } from './domain-error';

// Cantidad inválida: monto no finito/no positivo, o unidades incompatibles.
export class InvalidQuantityError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQuantityError';
  }
}
