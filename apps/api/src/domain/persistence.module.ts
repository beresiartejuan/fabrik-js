import {
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import {
  applyMigrations,
  closeDb,
  createDb,
  type Db,
  DrizzleAssignmentRepository,
  DrizzleBatchEventRepository,
  DrizzleBatchRepository,
  DrizzleLocationRepository,
  DrizzleMachineRepository,
  DrizzleMaterialRepository,
  DrizzleRecipeRepository,
  DrizzleStockMovementRepository,
  DrizzleUnitOfWork,
  DrizzleWorkerRepository,
  resolveDbFile,
} from '../persistence/index.js';

import {
  ASSIGNMENT_REPOSITORY,
  BATCH_EVENT_REPOSITORY,
  BATCH_REPOSITORY,
  DB,
  LOCATION_REPOSITORY,
  MACHINE_REPOSITORY,
  MATERIAL_REPOSITORY,
  RECIPE_REPOSITORY,
  STOCK_MOVEMENT_REPOSITORY,
  UNIT_OF_WORK,
  WORKER_REPOSITORY,
} from './tokens.js';

/**
 * Ciclo de vida de la conexión (Fase 2).
 *
 * - `onModuleInit`: aplica las migraciones pendientes (`apps/api/drizzle`) al
 *   arrancar. Se elige el hook del módulo (y no el `bootstrap`) porque así los
 *   tests que importan el módulo también obtienen la base migrada sin código
 *   extra, y `applyMigrations` es idempotente.
 * - `onModuleDestroy`: cierra la conexión Turso al apagar la app (`app.close()`).
 */
@Injectable()
export class DbLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(DB) private readonly db: Db) {}

  async onModuleInit(): Promise<void> {
    await applyMigrations(this.db);
  }

  async onModuleDestroy(): Promise<void> {
    await closeDb(this.db);
  }
}

/**
 * Wiring de la capa de persistencia: una única conexión (`DB`) compartida por
 * los 9 adaptadores y por el `UnitOfWork`. Patrón: **un provider factory por
 * puerto**, con `inject: [DB]`. No hay registro genérico ni magia: cada binding
 * puerto→adaptador es una línea explícita y auditable.
 */
@Module({
  providers: [
    { provide: DB, useFactory: () => createDb(resolveDbFile()) },
    DbLifecycle,
    {
      provide: MATERIAL_REPOSITORY,
      useFactory: (db: Db) => new DrizzleMaterialRepository(db),
      inject: [DB],
    },
    {
      provide: MACHINE_REPOSITORY,
      useFactory: (db: Db) => new DrizzleMachineRepository(db),
      inject: [DB],
    },
    {
      provide: WORKER_REPOSITORY,
      useFactory: (db: Db) => new DrizzleWorkerRepository(db),
      inject: [DB],
    },
    {
      provide: LOCATION_REPOSITORY,
      useFactory: (db: Db) => new DrizzleLocationRepository(db),
      inject: [DB],
    },
    {
      provide: RECIPE_REPOSITORY,
      useFactory: (db: Db) => new DrizzleRecipeRepository(db),
      inject: [DB],
    },
    {
      provide: BATCH_REPOSITORY,
      useFactory: (db: Db) => new DrizzleBatchRepository(db),
      inject: [DB],
    },
    {
      provide: BATCH_EVENT_REPOSITORY,
      useFactory: (db: Db) => new DrizzleBatchEventRepository(db),
      inject: [DB],
    },
    {
      provide: ASSIGNMENT_REPOSITORY,
      useFactory: (db: Db) => new DrizzleAssignmentRepository(db),
      inject: [DB],
    },
    {
      provide: STOCK_MOVEMENT_REPOSITORY,
      useFactory: (db: Db) => new DrizzleStockMovementRepository(db),
      inject: [DB],
    },
    {
      provide: UNIT_OF_WORK,
      useFactory: (db: Db) => new DrizzleUnitOfWork(db),
      inject: [DB],
    },
  ],
  exports: [
    DB,
    MATERIAL_REPOSITORY,
    MACHINE_REPOSITORY,
    WORKER_REPOSITORY,
    LOCATION_REPOSITORY,
    RECIPE_REPOSITORY,
    BATCH_REPOSITORY,
    BATCH_EVENT_REPOSITORY,
    ASSIGNMENT_REPOSITORY,
    STOCK_MOVEMENT_REPOSITORY,
    UNIT_OF_WORK,
  ],
})
export class PersistenceModule {}
