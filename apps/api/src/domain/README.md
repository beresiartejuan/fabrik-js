# Infraestructura Nest (Fase 2)

Wiring del dominio en la API: puertos→adaptadores, casos de uso como providers,
`EventBus` in-process, filtro de excepciones y validación con zod. Criterio de
salida y tabla error→HTTP en [`docs/09-plan-de-api.md`](../../../../docs/09-plan-de-api.md).

## Layout

```
apps/api/src/
├─ domain/                              # wiring del dominio
│  ├─ tokens.ts                         # symbols de DI (puertos, DB, EventBus, UnitOfWork)
│  ├─ persistence.module.ts             # DB + DbLifecycle + 9 adaptadores + UnitOfWork
│  ├─ use-case.providers.ts             # 1 factory provider por caso de uso (37)
│  ├─ in-memory-event-bus.ts            # EventBus in-process
│  └─ domain.module.ts                  # DomainModule: une infra + casos de uso y exporta
├─ common/
│  ├─ filters/domain-exception.filter.ts  # DomainError → HTTP (APP_FILTER global)
│  └─ pipes/zod-validation.pipe.ts        # validación con zod
└─ health/health.controller.ts         # GET /health
```

## Tokens de inyección

Los puertos del dominio son **interfaces** TypeScript: no existen en runtime, así
que no pueden ser token de DI. `tokens.ts` define un `symbol` por puerto
(`MATERIAL_REPOSITORY`, `UNIT_OF_WORK`, `EVENT_BUS`, `DB`, …) más
`REPOSITORY_TOKENS` (mapa con los nombres de `Repositories`).

## Patrón de providers: uno explícito por caso de uso

Cada caso de uso se registra con un **factory provider** que construye la clase
con las dependencias que declara su constructor:

```ts
{
  provide: CreateMaterial,                       // el token es la propia clase
  useFactory: (materials: MaterialRepository, events: EventBus) =>
    new CreateMaterial({ materials, events }),
  inject: [MATERIAL_REPOSITORY, EVENT_BUS],
}
```

Decisiones:

- **Sin registrador genérico ni reflexión.** Los constructores reciben interfaces
  (borradas en runtime), así que el grafo de dependencias *debe* declararse a
  mano. Se prefiere la explicitud a la magia: cada binding es una línea auditable
  y el compilador comprueba los tipos de los argumentos del factory.
- **El token del caso de uso es su clase**, así que los controladores lo inyectan
  directamente (`constructor(private readonly createMaterial: CreateMaterial)`)
  o por `@Inject(CreateMaterial)`.
- Los factories están agrupados por fichero del dominio (materiales, lugares,
  máquinas, workers, recetas, asignaciones, producción, trazabilidad) y
  `useCaseProviders` los concatena. Un test comprueba que **todos** se resuelven.

## Módulos

- `PersistenceModule`: una única conexión (`DB`) compartida por los 9 adaptadores
  y `DrizzleUnitOfWork`. `DbLifecycle.onModuleInit` aplica migraciones (idempotente)
  y `onModuleDestroy` cierra la conexión. Se eligió el hook del módulo (no
  `bootstrap`) para que los tests que importan el módulo tengan la base migrada.
- `DomainModule`: provee el `EventBus` y los casos de uso, e **importa y re-exporta
  `PersistenceModule`**. Quien importe `DomainModule` recibe la conexión, los
  repositorios por token, el `UnitOfWork`, el bus y todos los casos de uso.
  (Nest solo re-exporta providers del propio módulo; los de un módulo importado se
  exponen re-exportando el módulo.)

## `InMemoryEventBus`

El contrato del dominio (`EventBus`) es mínimo: solo `publish`. No hay
`subscribe`, así que el adaptador no inventa API pública: **acumula** los eventos
publicados (accesibles vía `published` para los tests) y en producción el efecto
es no-op. Sustituir este único provider por una cola real no toca el dominio.

## `DomainExceptionFilter` (global)

Registrado con `APP_FILTER`. Cuerpo estable:
`{ statusCode, error: <clase>, message, context? }`, donde `context` son los
campos tipados del error (`{ entity, id }`, `{ machineId, status }`, …).

- `NotFoundError` → 404; `UnauthorizedRoleError` → 403; conflicto (solapamiento,
  stock, inactivos, transición, worker no asignado) → 409; resto del grupo 422 →
  422; `DomainError` restante → 500 (y se registra); desconocido → 500 genérico sin
  filtrar detalles.
- `HttpException` (p. ej. la del pipe de zod) se deja pasar tal cual.
- `WorkerNotAssignedError` (violación de I3) se añadió a la tabla de docs/09 en la
  Fase 3 y mapea a 409 (antes caía en el fallback 500).

## Validación con zod

`ZodValidationPipe(schema)` valida y **parsea** el valor; si falla lanza
`BadRequestException` (400) con `{ statusCode, error: 'ValidationError', message,
issues[] }`. Se eligió zod sobre `class-validator` porque:

- el schema es una función pura **compartible con `apps/web`** (mismo contrato en
  el front y la API) sin duplicar DTOs decorados;
- `z.infer<typeof Schema>` deriva el tipo TypeScript del schema, imposibilitando
  que DTO y validación diverjan;
- no necesita decoradores ni `emitDecoratorMetadata`.

El coste es mantener este pipe (~30 líneas) en vez de reusar el `ValidationPipe`
de Nest, intrínsecamente basado en `class-validator`.

## Tests (Fase 2)

- `src/common/filters/domain-exception.filter.spec.ts`: **table-driven**, un caso
  por clase de error del catálogo → status esperado, más forma del cuerpo,
  `context` tipado y fallback 500.
- `test/domain/domain.module.spec.ts`: `TestingModule` importa el `DomainModule`
  real, sustituye `DB` por un SQLite temporal, resuelve `CreateMaterial`, lo
  ejecuta y verifica que la entidad quedó persistida (cadena DI completa), además
  de que **todos** los casos de uso cableados se resuelven.
- `src/common/pipes/zod-validation.pipe.spec.ts` y
  `src/health/health.controller.spec.ts`.
