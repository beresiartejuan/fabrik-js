import { Module } from '@nestjs/common';

import { DomainModule } from '../domain/domain.module.js';

import { MaterialsController } from './materials.controller.js';

/** Módulo del recurso `materials` (Fase 4). Los casos de uso vienen de `DomainModule`. */
@Module({
  imports: [DomainModule],
  controllers: [MaterialsController],
})
export class MaterialsModule {}
