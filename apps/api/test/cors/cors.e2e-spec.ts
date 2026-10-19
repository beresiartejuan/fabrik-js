import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createE2EApp, type E2EContext } from '../support/e2e-app.js';

/**
 * E2E de CORS (post-plan, resuelve el riesgo de `docs/arquitectura.md`).
 *
 * El helper e2e monta **la misma** `enableCors` que `main.ts`, así que este spec
 * cubre la configuración real (no una copia). Se fija `CORS_ORIGINS` con dos
 * orígenes separados por coma para verificar el parseo, que un origen configurado
 * recibe `Access-Control-Allow-Origin` en preflight y en respuesta simple, y que
 * uno no configurado no lo recibe.
 */

const FIRST = 'http://localhost:3000';
const SECOND = 'http://app.example.test';
const UNCONFIGURED = 'http://evil.example.test';

describe('CORS (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    process.env.CORS_ORIGINS = `${FIRST}, ${SECOND}`;
    ctx = await createE2EApp();
  });

  afterAll(async () => {
    await ctx.close();
    delete process.env.CORS_ORIGINS;
  });

  it('un preflight de un origen configurado responde 204 con ACAO', async () => {
    const response = await request(ctx.app.getHttpServer())
      .options('/batches')
      .set('Origin', FIRST)
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(FIRST);
  });

  it('una respuesta simple lleva ACAO para un origen configurado', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/health')
      .set('Origin', SECOND)
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(SECOND);
  });

  it('un origen no configurado no recibe ACAO', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/health')
      .set('Origin', UNCONFIGURED)
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
