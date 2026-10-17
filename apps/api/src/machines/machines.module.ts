import { Module } from '@nestjs/common';

import { DomainModule } from '../domain/domain.module.js';

import { MachinesController } from './machines.controller.js';

/** Módulo del recurso `machines` (Fase 4). */
@Module({
  imports: [DomainModule],
  controllers: [MachinesController],
})
export class MachinesModule {}
