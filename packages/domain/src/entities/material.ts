import { IncompatibleUnitError } from '../errors/index.js';
import { MaterialId } from '../value-objects/ids.js';
import {
  isUnitCompatibleWith,
  unitsForPhysicalState,
  type PhysicalState,
  type UnitOfMeasure,
} from '../value-objects/quantity.js';

// Tipo de material: suministro (se consume) o producto (se fabrica) — docs/02.
export type MaterialKind = 'supply' | 'product';

export interface MaterialProps {
  readonly name: string;
  readonly description?: string;
  readonly kind: MaterialKind;
  readonly physicalState: PhysicalState;
  readonly unitOfMeasure: UnitOfMeasure;
  readonly active?: boolean;
}

export interface MaterialSnapshot extends MaterialProps {
  readonly id: MaterialId;
}

/**
 * Ítem físico del catálogo. Inmutable: `unitOfMeasure` debe ser coherente con
 * `physicalState` (docs/02, I6). Es la única regla que un Material puede
 * garantizar por sí mismo.
 *
 * `active` habilita la baja lógica (`DeactivateMaterial`, docs/04); por defecto
 * `true` para no romper lecturas/creaciones existentes.
 */
export class Material {
  readonly id: MaterialId;
  readonly name: string;
  readonly description?: string;
  readonly kind: MaterialKind;
  readonly physicalState: PhysicalState;
  readonly unitOfMeasure: UnitOfMeasure;
  readonly active: boolean;

  private constructor(snapshot: MaterialSnapshot) {
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.description = snapshot.description;
    this.kind = snapshot.kind;
    this.physicalState = snapshot.physicalState;
    this.unitOfMeasure = snapshot.unitOfMeasure;
    this.active = snapshot.active ?? true;
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

  /** Reactiva un material (idempotente). */
  activate(): Material {
    return this.active ? this : new Material({ ...this.toSnapshot(), active: true });
  }

  /** Da de baja un material (idempotente). */
  deactivate(): Material {
    return this.active ? new Material({ ...this.toSnapshot(), active: false }) : this;
  }

  private toSnapshot(): MaterialSnapshot {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      kind: this.kind,
      physicalState: this.physicalState,
      unitOfMeasure: this.unitOfMeasure,
      active: this.active,
    };
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
