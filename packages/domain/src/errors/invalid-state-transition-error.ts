import { DomainError } from './domain-error';

// Transición de estado no permitida por la máquina de estados de una entidad
// con ciclo de vida mutable (Machine, Batch).
export class InvalidStateTransitionError extends DomainError {
  readonly entity: string;
  readonly from: string;
  readonly to: string;

  constructor(entity: string, from: string, to: string) {
    super(`Transición de estado inválida en ${entity}: ${from} → ${to}`);
    this.name = 'InvalidStateTransitionError';
    this.entity = entity;
    this.from = from;
    this.to = to;
  }
}
