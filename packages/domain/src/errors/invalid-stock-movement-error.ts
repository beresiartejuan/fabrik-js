import { DomainError } from './domain-error';

// Reglas de construcción de un StockMovement (coherencia reason ↔ batchEventId, delta).
export class InvalidStockMovementError extends DomainError {
  readonly reason: string;

  constructor(reason: string, detail: string) {
    super(`Movimiento de stock inválido (reason "${reason}"): ${detail}`);
    this.name = 'InvalidStockMovementError';
    this.reason = reason;
  }
}
