import { WorkerId } from '../value-objects/ids';

// Rol de identidad del trabajador; la autorización ocurre en los use cases (docs/02).
export type WorkerRole = 'admin' | 'worker' | 'auditor';

export interface WorkerProps {
  readonly name: string;
  readonly role: WorkerRole;
  readonly active?: boolean;
}

export interface WorkerSnapshot extends WorkerProps {
  readonly id: WorkerId;
}

/**
 * Trabajador. Patrón de mutación: entidad inmutable con métodos que devuelven
 * una instancia nueva (activar/desactivar son idempotentes).
 */
export class Worker {
  readonly id: WorkerId;
  readonly name: string;
  readonly role: WorkerRole;
  readonly active: boolean;

  private constructor(snapshot: WorkerSnapshot) {
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.role = snapshot.role;
    this.active = snapshot.active ?? true;
    Object.freeze(this);
  }

  /** Crea un worker nuevo (id autogenerado, `active` por defecto). */
  static create(props: WorkerProps): Worker {
    return Worker.build({ ...props, id: WorkerId.create() });
  }

  /** Reconstituye un worker ya persistido. */
  static fromPersistence(snapshot: WorkerSnapshot): Worker {
    return Worker.build(snapshot);
  }

  activate(): Worker {
    return this.active ? this : new Worker({ ...this.toSnapshot(), active: true });
  }

  deactivate(): Worker {
    return this.active ? new Worker({ ...this.toSnapshot(), active: false }) : this;
  }

  isAdmin(): boolean {
    return this.role === 'admin';
  }

  isWorker(): boolean {
    return this.role === 'worker';
  }

  isAuditor(): boolean {
    return this.role === 'auditor';
  }

  private toSnapshot(): WorkerSnapshot {
    return { id: this.id, name: this.name, role: this.role, active: this.active };
  }

  private static build(snapshot: WorkerSnapshot): Worker {
    return new Worker(snapshot);
  }
}
