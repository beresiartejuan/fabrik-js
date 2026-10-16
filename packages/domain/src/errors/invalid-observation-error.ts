import { DomainError } from './domain-error';

// Longitud máxima de la observación de un BatchEvent (docs/02).
export const MAX_OBSERVATION_LENGTH = 500;

// La observación de un BatchEvent excede la longitud permitida.
export class InvalidObservationError extends DomainError {
  readonly length: number;
  readonly maxLength: number;

  constructor(length: number, maxLength: number = MAX_OBSERVATION_LENGTH) {
    super(`La observación no puede superar ${maxLength} caracteres (recibidos: ${length})`);
    this.name = 'InvalidObservationError';
    this.length = length;
    this.maxLength = maxLength;
  }
}
