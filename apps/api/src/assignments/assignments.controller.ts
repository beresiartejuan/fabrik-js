import {
  type Actor,
  AssignmentId,
  AssignWorkerToMachine,
  MachineId,
  TimeSlot,
  UnassignWorker,
  WorkerId,
} from '@fabrik/domain';
import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { Actor as ActorParam } from '../auth/actor.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

import {
  type AssignmentResponse,
  type CreateAssignmentDto,
  CreateAssignmentSchema,
  serializeAssignment,
} from './assignments.dto.js';

/**
 * Asignaciones horarias trabajador ↔ máquina (Fase 4, docs/09). RBAC en el
 * dominio (`admin` escribe; `admin`/`auditor` leen).
 *
 * `POST /assignments` valida I1 en el caso de uso: si el worker ya tiene una
 * franja solapada, `OverlappingScheduleError` → 409. `DELETE /assignments/:id`
 * mapea a `UnassignWorker` (borrado real de la asignación, no baja lógica) y
 * devuelve 204.
 */
@Controller('assignments')
export class AssignmentsController {
  constructor(
    private readonly assignWorkerToMachine: AssignWorkerToMachine,
    private readonly unassignWorker: UnassignWorker,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @ActorParam() actor: Actor,
    @Body(new ZodValidationPipe(CreateAssignmentSchema)) body: CreateAssignmentDto,
  ): Promise<AssignmentResponse> {
    const assignment = await this.assignWorkerToMachine.execute(actor, {
      workerId: WorkerId.from(body.workerId),
      machineId: MachineId.from(body.machineId),
      slot: TimeSlot.create(body.slot.daysOfWeek, body.slot.start, body.slot.end),
    });
    return serializeAssignment(assignment);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@ActorParam() actor: Actor, @Param('id') id: string): Promise<void> {
    await this.unassignWorker.execute(actor, { assignmentId: AssignmentId.from(id) });
  }
}
