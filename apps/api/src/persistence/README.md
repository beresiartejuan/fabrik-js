# Persistencia (Fase 1) — Drizzle + Turso

Implementación de los **9 puertos de repositorio** del dominio (`@fabrik/domain`)
más `UnitOfWork`, sobre Drizzle ORM y el motor embebido de Turso.

## Elección de cliente (y por qué)

El plan (`docs/plans/09-plan-de-api.md`) mencionaba `@libsql/client`, pero ese SDK es la
etapa anterior (libSQL) y fue renombrado. Verificamos la documentación actual de
Drizzle antes de decidir:

| Alternativa | Estado hoy | Driver Drizzle | Veredicto |
|---|---|---|---|
| `@libsql/client` (libSQL/Turso Cloud) | estable | `drizzle-orm/libsql` (estable 0.45.x) | SDK **anterior** |
| `@tursodatabase/database` (motor Turso actual) | beta, pero documentado | `drizzle-orm/tursodatabase/database` (**solo en la RC v1.0**) | **elegido** |
| `node:sqlite` / `better-sqlite3` | estable | `drizzle-orm/node-sqlite` | no es Turso |

- El Drizzle **estable (0.45.4)** solo soporta `@libsql/client` para Turso/libSQL.
- El Drizzle **v1.0 RC** (`drizzle-orm@1.0.0-rc.4`) añade un driver de primera
  clase `drizzle-orm/tursodatabase/database` para `@tursodatabase/database`, el
  SDK actual del motor Turso (`docs.turso.tech` → *Recommended* para Node).
- **Decisión:** usar el SDK moderno (`@tursodatabase/database@0.8.3`) junto con la
  línea RC de Drizzle, fijando **versiones exactas** para evitar sorpresas de un
  prerelease. Es la vía oficial y hacia adelante; el fallback a `@libsql/client`
  (cambiar el import del driver por `drizzle-orm/libsql`) queda documentado por si
  hubiera que volver al estable.

Consecuencias a tener en cuenta (motor Turso beta):

- **Un solo proceso por archivo.** Los tests usan un archivo temporal por test.
- **WAL por defecto** (aparecen `*.db-wal`/`*.db-shm`).
- La API del driver es **asíncrona** (`SQLiteAsyncDatabase`); las transacciones
  se abren con `db.transaction(async (tx) => …)`.

## Variable de entorno

- `FABRIK_DB_FILE`: ruta al archivo SQLite local. Default `./data/fabrik.db`
  (relativo al cwd, normalmente `apps/api`). Ver `config.ts`.

## Comandos

```bash
pnpm --filter api db:generate      # drizzle-kit generate (diff schema → SQL)
pnpm --filter api db:migrate       # aplica migraciones (tsx)
pnpm --filter api db:migrate:prod  # aplica migraciones (node dist/…)
pnpm --filter api db:seed          # siembra el contexto de demo (tsx, idempotente)
```

Las migraciones versionadas viven en `apps/api/drizzle/`.

## Seed de demo (Fase 7) — `db:seed`

`src/persistence/seed.ts` prepara un contexto mínimo pero completo para arrancar
la API y recorrer el flujo de `docs/flujo-de-produccion.md`. Corre contra el
archivo indicado por `FABRIK_DB_FILE` (default `./data/fabrik.db`) y **aplica las
migraciones antes de sembrar**, así que sirve sobre una base recién creada:

```bash
FABRIK_DB_FILE=/tmp/fabrik-demo.db pnpm --filter api db:seed
```

Contenido:

| Entidad | Qué siembra |
|---|---|
| `factories` | `Fábrica Demo` (sin puerto en el dominio → inserción directa con upsert) |
| `locations` | `Almacén central` (`storage`) y `Planta de producción` (`production`) |
| `materials` | suministros `Harina` (kg) y `Agua` (l); intermedio `Masa` (kg); final `Pan` (unit) |
| `machines` | `Mezcladora` (`mixer`) en la planta |
| `recipes` | `Pan artesanal`: paso 1 `harina 2 kg + agua 1 l → masa 2 kg`; paso 2 `masa 2 kg → pan 1 unit` |
| `workers` + `auth_credentials` | usuarios de demo `admin`/`admin123`, `operario`/`operario123` (worker), `auditor`/`auditor123` |
| `assignments` | `operario` → `Mezcladora`, lunes a domingo `00:00`–`23:59` (cubre cualquier hora local: I3) |

