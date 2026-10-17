import { Module } from '@nestjs/common';

import { DomainModule } from '../domain/domain.module.js';

import { TraceController } from './trace.controller.js';

/** Módulo del recurso `trace` (Fase 6). Los casos de uso vienen de `DomainModule`. */
@Module({
  imports: [DomainModule],
  controllers: [TraceController],
})
export class TraceModule {}
