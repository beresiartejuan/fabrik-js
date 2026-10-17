import {
  Assignment,
  AssignmentId,
  Factory,
  FactoryId,
  Location,
  LocationId,
  Machine,
  MachineId,
  Material,
  MaterialId,
  Quantity,
  Recipe,
  RecipeId,
  RecipeStep,
  RecipeStepId,
  TimeSlot,
  Worker,
  WorkerId,
  type WorkerRole,
} from '@fabrik/domain';

import type { CredentialRepository } from '../auth/credentials.repository.js';
import { DrizzleCredentialRepository } from '../auth/credentials.repository.js';
import { hashPassword } from '../auth/password.js';

import { closeDb, createDb, type Db } from './client.js';
import { resolveDbFile } from './config.js';
import { applyMigrations } from './migrations.js';
import { factoryToRow } from './mappers.js';
import { createRepositories } from './repositories/index.js';
import { factories } from './schema.js';

/**
 * Seed de demo (Fase 7, docs/09) — `pnpm --filter api db:seed`.
 *
 * Crea un contexto mínimo pero completo para arrancar la API y recorrer el flujo
 * de `docs/03-flujo-de-produccion.md`: fábrica, lugares, materiales, una máquina,
 * una receta de dos pasos, un operario con asignación horaria y tres usuarios de
 * demo (admin / worker / auditor) con credenciales.
 *
 * **Idempotencia.** Todas las entidades usan **IDs fijos** (UUID deterministas)
 * y `save` es *upsert* por `id`, así que re-ejecutar el seed no duplica filas.
 * Las credenciales se crean **solo si no existen** (así no se re-hashea la
 * contraseña en cada corrida). La tabla `factories` no tiene puerto en el dominio,
 * así que se inserta directamente con un `onConflictDoUpdate`.
 *
 * **Contraseñas.** Se siembran directamente (no dependen de
 * `BOOTSTRAP_ADMIN_*`): el login por `name` + contraseña de la Fase 3 ya resuelve
 * al worker sembrado. Esto es lo más simple y reproducible para un entorno demo.
 *
 * Se ejecuta con `tsx` (`src/persistence/seed.ts`); `main()` aplica antes las
 * migraciones (`db:migrate`) para que funcione sobre un archivo recién creado.
 */

// ---------------------------------------------------------------------------
// IDs fijos (UUID v4 deterministas) — base de la idempotencia.
// ---------------------------------------------------------------------------

const IDS = {
  factory: '00000000-0000-4000-8000-000000000001',
  storageLocation: '00000000-0000-4000-8000-000000000002',
  productionLocation: '00000000-0000-4000-8000-000000000003',
  harina: '00000000-0000-4000-8000-000000000004',
  agua: '00000000-0000-4000-8000-000000000005',
  masa: '00000000-0000-4000-8000-000000000006',
  pan: '00000000-0000-4000-8000-000000000007',
  machine: '00000000-0000-4000-8000-000000000008',
  recipe: '00000000-0000-4000-8000-000000000009',
  recipeStep1: '00000000-0000-4000-8000-00000000000a',
  recipeStep2: '00000000-0000-4000-8000-00000000000b',
  worker: '00000000-0000-4000-8000-00000000000c',
  assignment: '00000000-0000-4000-8000-00000000000d',
  admin: '00000000-0000-4000-8000-00000000000e',
  auditor: '00000000-0000-4000-8000-00000000000f',
} as const;

/** Usuario de demo sembrado con credencial. */
export interface DemoUser {
  readonly id: string;
  readonly name: string;
  readonly password: string;
  readonly role: WorkerRole;
}

/**
 * Usuarios de demo. Las contraseñas son de desarrollo: cámbialas o elimina estos
 * usuarios antes de desplegar.
 */
export const DEMO_USERS: readonly DemoUser[] = [
  { id: IDS.admin, name: 'admin', password: 'admin123', role: 'admin' },
  { id: IDS.worker, name: 'operario', password: 'operario123', role: 'worker' },
  { id: IDS.auditor, name: 'auditor', password: 'auditor123', role: 'auditor' },
];

/** Resumen de lo sembrado (ids útiles para guiones de demo). */
export interface SeedSummary {
  readonly factoryId: string;
  readonly locations: { readonly storage: string; readonly production: string };
  readonly materials: {
    readonly harina: string;
    readonly agua: string;
    readonly masa: string;
    readonly pan: string;
  };
  readonly machineId: string;
  readonly recipeId: string;
  readonly workerId: string;
  readonly assignmentId: string;
  readonly users: readonly { readonly name: string; readonly role: WorkerRole }[];
}

