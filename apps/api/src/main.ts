import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Habilita los hooks de apagado de Nest: SIGTERM/SIGINT disparan
  // `onModuleDestroy`, con lo que `DbLifecycle` cierra la conexión Turso.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
