import { Module } from '@nestjs/common';

import { DomainModule } from '../domain/domain.module.js';

import { MeController } from './me.controller.js';

/**
 * Módulo de rutas del actor autenticado (`/me/*`, post-plan). `DomainModule`
 * aporta `ListWorkerSchedule` y el `MachineRepository` que el controlador usa
 * para enriquecer la agenda.
 */
@Module({
  imports: [DomainModule],
  controllers: [MeController],
})
export class MeModule {}
