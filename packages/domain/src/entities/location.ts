import { LocationId } from '../value-objects/ids.js';

// Un lugar de producción aloja máquinas; un lugar de almacenamiento guarda stock (docs/02).
export type LocationKind = 'production' | 'storage';

export interface LocationProps {
  readonly name: string;
  readonly kind: LocationKind;
}

export interface LocationSnapshot extends LocationProps {
  readonly id: LocationId;
}

/** Lugar físico de la fábrica. Inmutable. */
export class Location {
  readonly id: LocationId;
  readonly name: string;
  readonly kind: LocationKind;

  private constructor(snapshot: LocationSnapshot) {
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.kind = snapshot.kind;
    Object.freeze(this);
  }

  /** Crea un lugar nuevo (id autogenerado). */
  static create(props: LocationProps): Location {
    return Location.build({ ...props, id: LocationId.create() });
  }

  /** Reconstituye un lugar ya persistido. */
  static fromPersistence(snapshot: LocationSnapshot): Location {
    return Location.build(snapshot);
  }

  private static build(snapshot: LocationSnapshot): Location {
    return new Location(snapshot);
  }
}