/** Siembra el contexto de demo sobre una base **ya migrada**. Idempotente. */
export async function seed(db: Db): Promise<SeedSummary> {
  const repos = createRepositories(db);
  const credentials: CredentialRepository = new DrizzleCredentialRepository(db);

  // --- Fábrica (sin puerto en el dominio: inserción directa) ---
  const factory = Factory.fromPersistence({ id: FactoryId.from(IDS.factory), name: 'Fábrica Demo' });
  const factoryRow = factoryToRow(factory);
  await db.insert(factories).values(factoryRow).onConflictDoUpdate({
    target: factories.id,
    set: factoryRow,
  });

  // --- Lugares: un almacén y una planta de producción ---
  await repos.locations.save(
    Location.fromPersistence({
      id: LocationId.from(IDS.storageLocation),
      name: 'Almacén central',
      kind: 'storage',
    }),
  );
  await repos.locations.save(
    Location.fromPersistence({
      id: LocationId.from(IDS.productionLocation),
      name: 'Planta de producción',
      kind: 'production',
    }),
  );

  // --- Materiales: 2 suministros + 1 intermedio + 1 producto final ---
  await repos.materials.save(
    Material.fromPersistence({
      id: MaterialId.from(IDS.harina),
      name: 'Harina',
      description: 'Suministro de demo',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
    }),
  );
  await repos.materials.save(
    Material.fromPersistence({
      id: MaterialId.from(IDS.agua),
      name: 'Agua',
      description: 'Suministro de demo',
      kind: 'supply',
      physicalState: 'liquid',
      unitOfMeasure: 'l',
    }),
  );
  await repos.materials.save(
    Material.fromPersistence({
      id: MaterialId.from(IDS.masa),
      name: 'Masa',
      description: 'Producto intermedio de demo',
      kind: 'product',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
    }),
  );
  await repos.materials.save(
    Material.fromPersistence({
      id: MaterialId.from(IDS.pan),
      name: 'Pan',
      description: 'Producto final de demo',
      kind: 'product',
      physicalState: 'solid',
      unitOfMeasure: 'unit',
    }),
  );

  // --- Una máquina en la planta de producción ---
  await repos.machines.save(
    Machine.fromPersistence({
      id: MachineId.from(IDS.machine),
      name: 'Mezcladora',
      type: 'mixer',
      locationId: LocationId.from(IDS.productionLocation),
      status: 'idle',
    }),
  );

  // --- Receta de dos pasos (docs/03): harina + agua → masa → pan ---
  const harina = MaterialId.from(IDS.harina);
  const agua = MaterialId.from(IDS.agua);
  const masa = MaterialId.from(IDS.masa);
  const pan = MaterialId.from(IDS.pan);

  const step1 = RecipeStep.fromPersistence({
    id: RecipeStepId.from(IDS.recipeStep1),
    position: 1,
    machineType: 'mixer',
    inputs: [
      { materialId: harina, quantity: Quantity.create(2, 'kg') },
      { materialId: agua, quantity: Quantity.create(1, 'l') },
    ],
    outputProductId: masa,
    outputQuantity: Quantity.create(2, 'kg'),
  });
  const step2 = RecipeStep.fromPersistence({
    id: RecipeStepId.from(IDS.recipeStep2),
    position: 2,
    machineType: 'mixer',
    inputs: [{ materialId: masa, quantity: Quantity.create(2, 'kg') }],
    outputProductId: pan,
    outputQuantity: Quantity.create(1, 'unit'),
  });

  await repos.recipes.save(
    Recipe.fromPersistence({
      id: RecipeId.from(IDS.recipe),
      name: 'Pan artesanal',
      outputProductId: pan,
      outputQuantity: Quantity.create(1, 'unit'),
      steps: [step1, step2],
    }),
  );

  // --- Usuarios de demo (worker + credenciales) ---
  for (const user of DEMO_USERS) {
    const workerId = WorkerId.from(user.id);
    await repos.workers.save(
      Worker.fromPersistence({ id: workerId, name: user.name, role: user.role, active: true }),
    );
    const existing = await credentials.findByWorkerId(workerId);
    if (!existing) {
      const now = new Date();
      await credentials.save({
        workerId,
        passwordHash: await hashPassword(user.password),
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // --- Asignación del operario a la máquina, de lunes a domingo, todo el día ---
  // Así una transformación registrada a cualquier hora local del día cae dentro
  // de la franja (I3) y el flujo de demo "siempre funciona".
  await repos.assignments.save(
    Assignment.fromPersistence({
      id: AssignmentId.from(IDS.assignment),
      workerId: WorkerId.from(IDS.worker),
      machineId: MachineId.from(IDS.machine),
      slot: TimeSlot.create([0, 1, 2, 3, 4, 5, 6], '00:00', '23:59'),
    }),
  );

  return {
    factoryId: IDS.factory,
    locations: { storage: IDS.storageLocation, production: IDS.productionLocation },
    materials: {
      harina: IDS.harina,
      agua: IDS.agua,
      masa: IDS.masa,
      pan: IDS.pan,
    },
    machineId: IDS.machine,
    recipeId: IDS.recipe,
    workerId: IDS.worker,
    assignmentId: IDS.assignment,
    users: DEMO_USERS.map((user) => ({ name: user.name, role: user.role })),
  };
}

async function main(): Promise<void> {
  const dbFile = resolveDbFile();
  const db = createDb(dbFile);
  try {
    await applyMigrations(db);
    const summary = await seed(db);
    console.log(`[db:seed] contexto de demo sembrado sobre ${dbFile}`);
    console.log(`[db:seed]   lugares:      almacén ${summary.locations.storage} / planta ${summary.locations.production}`);
    console.log(`[db:seed]   materiales:   harina ${summary.materials.harina}, agua ${summary.materials.agua}, masa ${summary.materials.masa}, pan ${summary.materials.pan}`);
    console.log(`[db:seed]   máquina:      ${summary.machineId} · receta ${summary.recipeId}`);
    console.log(`[db:seed]   usuarios:     ${DEMO_USERS.map((user) => `${user.name} (${user.role})`).join(', ')}`);
  } finally {
    await closeDb(db);
  }
}

main().catch((error: unknown) => {
  console.error('[db:seed] error al sembrar el contexto de demo:', error);
  process.exitCode = 1;
});
