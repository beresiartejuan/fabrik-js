import { FactoryId } from '../value-objects/ids';

export interface FactoryProps {
  readonly name: string;
}

export interface FactorySnapshot extends FactoryProps {
  readonly id: FactoryId;
}

/** Raíz del contexto: contiene catálogos y configuración (docs/02). Inmutable. */
export class Factory {
  readonly id: FactoryId;
  readonly name: string;

  private constructor(snapshot: FactorySnapshot) {
    this.id = snapshot.id;
    this.name = snapshot.name;
    Object.freeze(this);
  }

  /** Crea una fábrica nueva (id autogenerado). */
  static create(props: FactoryProps): Factory {
    return Factory.build({ ...props, id: FactoryId.create() });
  }

  /** Reconstituye una fábrica ya persistida. */
  static fromPersistence(snapshot: FactorySnapshot): Factory {
    return Factory.build(snapshot);
  }

  private static build(snapshot: FactorySnapshot): Factory {
    return new Factory(snapshot);
  }
}
