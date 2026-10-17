import { NestFactory } from '@nestjs/core';
import { type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import { enableCors } from './common/cors.js';
import { buildOpenApiDocument } from './openapi/openapi.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS para `apps/web` (Next, otro origen): lista blanca por `CORS_ORIGINS`
  // (coma-separada) con default `http://localhost:3000`. Sin credenciales (Bearer,
  // no cookies). Misma política que usan los e2e vía `enableCors`.
  enableCors(app);

  // OpenAPI en `/docs` (UI) y `/docs-json` (documento). El documento se genera
  // desde los DTOs zod (ver `src/openapi/openapi.ts`); @nestjs/swagger solo sirve.
  // No requiere base de datos.
  SwaggerModule.setup('docs', app, buildOpenApiDocument() as unknown as OpenAPIObject);

  // Habilita los hooks de apagado de Nest: SIGTERM/SIGINT disparan
  // `onModuleDestroy`, con lo que `DbLifecycle` cierra la conexión Turso.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
