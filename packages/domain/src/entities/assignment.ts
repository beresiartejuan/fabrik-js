import { AssignmentId, MachineId, WorkerId } from '../value-objects/ids';
import type { TimeSlot } from '../value-objects/time-slot';

export interface AssignmentProps {
  readonly workerId: WorkerId;
  readonly machineId: MachineId;
  readonly slot: TimeSlot;
}

export interface AssignmentSnapshot extends AssignmentProps {
  readonly id: AssignmentId;
}

/**
 * Asignación horaria trabajador ↔ máquina (docs/02). Inmutable. El invariante I1
 * (solapamiento entre asignaciones del mismo worker) lo decide el use case; aquí
 * solo se expone el helper puro `overlapsWith`.
 */
export class Assignment {
  readonly id: AssignmentId;
  readonly workerId: WorkerId;
  readonly machineId: MachineId;
  readonly slot: TimeSlot;

  private constructor(snapshot: AssignmentSnapshot) {
    this.id = snapshot.id;
    this.workerId = snapshot.workerId;
    this.machineId = snapshot.machineId;
    this.slot = snapshot.slot;
    Object.freeze(this);
  }

  /** Crea una asignación nueva (id autogenerado). */
  static create(props: AssignmentProps): Assignment {
    return Assignment.build({ ...props, id: AssignmentId.create() });
  }

  /** Reconstituye una asignación ya persistida. */
  static fromPersistence(snapshot: AssignmentSnapshot): Assignment {
    return Assignment.build(snapshot);
  }

  /** Indica si esta asignación solapa en horario con otra. */
  overlapsWith(other: Assignment): boolean {
    return this.slot.overlaps(other.slot);
  }

  /** Indica si la asignación pertenece al worker indicado. */
  isForWorker(workerId: WorkerId): boolean {
    return this.workerId === workerId;
  }

  private static build(snapshot: AssignmentSnapshot): Assignment {
    return new Assignment(snapshot);
  }
}
