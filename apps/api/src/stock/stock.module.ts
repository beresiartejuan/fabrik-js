import { Module } from '@nestjs/common';

import { DomainModule } from '../domain/domain.module.js';

import { StockController } from './stock.controller.js';

/** Módulo del recurso `stock` (Fase 5). Los casos de uso vienen de `DomainModule`. */
@Module({
  imports: [DomainModule],
  controllers: [StockController],
})
export class StockModule {}
