import { DomainError } from './domain-error';

// Franja horaria inválida: formato, días o rango start < end incorrectos.
export class InvalidTimeSlotError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTimeSlotError';
  }
}
