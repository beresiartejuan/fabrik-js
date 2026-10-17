import { Module } from '@nestjs/common';

import { DomainModule } from '../domain/domain.module.js';

import { AssignmentsController } from './assignments.controller.js';
import { ScheduleController } from './schedule.controller.js';

/** Módulo de asignaciones y agendas (Fase 4). */
@Module({
  imports: [DomainModule],
  controllers: [AssignmentsController, ScheduleController],
})
export class AssignmentsModule {}
