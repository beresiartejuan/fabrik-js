import { rmSync } from 'node:fs';
import { CreateMaterial, type MaterialRepository, WorkerId } from '@fabrik/domain';
import { Test, type TestingModule } from '@nestjs/testing';

import { DomainModule } from '../../src/domain/domain.module.js';
import { InMemoryEventBus } from '../../src/domain/in-memory-event-bus.js';
import { DB, EVENT_BUS, MATERIAL_REPOSITORY } from '../../src/domain/tokens.js';
import { useCaseProviders } from '../../src/domain/use-case.providers.js';
import { createTestDatabase, type TestDatabase } from '../persistence/test-db.js';

/**
 * Prueba de la cadena DI completa (Fase 2, criterio de salida): un `TestingModule`
 * importa el `DomainModule` real, sustituye solo la conexión por un SQLite
 * temporal y resuelve un caso de uso de verdad (`CreateMaterial`) que escribe a
 * través del adaptador Drizzle y se lee de vuelta con el repositorio.
 */
describe('DomainModule (wiring DI)', () => {
  let moduleRef: TestingModule;
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    moduleRef = await Test.createTestingModule({ imports: [DomainModule] })
      .overrideProvider(DB)
      .useValue(testDb.db)
      .compile();
    // Dispara `DbLifecycle.onModuleInit` (aplica migraciones sobre la base temporal).
    await moduleRef.init();
  });

  afterAll(async () => {
    // `DbLifecycle.onModuleDestroy` cierra la conexión.
    await moduleRef.close();
    rmSync(testDb.dir, { recursive: true, force: true });
  });

  it('resuelve y ejecuta CreateMaterial end-to-end contra SQLite', async () => {
    const createMaterial = moduleRef.get(CreateMaterial);
    const actor = { workerId: WorkerId.from('worker-admin'), role: 'admin' } as const;

    const created = await createMaterial.execute(actor, {
      name: 'Harina 000',
      description: 'Harina de trigo',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
    });

    // La entidad quedó persistida: se lee de vuelta con el adaptador real.
    const materials = moduleRef.get<MaterialRepository>(MATERIAL_REPOSITORY);
    const persisted = await materials.findById(created.id);
    expect(persisted).not.toBeNull();
    expect(persisted?.name).toBe('Harina 000');
    expect(persisted?.kind).toBe('supply');

    // Y el evento salió por el EventBus in-process.
    const bus = moduleRef.get<InMemoryEventBus>(EVENT_BUS);
    expect(bus.published.map((event) => event.name)).toContain('material.created');
  });

  it('resuelve todos los casos de uso cableados', () => {
    expect(useCaseProviders.length).toBeGreaterThan(0);
    for (const provider of useCaseProviders) {
      expect(moduleRef.get(provider.provide)).toBeDefined();
    }
  });
});
