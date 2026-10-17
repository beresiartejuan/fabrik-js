import { Module } from '@nestjs/common';

import { DomainModule } from '../domain/domain.module.js';

import { BatchesController } from './batches.controller.js';

/**
 * Módulo del recurso `batches` (post-plan). Los casos de uso vienen de
 * `DomainModule`.
 */
@Module({
  imports: [DomainModule],
  controllers: [BatchesController],
})
export class BatchesModule {}
