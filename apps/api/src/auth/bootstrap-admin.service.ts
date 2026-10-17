import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Worker, type WorkerRepository } from '@fabrik/domain';

import { WORKER_REPOSITORY } from '../domain/tokens.js';

import { AUTH_CONFIG, CREDENTIAL_REPOSITORY } from './auth.tokens.js';
import type { AuthConfig } from './auth.config.js';
import type { CredentialRepository } from './credentials.repository.js';
import { hashPassword } from './password.js';

/**
 * Bootstrap de un admin de desarrollo/e2e a partir de `BOOTSTRAP_ADMIN_NAME` +
 * `BOOTSTRAP_ADMIN_PASSWORD` (Fase 3).
 *
 * Corre en `onApplicationBootstrap` (después de que `DbLifecycle` haya aplicado
 * las migraciones) y es **idempotente**: si ya existe un worker con ese nombre, no
 * lo toca; si existe pero no tiene credencial, se la crea. Es el mecanismo más
 * simple para tener un usuario con el que probar login sin escribir un seeder
 * completo (eso llega en la Fase 7). En producción se puede omitir y sembrar por
 * otra vía.
 */
@Injectable()
export class BootstrapAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(WORKER_REPOSITORY) private readonly workers: WorkerRepository,
    @Inject(CREDENTIAL_REPOSITORY) private readonly credentials: CredentialRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const admin = this.config.bootstrapAdmin;
    if (!admin) {
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      this.logger.warn(
        'Bootstrap de admin activo en producción (`BOOTSTRAP_ADMIN_*`): desactívalo y siembra el admin por otra vía.',
      );
    }

    const existing = (await this.workers.list()).find((worker) => worker.name === admin.name);
    const worker = existing ?? Worker.create({ name: admin.name, role: 'admin' });
    if (!existing) {
      await this.workers.save(worker);
    }

    const credential = await this.credentials.findByWorkerId(worker.id);
    if (!credential) {
      const now = new Date();
      await this.credentials.save({
        workerId: worker.id,
        passwordHash: await hashPassword(admin.password),
        createdAt: now,
        updatedAt: now,
      });
      this.logger.log(`Admin de bootstrap creado: "${admin.name}" (${worker.id})`);
    }
  }
}
