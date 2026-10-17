import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AuthModule } from './auth/auth.module.js';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter.js';
import { DevModule } from './dev/dev.module.js';
import { DomainModule } from './domain/domain.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [DomainModule, AuthModule, DevModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
