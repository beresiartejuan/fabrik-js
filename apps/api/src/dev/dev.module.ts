import { Module } from '@nestjs/common';

import { DomainModule } from '../domain/domain.module.js';

import { AuthSmokeController } from './auth-smoke.controller.js';

/**
 * Módulo de andamiaje de la Fase 3: controladores que ejecutan casos de uso reales
 * para probar la cadena auth → guard → dominio → HTTP mientras la Fase 4 no trae
 * los recursos REST definitivos. Ver `auth-smoke.controller.ts` para la decisión
 * de mantenerlo.
 */
@Module({
  imports: [DomainModule],
  controllers: [AuthSmokeController],
})
export class DevModule {}
