import { Controller, Get, Param } from '@nestjs/common';
import {
  ListMachineSchedule,
  ListWorkerSchedule,
  MachineId,
  WorkerId,
  type Actor,
} from '@fabrik/domain';

import { Actor as ActorParam } from '../auth/actor.decorator.js';

import { serializeAssignment, type AssignmentResponse } from './assignments.dto.js';

/**
 * Agendas (Fase 4, docs/09): endpoints anidados bajo el recurso al que pertenecen
 * (`GET /workers/:id/schedule`, `GET /machines/:id/schedule`).
 *
 * Se registran en el módulo de asignaciones (no en `WorkersModule`/`MachinesModule`)
 * porque dependen de los casos de uso de asignaciones; viven en un controlador sin
 * prefijo porque REST los anida bajo `workers`/`machines`. Ambos casos de uso
 * validan que el worker/máquina exista (`NotFoundError` → 404) antes de devolver
 * la agenda.
 */
@Controller()
export class ScheduleController {
  constructor(
    private readonly listWorkerSchedule: ListWorkerSchedule,
    private readonly listMachineSchedule: ListMachineSchedule,
  ) {}

  @Get('workers/:id/schedule')
  async workerSchedule(
    @ActorParam() actor: Actor,
    @Param('id') id: string,
  ): Promise<AssignmentResponse[]> {
    const assignments = await this.listWorkerSchedule.execute(actor, {
      workerId: WorkerId.from(id),
    });
    return assignments.map(serializeAssignment);
  }

  @Get('machines/:id/schedule')
  async machineSchedule(
    @ActorParam() actor: Actor,
    @Param('id') id: string,
  ): Promise<AssignmentResponse[]> {
    const assignments = await this.listMachineSchedule.execute(actor, {
      machineId: MachineId.from(id),
    });
    return assignments.map(serializeAssignment);
  }
}
