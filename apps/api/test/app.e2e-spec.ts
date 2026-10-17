import { rmSync } from 'node:fs';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';
import { DB } from '../src/domain/tokens.js';
import { createTestDatabase, type TestDatabase } from './persistence/test-db.js';

describe('App (e2e)', () => {
  let app: INestApplication<App>;
  let testDb: TestDatabase;

  beforeEach(async () => {
    // Base temporal por test: `DbLifecycle` aplica migraciones y la cierra al
    // cerrar la app, así que la conexión de la app es la de este archivo.
    testDb = await createTestDatabase();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DB)
      .useValue(testDb.db)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect({ ok: true });
  });

  afterEach(async () => {
    await app.close();
    rmSync(testDb.dir, { recursive: true, force: true });
  });
});