**Idempotencia.** Todas las entidades usan **IDs fijos** (UUID deterministas) y
`save` es *upsert* por `id`, de modo que re-ejecutar el seed no duplica filas. Las
credenciales se crean **solo si no existen** (no se re-hashea la contraseña en cada
corrida): para restablecer una contraseña de demo hay que borrar la fila de
`auth_credentials` y volver a correr el seed. El seed es independiente del
bootstrap de admin por env (`BOOTSTRAP_ADMIN_*`, Fase 3): la API crea ese admin
(con el nombre que diga el entorno) además de los usuarios de demo.

> Las contraseñas sembradas son de **desarrollo**. Antes de desplegar, cámbialas
> o elimina los usuarios de demo.

## Layout

```
apps/api/
├─ drizzle.config.ts             # drizzle-kit: dialect sqlite, schema, out
├─ drizzle/                      # migraciones generadas (versionadas)
└─ src/persistence/
   ├─ config.ts                  # FABRIK_DB_FILE y default
   ├─ client.ts                  # createDb()/closeDb() (drizzle + @tursodatabase/database)
   ├─ executor.ts                # tipo común db | tx
   ├─ schema.ts                  # tablas Drizzle
   ├─ mappers.ts                 # fila ↔ entidad (fromPersistence)
   ├─ migrations.ts              # applyMigrations + ruta de `drizzle/`
   ├─ migrate.ts                 # entrypoint CLI (db:migrate)
   ├─ seed.ts                    # entrypoint CLI (db:seed) + contexto de demo
   ├─ drizzle-unit-of-work.ts    # DrizzleUnitOfWork (commit/rollback)
   ├─ repositories/              # 9 adaptadores + createRepositories(executor)
   └─ index.ts                   # barrel
```

Los tests de integración viven en `apps/api/test/persistence/`.

## Decisiones de esquema

- **IDs**: `text` (UUID) como clave primaria; el dominio usa `BrandedId` (string).
- **`Quantity`** → `amount` (`real`) + `unit` (`text` con enum). Para `StockDelta`
  el monto es `delta_amount` y **admite signo** (positivo = entrada).
- **`TimeSlot`** → `days_of_week` como texto `"0,2,5"` (días ordenados, 0=domingo)
  y `start`/`end` como texto `"HH:mm"` (se preserva el valor exacto del VO).
- **Fechas** → `integer` en modo `timestamp_ms` (epoch en ms), mapeado a `Date`.
  Se prefirió a ISO text por ser unívocamente ordenable y comparable.
- **Booleanos** → `integer` en modo `boolean`.
- **`Recipe` (`+ steps`)** → `recipes` + `recipe_steps` + `recipe_step_inputs`
  (los `inputs` del paso son un array ordenado por `ordinal`).
- **`BatchEvent` (`+ inputs/outputs`)** → `batch_events` + `batch_event_inputs` +
  `batch_event_outputs`. Ambas tablas hijas usan el shape `BatchQuantity`
  (`batch_id` opcional + `material_id` + `amount`/`unit`), con PK compuesta
  `(event_id, ordinal)`.
- **Append-only**: `batch_events` y `stock_movements` solo exponen `add`/lectura
  (`findBy`/`list`/`sum`) en los adaptadores; nunca `update`/`delete` (I4).
- **Sin foreign keys**: la integridad la garantizan el dominio y los use cases;
  así los `upsert` borran+reinsertan hijos sin depender de `PRAGMA foreign_keys`.
- **`factories`**: tabla incluida en el esquema, pero **sin puerto** en el dominio
  (no hay `FactoryRepository` entre los 9), por lo que no tiene adaptador.

## Contrato de los adaptadores

- `findById` → `T | null` (miss = `null`).
- `save` → **upsert por `id`** (`insert … onConflictDoUpdate`).
- `add` (append-only) → idempotente por `id` (re-`add` reemplaza, como los fakes
  in-memory del dominio).
- `list`/`findBy*` → filtros opcionales; sin filtro = sin restricción.
- `AssignmentRepository.delete` es el único borrado real.

## `DrizzleUnitOfWork`

`run(fn)` abre `db.transaction`, construye un `Repositories` **ligado al `tx`** y
lo entrega a `fn`. Si `fn` resuelve → commit; si lanza → rollback. Los adaptadores
deben usar siempre el `tx` (no la conexión externa) porque en el motor Turso las
operaciones sobre la conexión esperan al lock de la transacción y podrían
bloquearse dentro del callback.
