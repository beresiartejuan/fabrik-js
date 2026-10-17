import type { UnitOfMeasure } from './quantity.js';

// Delta de stock con signo: `amount` positivo = entrada, negativo = salida.
// No se usa Quantity porque su invariante exige amount > 0 (mismatch con docs/02).
// Vive en value-objects para poder reutilizarse desde entidades (StockMovement) y
// eventos (StockMoved) sin acoplar capas.
export interface StockDelta {
  readonly amount: number;
  readonly unit: UnitOfMeasure;
}
