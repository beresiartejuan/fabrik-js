import { describe, expect, it } from 'vitest';

import { OPENAPI_ROUTES, buildOpenApiDocument } from './openapi.js';

/**
 * El documento OpenAPI se genera desde los schemas zod. Este test fija la forma
 * mínima (info, seguridad, rutas y cuerpos) sin levantar la app; el e2e
 * `test/openapi/openapi.e2e-spec.ts` comprueba además que `/docs-json` responde y
 * que la tabla de rutas cubre **todas** las rutas montadas por Nest.
 */

/** Vista laxa del documento para inspeccionarlo sin pelear con las uniones. */
interface OperationView {
  summary?: string;
  tags?: string[];
  responses?: Record<string, unknown>;
  parameters?: unknown[];
  requestBody?: {
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
}
type PathItemView = Record<string, OperationView | undefined>;

describe('buildOpenApiDocument', () => {
  const document = buildOpenApiDocument();
  const paths = document.paths as unknown as Record<string, PathItemView>;

  it('declara versión, título y esquema Bearer JWT', () => {
    expect(document.openapi).toBe('3.0.0');
    expect(document.info.title).toBe('fabrik-api');
    expect(document.info.version).toBe('0.0.1');
    expect(document.components?.securitySchemes?.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
    expect(document.security).toContainEqual({ bearerAuth: [] });
  });

  it('expone todas las rutas de la tabla con respuesta y resumen', () => {
    // `paths` agrupa por path único; se cuentan las operaciones (método + path).
    const operations = Object.values(paths).flatMap((item) =>
      Object.keys(item).filter((key) => key !== 'parameters'),
    );
    expect(operations).toHaveLength(OPENAPI_ROUTES.length);
    for (const route of OPENAPI_ROUTES) {
      const operation = paths[route.path]?.[route.method];
      expect(operation, `${route.method} ${route.path}`).toBeDefined();
      expect(operation?.summary, `${route.method} ${route.path}`).toBeTruthy();
      expect(operation?.tags, `${route.method} ${route.path}`).toEqual(
        route.tags,
      );
      expect(Object.keys(operation?.responses ?? {}).length).toBeGreaterThan(0);
    }
  });

  it('marca como públicas (sin seguridad) las rutas @Public()', () => {
    for (const path of ['/health', '/auth/login', '/auth/refresh']) {
      expect(
        paths[path]?.get?.summary ?? paths[path]?.post?.summary,
      ).toBeTruthy();
      expect(paths[path]?.get ?? paths[path]?.post).toMatchObject({
        security: [],
      });
    }
  });

  it('documenta los cuerpos desde los schemas zod (sin duplicar la forma)', () => {
    const materialBody =
      paths['/materials']?.post?.requestBody?.content?.['application/json']
        ?.schema;
    expect(materialBody).toMatchObject({ type: 'object' });
    expect(materialBody).toHaveProperty('properties.kind.enum');

    const transformBody =
      paths['/production/transform']?.post?.requestBody?.content?.[
        'application/json'
      ]?.schema;
    expect(transformBody).toHaveProperty('properties.machineId');
    // El `workerId` sale del Actor, nunca del cuerpo (endurecimiento de Fase 5).
    expect(transformBody).not.toHaveProperty('properties.workerId');

    expect(paths['/batch-events']?.get?.parameters).toBeDefined();
  });

  it('agrupa por recurso en tags', () => {
    expect(document.tags?.map((tag) => tag.name)).toEqual([
      'health',
      'auth',
      'materials',
      'locations',
      'machines',
      'workers',
      'recipes',
      'assignments',
      'supplies',
      'production',
      'stock',
      'trace',
      'batch-events',
    ]);
  });
});
