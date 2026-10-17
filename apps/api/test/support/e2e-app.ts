import { rmSync } from 'node:fs';
import { Worker, type WorkerRepository } from '@fabrik/domain';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { AppModule } from '../../src/app.module.js';
import { CREDENTIAL_REPOSITORY } from '../../src/auth/auth.tokens.js';
import type { CredentialRepository } from '../../src/auth/credentials.repository.js';
import { hashPassword } from '../../src/auth/password.js';
import { enableCors } from '../../src/common/cors.js';
import { DB, WORKER_REPOSITORY } from '../../src/domain/tokens.js';
import { createTestDatabase, type TestDatabase } from '../persistence/test-db.js';

/**
 * Bootstrap compartido de los e2e de la Fase 4.
 *
 * Reutiliza el patrón del e2e de auth (Fase 3): base SQLite temporal por archivo
 * de test, `AppModule` real con solo `DB` sustituida, admin por env
 * (`BOOTSTRAP_ADMIN_NAME`/`PASSWORD`), y login real por `POST /auth/login`.
 *
 * Añade lo que la Fase 4 ya permite: siembra un `worker` y un `auditor` (worker +
 * credencial) para poder probar los 403 por rol y las lecturas de auditor. Antes
 * de la Fase 4 esto se hacía a mano en cada spec; ahora vive aquí.
 */

export const ADMIN = {
  name: 'bootstrap-admin',
  password: 'admin-password',
} as const;
export const WORKER = { name: 'worker', password: 'worker-password' } as const;
export const AUDITOR = {
  name: 'auditor',
  password: 'auditor-password',
} as const;

export interface Tokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface E2EContext {
  readonly app: INestApplication<App>;
  readonly testDb: TestDatabase;
  readonly module: TestingModule;
  /** Access tokens listos para usar, por rol sembrado. */
  readonly tokens: {
    readonly admin: string;
    readonly worker: string;
    readonly auditor: string;
  };
  login(name: string, password: string): Promise<Tokens>;
  /** Cabecera `Authorization` para un rol sembrado. */
  auth(role: keyof E2EContext['tokens']): string;
  close(): Promise<void>;
}

export interface E2EOptions {
  /**
   * Hook de la app **antes** de `init()`. Necesario para lo que registra rutas en
   * el adaptador HTTP (p. ej. `SwaggerModule.setup`, que debe correr antes de que
   * el servidor quede montado).
   */
  beforeInit?(app: INestApplication<App>): void;
}

export async function createE2EApp(options: E2EOptions = {}): Promise<E2EContext> {
  process.env.JWT_ACCESS_SECRET = 'e2e-access-secret';
  process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret';
  process.env.BOOTSTRAP_ADMIN_NAME = ADMIN.name;
  process.env.BOOTSTRAP_ADMIN_PASSWORD = ADMIN.password;
  // Tests deterministas de la ventana I3: el e2e puede inyectar `timestamp` en
  // `POST /production/transform`. En producción/desarrollo el flag está apagado.
  process.env.FABRIK_ALLOW_CLIENT_TIMESTAMP = 'true';

  const testDb = await createTestDatabase();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DB)
    .useValue(testDb.db)
    .compile();

  const app = module.createNestApplication();
  // Misma política CORS que `main.ts` (config real, no una copia en tests).
  enableCors(app);
  options.beforeInit?.(app);
  await app.init();

  const workers = module.get<WorkerRepository>(WORKER_REPOSITORY);
  const credentials = module.get<CredentialRepository>(CREDENTIAL_REPOSITORY);
  for (const seed of [
    { ...WORKER, role: 'worker' as const },
    { ...AUDITOR, role: 'auditor' as const },
  ]) {
    const worker = Worker.create({ name: seed.name, role: seed.role });
    await workers.save(worker);
    const now = new Date();
    await credentials.save({
      workerId: worker.id,
      passwordHash: await hashPassword(seed.password),
      createdAt: now,
      updatedAt: now,
    });
  }

  const login = async (name: string, password: string): Promise<Tokens> => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ name, password })
      .expect(200);
    return response.body as Tokens;
  };

  const tokens = {
    admin: (await login(ADMIN.name, ADMIN.password)).accessToken,
    worker: (await login(WORKER.name, WORKER.password)).accessToken,
    auditor: (await login(AUDITOR.name, AUDITOR.password)).accessToken,
  };

  return {
    app,
    testDb,
    module,
    tokens,
    login,
    auth(role) {
      return `Bearer ${tokens[role]}`;
    },
    async close() {
      await app.close();
      rmSync(testDb.dir, { recursive: true, force: true });
      delete process.env.JWT_ACCESS_SECRET;
      delete process.env.JWT_REFRESH_SECRET;
      delete process.env.BOOTSTRAP_ADMIN_NAME;
      delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
      delete process.env.FABRIK_ALLOW_CLIENT_TIMESTAMP;
    },
  };
}
