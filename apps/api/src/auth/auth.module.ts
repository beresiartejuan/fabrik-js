import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { DomainModule } from '../domain/domain.module.js';
import { DB } from '../domain/tokens.js';
import type { Db } from '../persistence/index.js';

import { ActorGuard } from './actor.guard.js';
import { resolveAuthConfig } from './auth.config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AUTH_CONFIG, CREDENTIAL_REPOSITORY, REFRESH_TOKEN_REPOSITORY } from './auth.tokens.js';
import { BootstrapAdminService } from './bootstrap-admin.service.js';
import { DrizzleCredentialRepository } from './credentials.repository.js';
import { DrizzleRefreshTokenRepository } from './refresh-token.repository.js';

/**
 * Módulo de auth (Fase 3, docs/09).
 *
 * - Importa `DomainModule` (conexión `DB`, `WorkerRepository`, casos de uso) y
 *   re-exporta `DomainModule` para que quien importe `AuthModule` (p. ej.
 *   `AppModule`, o la Fase 4) siga teniendo el dominio.
 * - Provee la configuración (`AUTH_CONFIG`) resuelta del entorno y los dos
 *   repositorios de auth (credenciales y refresh tokens) sobre la misma `DB`.
 * - Registra `ActorGuard` como **guard global** (`APP_GUARD`): así ninguna ruta es
 *   pública por descuido; las que deben serlo llevan `@Public()`.
 * - `BootstrapAdminService` siembra el admin de desarrollo/e2e si el entorno lo pide.
 */
@Module({
  imports: [DomainModule],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => resolveAuthConfig() },
    {
      provide: CREDENTIAL_REPOSITORY,
      useFactory: (db: Db) => new DrizzleCredentialRepository(db),
      inject: [DB],
    },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useFactory: (db: Db) => new DrizzleRefreshTokenRepository(db),
      inject: [DB],
    },
    AuthService,
    BootstrapAdminService,
    { provide: APP_GUARD, useClass: ActorGuard },
  ],
  exports: [
    DomainModule,
    AUTH_CONFIG,
    CREDENTIAL_REPOSITORY,
    REFRESH_TOKEN_REPOSITORY,
    AuthService,
  ],
})
export class AuthModule {}
