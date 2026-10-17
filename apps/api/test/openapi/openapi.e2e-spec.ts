import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';

import {
  buildOpenApiDocument,
  OPENAPI_ROUTES,
} from '../../src/openapi/openapi.js';
import { createE2EApp, type E2EContext } from '../support/e2e-app.js';

/**
 * Verifica el montaje real del `SwaggerModule`: `/docs-json` sirve el documento
 * generado desde zod y `/docs` sirve la UI. Además contrasta la tabla
 * `OPENAPI_ROUTES` con las rutas que Nest monta de verdad (anti-drift): si se
 * añade un endpoint sin documentarlo, este test falla.
 *
 * `SwaggerModule.setup` se registra en el hook `beforeInit` porque el adaptador
 * HTTP ya no acepta rutas nuevas una vez que la app quedó inicializada.
 */
describe('OpenAPI (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await createE2EApp({
      beforeInit: (app) =>
        SwaggerModule.setup(
          'docs',
          app,
          buildOpenApiDocument() as unknown as OpenAPIObject,
        ),
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('sirve el documento en /docs-json', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(response.body).toMatchObject({
      openapi: '3.0.0',
      info: { title: 'fabrik-api' },
    });
    expect(response.body.paths).toHaveProperty('/health');
    expect(response.body.paths).toHaveProperty('/materials');
    expect(response.body.paths).toHaveProperty('/production/transform');
    expect(response.body.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('sirve la UI en /docs', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/docs')
      .redirects(1);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
  });

  it('la tabla OPENAPI_ROUTES cubre todas las rutas montadas por Nest (anti-drift)', () => {
    const mounted = collectMountedRoutes(ctx);
    const documented = OPENAPI_ROUTES.map(
      (route) => `${route.method.toUpperCase()} ${route.path}`,
    );

    expect(new Set(documented)).toEqual(new Set(mounted));
  });
});

interface RouterRoute {
  readonly path?: string;
  readonly methods?: Record<string, boolean>;
}

interface RouterLayer {
  readonly route?: RouterRoute;
  readonly handle?: { readonly stack?: RouterLayer[] };
}

/**
 * Enumera método + path de las rutas que el adaptador Express tiene montadas. Se
 * excluyen las rutas propias de Swagger (`/docs*`) y se convierten los parámetros
 * de Express (`:id`) a la forma OpenAPI (`{id}`).
 */
function collectMountedRoutes(ctx: E2EContext): string[] {
  const express = ctx.app.getHttpAdapter().getInstance() as {
    router?: { stack: RouterLayer[] };
  };
  const routes: string[] = [];

  const visit = (layers: RouterLayer[]): void => {
    for (const layer of layers) {
      if (layer.route?.path && layer.route.methods) {
        const path = layer.route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
        if (path.startsWith('/docs')) {
          continue;
        }
        for (const method of Object.keys(layer.route.methods)) {
          routes.push(`${method.toUpperCase()} ${path}`);
        }
      } else if (layer.handle?.stack) {
        visit(layer.handle.stack);
      }
    }
  };

  if (express.router) {
    visit(express.router.stack);
  }
  return routes;
}
