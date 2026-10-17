import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AssignmentsModule } from './assignments/assignments.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BatchEventsModule } from './batch-events/batch-events.module.js';
import { BatchesModule } from './batches/batches.module.js';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter.js';
import { DomainModule } from './domain/domain.module.js';
import { HealthController } from './health/health.controller.js';
import { LocationsModule } from './locations/locations.module.js';
import { MachinesModule } from './machines/machines.module.js';
import { MaterialsModule } from './materials/materials.module.js';
import { MeModule } from './me/me.module.js';
import { ProductionModule } from './production/production.module.js';
import { RecipesModule } from './recipes/recipes.module.js';
import { StockModule } from './stock/stock.module.js';
import { SuppliesModule } from './supplies/supplies.module.js';
import { TraceModule } from './trace/trace.module.js';
import { WorkersModule } from './workers/workers.module.js';

@Module({
  imports: [
    DomainModule,
    AuthModule,
    MaterialsModule,
    LocationsModule,
    MachinesModule,
    WorkersModule,
    RecipesModule,
    AssignmentsModule,
    MeModule,
    SuppliesModule,
    ProductionModule,
    StockModule,
    TraceModule,
    BatchEventsModule,
    BatchesModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
