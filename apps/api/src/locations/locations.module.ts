import { Module } from '@nestjs/common';

import { DomainModule } from '../domain/domain.module.js';

import { LocationsController } from './locations.controller.js';

/** Módulo del recurso `locations` (Fase 4). */
@Module({
  imports: [DomainModule],
  controllers: [LocationsController],
})
export class LocationsModule {}
