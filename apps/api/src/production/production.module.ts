import { Module } from '@nestjs/common';

import { DomainModule } from '../domain/domain.module.js';

import { ProductionController } from './production.controller.js';

/**
 * Módulo del recurso `production` (Fase 5). Los casos de uso vienen de `DomainModule`,
 * que también re-exporta los repositorios (`BatchRepository` incluido) que el
 * controlador usa para resolver los lotes de output de una transformación.
 */
@Module({
  imports: [DomainModule],
  controllers: [ProductionController],
})
export class ProductionModule {}
