import { Module } from '@nestjs/common';

import { DomainModule } from '../domain/domain.module.js';

import { BatchEventsController } from './batch-events.controller.js';

/**
 * Módulo del recurso `batch-events` (Fase 6). Los casos de uso vienen de
 * `DomainModule`.
 */
@Module({
  imports: [DomainModule],
  controllers: [BatchEventsController],
})
export class BatchEventsModule {}
