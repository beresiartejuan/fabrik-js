import { Module } from '@nestjs/common';

import { DomainModule } from '../domain/domain.module.js';

import { RecipesController } from './recipes.controller.js';

/** Módulo del recurso `recipes` (Fase 4). */
@Module({
  imports: [DomainModule],
  controllers: [RecipesController],
})
export class RecipesModule {}
