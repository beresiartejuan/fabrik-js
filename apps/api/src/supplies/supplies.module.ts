import { Module } from '@nestjs/common';

import { DomainModule } from '../domain/domain.module.js';

import { SuppliesController } from './supplies.controller.js';

/** Módulo del recurso `supplies` (Fase 5). Los casos de uso vienen de `DomainModule`. */
@Module({
  imports: [DomainModule],
  controllers: [SuppliesController],
})
export class SuppliesModule {}
