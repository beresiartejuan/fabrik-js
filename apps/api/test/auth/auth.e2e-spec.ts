import { rmSync } from 'node:fs';
import { Worker, type WorkerRepository } from '@fabrik/domain';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import type { AuthConfig } from '../../src/auth/auth.config.js';
import { AUTH_CONFIG, CREDENTIAL_REPOSITORY } from '../../src/auth/auth.tokens.js';
import type { CredentialRepository } from '../../src/auth/credentials.repository.js';
import { signJwt } from '../../src/auth/jwt.js';
import { hashPassword } from '../../src/auth/password.js';
import { DB, WORKER_REPOSITORY } from '../../src/domain/tokens.js';
import { createTestDatabase, type TestDatabase } from '../persistence/test-db.js';

const ADMIN = { name: 'bootstrap-admin', password: 'admin-password' };
const AUDITOR = { name: 'auditor', password: 'auditor-password' };

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * E2E de la Fase 3 (criterio de salida en docs/09): bootstrap del admin por env,
 * login, llamada protegida (rol correcto 200 / rol incorrecto 403), sin token o
 * token vencido 401, y rotación/revocación de refresh tokens.
 *
 * La llamada protegida usa ya el recurso real `POST /materials` (Fase 4): con
 * `admin` devuelve 201 y con `auditor` fuerza un `UnauthorizedRoleError` del
 * dominio → 403. La antigua ruta de andamiaje `POST /dev/auth-smoke/materials` se
 * retiró al llegar los controladores de catálogo.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let testDb: TestDatabase;
  let authConfig: AuthConfig;
  let workers: WorkerRepository;
  let credentials: CredentialRepository;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'e2e-access-secret';
    process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret';
    process.env.BOOTSTRAP_ADMIN_NAME = ADMIN.name;
    process.env.BOOTSTRAP_ADMIN_PASSWORD = ADMIN.password;

    testDb = await createTestDatabase();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DB)
      .useValue(testDb.db)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authConfig = moduleFixture.get<AuthConfig>(AUTH_CONFIG);
    workers = moduleFixture.get<WorkerRepository>(WORKER_REPOSITORY);
    credentials = moduleFixture.get<CredentialRepository>(CREDENTIAL_REPOSITORY);

    // Auditor sembrado a mano: aún no hay endpoint de creación de workers (Fase 4).
    const auditor = Worker.create({ name: AUDITOR.name, role: 'auditor' });
    await workers.save(auditor);
    const now = new Date();
    await credentials.save({
      workerId: auditor.id,
      passwordHash: await hashPassword(AUDITOR.password),
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(async () => {
    await app.close();
    rmSync(testDb.dir, { recursive: true, force: true });
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.BOOTSTRAP_ADMIN_NAME;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  });

  async function login(name: string, password: string): Promise<Tokens> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ name, password })
      .expect(200);
    return response.body as Tokens;
  }

  it('GET /health sigue siendo público', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ ok: true });
  });

  it('el bootstrap por env crea el admin y permite el login', async () => {
    const tokens = await login(ADMIN.name, ADMIN.password);
    expect(tokens.accessToken).toBeTypeOf('string');
    expect(tokens.refreshToken).toBeTypeOf('string');
  });

  it('POST /auth/login con contraseña incorrecta → 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ name: ADMIN.name, password: 'mala' })
      .expect(401);
  });

  it('POST /auth/login sin password → 400 (zod)', async () => {
    await request(app.getHttpServer()).post('/auth/login').send({ name: ADMIN.name }).expect(400);
  });

  it('GET /auth/me sin token → 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('GET /auth/me con token inválido → 401', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer no-es-un-jwt')
      .expect(401);
  });

  it('GET /auth/me con access token vencido → 401', async () => {
    const expired = signJwt(
      { sub: 'cualquiera', role: 'admin', typ: 'access' },
      authConfig.accessSecret,
      { expiresInSeconds: -10 },
    );
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
  });

  it('GET /auth/me con token válido → 200 y el Actor', async () => {
    const { accessToken } = await login(ADMIN.name, ADMIN.password);
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(response.body).toMatchObject({ role: 'admin' });
    expect((response.body as { workerId: string }).workerId).toBeTypeOf('string');
  });

  it('rol correcto: admin crea material → 201', async () => {
    const { accessToken } = await login(ADMIN.name, ADMIN.password);
    const response = await request(app.getHttpServer())
      .post('/materials')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Harina', kind: 'supply', physicalState: 'solid', unitOfMeasure: 'kg' })
      .expect(201);
    expect(response.body).toMatchObject({ name: 'Harina', kind: 'supply', active: true });
  });

  it('rol incorrecto: auditor crea material → 403 (UnauthorizedRoleError)', async () => {
    const { accessToken } = await login(AUDITOR.name, AUDITOR.password);
    const response = await request(app.getHttpServer())
      .post('/materials')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Harina', kind: 'supply', physicalState: 'solid', unitOfMeasure: 'kg' })
      .expect(403);
    expect(response.body).toMatchObject({ statusCode: 403, error: 'UnauthorizedRoleError' });
  });

  it('el refresh rota el token y el reuso del viejo invalida toda la cadena (401)', async () => {
    const first = await login(ADMIN.name, ADMIN.password);
    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);
    const second = rotated.body as Tokens;

    // Replay del token ya rotado → 401 (detección de reuso).
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);

    // Contención: la cadena entera del worker quedó revocada, incluido el refresh
    // legítimo recién emitido.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: second.refreshToken })
      .expect(401);
  });

  it('logout revoca los refresh del worker (401 al refrescar después)', async () => {
    const { accessToken, refreshToken } = await login(ADMIN.name, ADMIN.password);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
    await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken }).expect(401);
  });

  it('POST /auth/logout sin token → 401', async () => {
    await request(app.getHttpServer()).post('/auth/logout').expect(401);
  });
});
