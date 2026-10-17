import { type Actor, ListWorkerSchedule, type MachineRepository } from '@fabrik/domain';
import { Controller, Get, Inject } from '@nestjs/common';

import { type AssignmentResponse, serializeAssignment } from '../assignments/assignments.dto.js';
import { Actor as ActorParam } from '../auth/actor.decorator.js';
import { MACHINE_REPOSITORY } from '../domain/tokens.js';
import { serializeMachine } from '../machines/machines.dto.js';

import type { MeScheduleItemResponse } from './me.dto.js';

/**
 * Endpoints del **propio** actor autenticado (post-plan).
 *
 * `GET /me/schedule` resuelve el `workerId` exclusivamente del `Actor` que dejó
 * `ActorGuard`: el cliente no puede pedir la agenda de otra persona por esta ruta
 * (el caso de uso `ListWorkerSchedule` además lo revalida para el rol `worker`).
 * Cualquier rol autenticado puede consultar la suya (`admin`, `auditor`,
 * `worker`): la agenda de un admin/auditor suele estar vacía, pero el contrato es
 * uniforme.
 *
 * **Enriquecimiento de máquina.** El controlador inyecta el puerto
 * `MachineRepository` directamente para resolver nombre/tipo/estado de cada
 * asignación. Se descartó `ListMachines` porque exige rol `admin`/`auditor` (un
 * `worker` recibiría 403 al consultar su propia agenda) y porque aquí no se
 * necesita ninguna regla de negocio: es una lectura de apoyo para serializar la
 * respuesta. También se descartó un caso de uso nuevo para no ampliar el dominio
 * por un detalle de presentación; si esta lectura creciera, el paso natural es un
 * use case específico.
 */
@Controller('me')
export class MeController {
  constructor(
    private readonly listWorkerSchedule: ListWorkerSchedule,
    @Inject(MACHINE_REPOSITORY) private readonly machines: MachineRepository,
  ) {}

  @Get('schedule')
  async schedule(@ActorParam() actor: Actor): Promise<MeScheduleItemResponse[]> {
    const now = new Date();
    const assignments = await this.listWorkerSchedule.execute(actor, {
      workerId: actor.workerId,
    });

    // Una sola lectura del catálogo de máquinas (las agendas son pequeñas) en vez
    // de N+1 `findById`; los ids de asignación siempre referencian máquinas
    // existentes, pero el contrato admite `machine: null` si el dato estuviera
    // huérfano.
    const machines = await this.machines.list();
    const machinesById = new Map(machines.map((machine) => [machine.id, machine]));

    return assignments.map((assignment) => {
      const machine = machinesById.get(assignment.machineId);
      const wire: AssignmentResponse = serializeAssignment(assignment);
      return {
        ...wire,
        machine: machine ? serializeMachine(machine) : null,
        // Evaluado con el mismo `now` para todos los ítems de la respuesta.
        activeNow: assignment.slot.contains(now),
      };
    });
  }
}
