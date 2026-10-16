import { InvalidLocationKindError, InvalidStateTransitionError } from '../errors';
import { LocationId, MachineId } from '../value-objects/ids';

import type { LocationKind } from './location';

// Catálogo de tipos de máquina abierto (docs/02): el tipo habilita pasos de receta.
export type MachineType = string;

// Estado operativo de una máquina (docs/02).
export type MachineStatus = 'idle' | 'running' | 'maintenance';

export interface MachineProps {
  readonly name: string;
  readonly type: MachineType;
  readonly locationId: LocationId;
  readonly status?: MachineStatus;
}

export interface MachineSnapshot extends MachineProps {
  readonly id: MachineId;
}

// Referencia estructural a un lugar destino (encaja con la entidad Location).
export interface ProductionLocationRef {
  readonly id: LocationId;
  readonly kind: LocationKind;
}

/**
 * Máquina de la fábrica. Patrón de mutación: la entidad es inmutable y cada
 * transición devuelve una instancia nueva que valida la regla.
 *
 * Estados: `idle ⇄ running`; `idle → maintenance → idle`.
 */
export class Machine {
  readonly id: MachineId;
  readonly name: string;
  readonly type: MachineType;
  readonly locationId: LocationId;
  readonly status: MachineStatus;

  private constructor(snapshot: MachineSnapshot) {
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.type = snapshot.type;
    this.locationId = snapshot.locationId;
    this.status = snapshot.status ?? 'idle';
    Object.freeze(this);
  }

  /** Crea una máquina nueva (id autogenerado, estado `idle` por defecto). */
  static create(props: MachineProps): Machine {
    return Machine.build({ ...props, id: MachineId.create() });
  }

  /** Reconstituye una máquina ya persistida. */
  static fromPersistence(snapshot: MachineSnapshot): Machine {
    return Machine.build(snapshot);
  }

  /** I2: solo se permite mover a un lugar de producción. */
  moveTo(location: ProductionLocationRef): Machine {
    if (location.kind !== 'production') {
      throw new InvalidLocationKindError(location.kind, location.id);
    }
    return new Machine({ ...this.toSnapshot(), locationId: location.id });
  }

  /** `idle → running`. */
  start(): Machine {
    return this.transition('idle', 'running');
  }

  /** `running → idle`. */
  stop(): Machine {
    return this.transition('running', 'idle');
  }

  /** `idle → maintenance` (primero hay que detenerla). */
  startMaintenance(): Machine {
    return this.transition('idle', 'maintenance');
  }

  /** `maintenance → idle`. */
  finishMaintenance(): Machine {
    return this.transition('maintenance', 'idle');
  }

  private transition(from: MachineStatus, to: MachineStatus): Machine {
    if (this.status !== from) {
      throw new InvalidStateTransitionError('Machine', this.status, to);
    }
    return new Machine({ ...this.toSnapshot(), status: to });
  }

  private toSnapshot(): MachineSnapshot {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      locationId: this.locationId,
      status: this.status,
    };
  }

  private static build(snapshot: MachineSnapshot): Machine {
    return new Machine(snapshot);
  }
}
