import { NestFactory } from '@nestjs/core';
import { type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import { buildOpenApiDocument } from './openapi/openapi.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
