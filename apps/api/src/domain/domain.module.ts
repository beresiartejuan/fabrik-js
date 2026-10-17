import { Module } from '@nestjs/common';

import { InMemoryEventBus } from './in-memory-event-bus.js';
import { PersistenceModule } from './persistence.module.js';
import { EVENT_BUS } from './tokens.js';
import { useCaseProviders, useCaseTokens } from './use-case.providers.js';

/**
 * Módulo de wiring del dominio (Fase 2, docs/09).
 *
 * Reúne la infraestructura (conexión + 9 adaptadores + `UnitOfWork` vía
 * `PersistenceModule`) con los 37 casos de uso del dominio como providers. Los
 * casos de uso se exponen **por su propia clase** como token y los puertos por
 * los `symbol` de `tokens.ts`, de modo que en la Fase 4 los controladores inyectan
 * tanto `CreateMaterial` como `MaterialRepository` sin conocer adaptadores.
 *
 * El `EventBus` se provee aquí (no en persistencia) porque no es un detalle de
 * almacenamiento: hoy es `InMemoryEventBus`; el día que haya cola real se cambia
 * este único provider y los casos de uso no se enteran (solo ven la interfaz).
 *
 * Se re-exporta `PersistenceModule` (no tokens sueltos) para que quien importe
 * `DomainModule` reciba también la conexión, los 9 repositorios y el
 * `UnitOfWork`. Nest solo permite re-exportar providers del propio módulo;
 * los de un módulo importado se exponen re-exportando el módulo.
 */
@Module({
  imports: [PersistenceModule],
  providers: [{ provide: EVENT_BUS, useFactory: () => new InMemoryEventBus() }, ...useCaseProviders],
  exports: [PersistenceModule, EVENT_BUS, ...useCaseTokens],
})
export class DomainModule {}
