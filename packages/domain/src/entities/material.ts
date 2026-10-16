import { IncompatibleUnitError } from '../errors';
import { MaterialId } from '../value-objects/ids';
import {
  isUnitCompatibleWith,
  unitsForPhysicalState,
  type PhysicalState,
  type UnitOfMeasure,
} from '../value-objects/quantity';

// Tipo de material: suministro (se consume) o producto (se fabrica) — docs/02.
export type MaterialKind = 'supply' | 'product';

export interface MaterialProps {
  readonly name: string;
  readonly description?: string;
  readonly kind: MaterialKind;
  readonly physicalState: PhysicalState;
  readonly unitOfMeasure: UnitOfMeasure;
}

export interface MaterialSnapshot extends MaterialProps {
  readonly id: MaterialId;
}

/**
 * Ítem físico del catálogo. Inmutable: `unitOfMeasure` debe ser coherente con
 * `physicalState` (docs/02, I6). Es la única regla que un Material puede
 * garantizar por sí mismo.
 */
export class Material {
  readonly id: MaterialId;
  readonly name: string;
  readonly description?: string;
  readonly kind: MaterialKind;
  readonly physicalState: PhysicalState;
  readonly unitOfMeasure: UnitOfMeasure;

  private constructor(snapshot: MaterialSnapshot) {
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.description = snapshot.description;
    this.kind = snapshot.kind;
    this.physicalState = snapshot.physicalState;
    this.unitOfMeasure = snapshot.unitOfMeasure;
    Object.freeze(this);
  }

  /** Crea un material nuevo (id autogenerado) validando unidad ↔ estado físico. */
  static create(props: MaterialProps): Material {
    return Material.build({ ...props, id: MaterialId.create() });
  }

  /** Reconstituye un material ya persistido. */
  static fromPersistence(snapshot: MaterialSnapshot): Material {
    return Material.build(snapshot);
  }

  private static build(snapshot: MaterialSnapshot): Material {
    if (!isUnitCompatibleWith(snapshot.unitOfMeasure, snapshot.physicalState)) {
      throw new IncompatibleUnitError(
        unitsForPhysicalState(snapshot.physicalState)[0],
        snapshot.unitOfMeasure,
        snapshot.id,
        snapshot.physicalState,
      );
    }
    return new Material(snapshot);
  }
}
