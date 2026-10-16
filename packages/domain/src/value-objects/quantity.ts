import { InvalidQuantityError } from '../errors';

// Estado físico de un material (docs/02).
export type PhysicalState = 'solid' | 'liquid' | 'gas';

// Unidades de medida soportadas (docs/02).
export type UnitOfMeasure = 'g' | 'kg' | 'unit' | 'ml' | 'l' | 'm3';

// Coherencia unidad ↔ estado físico (tabla de docs/02).
const UNITS_BY_STATE: Record<PhysicalState, readonly UnitOfMeasure[]> = {
  solid: ['g', 'kg', 'unit'],
  liquid: ['ml', 'l'],
  gas: ['ml', 'l', 'm3'],
};

/** Indica si una unidad es coherente con el estado físico de un material. */
export function isUnitCompatibleWith(unit: UnitOfMeasure, physicalState: PhysicalState): boolean {
  return UNITS_BY_STATE[physicalState].includes(unit);
}

/** Unidades válidas para un estado físico (tabla de docs/02). */
export function unitsForPhysicalState(physicalState: PhysicalState): readonly UnitOfMeasure[] {
  return UNITS_BY_STATE[physicalState];
}

/**
 * Cantidad física inmutable. Invariante: `amount` finito y > 0.
 * En esta fase solo se opera entre cantidades de la misma unidad (sin conversión).
 */
export class Quantity {
  readonly amount: number;
  readonly unit: UnitOfMeasure;

  private constructor(amount: number, unit: UnitOfMeasure) {
    this.amount = amount;
    this.unit = unit;
    Object.freeze(this);
  }

  /** Crea una cantidad validando el invariante `amount > 0` y finito. */
  static create(amount: number, unit: UnitOfMeasure): Quantity {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new InvalidQuantityError(
        `La cantidad debe ser un número finito mayor que 0 (recibido: ${amount})`,
      );
    }
    return new Quantity(amount, unit);
  }

  /** Suma dos cantidades de la misma unidad. */
  add(other: Quantity): Quantity {
    this.assertSameUnit(other);
    return Quantity.create(this.amount + other.amount, this.unit);
  }

  /**
   * Resta dos cantidades de la misma unidad. Rechaza resultados <= 0 (invariante
   * de `Quantity`). Para verificar suficiencia de stock (I5) hay que comparar los
   * montos crudos (`this.amount >= other.amount`), no usar `subtract`, que lanza
   * cuando el resultado no es estrictamente positivo.
   */
  subtract(other: Quantity): Quantity {
    this.assertSameUnit(other);
    return Quantity.create(this.amount - other.amount, this.unit);
  }

  equals(other: Quantity): boolean {
    return this.unit === other.unit && this.amount === other.amount;
  }

  toString(): string {
    return `${this.amount} ${this.unit}`;
  }

  private assertSameUnit(other: Quantity): void {
    if (this.unit !== other.unit) {
      throw new InvalidQuantityError(
        `No se pueden operar cantidades con unidades distintas (${this.unit} vs ${other.unit})`,
      );
    }
  }
}
