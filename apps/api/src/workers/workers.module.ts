import { Module } from '@nestjs/common';

import { DomainModule } from '../domain/domain.module.js';

import { WorkersController } from './workers.controller.js';

/** Módulo del recurso `workers` (Fase 4). */
@Module({
  imports: [DomainModule],
  controllers: [WorkersController],
})
export class WorkersModule {}
