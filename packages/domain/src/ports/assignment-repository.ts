import type { Assignment } from '../entities/assignment';
import type { AssignmentId, MachineId, WorkerId } from '../value-objects/ids';

/**
 * Persistencia de asignaciones horarias (docs/04, asignaciones). Las consultas
 * por worker/máquina existen para validar I1 (solapamiento) y armar agendas.
 * `findById` devuelve `null` cuando no hay coincidencia; `save` es upsert por `id`.
 */
export interface AssignmentRepository {
  findById(id: AssignmentId): Promise<Assignment | null>;
  findByWorker(workerId: WorkerId): Promise<readonly Assignment[]>;
  findByMachine(machineId: MachineId): Promise<readonly Assignment[]>;
  save(assignment: Assignment): Promise<void>;
  delete(id: AssignmentId): Promise<void>;
}
