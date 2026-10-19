import type { MaterialId } from '@fabrik/domain';
import { type Batch, LocationId, MachineId, Quantity, RecipeId, WorkerId } from '@fabrik/domain';

import { loadDb, saveDb } from './db';
import { type DemoActor, type DemoRegistry, demoRegistry, toDomainActor } from './registry';
import { DEMO_SEED_IDS } from './seed';

/**
 * Siembra del **histórico de producción** del runtime DEMO.
 *
 * El seed maestro (`seed.ts`) deja `batches`/`batchEvents`/`stockMovements`
 * vacíos: este módulo llena el histórico ejecutando el flujo de
 * `docs/flujo-de-produccion.md` **con los use cases reales** del registro
 * (`registry.ts`) — cero atajos de fixtures: los invariantes los imponen los
 * propios casos de uso y los actores del seed (admin para arribos/orden, el
 * operario para transformar y almacenar).
 *
 * Flujo ejecutado (las cantidades se toman de la receta sembrada, «Pan
 * artesanal», para no desincronizarse del seed):
 * 1. Arribo de cada suministro del paso 1 al almacén (actor admin):
 *    `RegisterSupplyArrival` → lote de suministro `stored` + `supply_in`.
 * 2. Inicio de la orden (admin): `StartProduction` → lote raíz `in_progress`.
 * 3. Por cada paso de la receta (operario): `RecordTransformation` (crea el
 *    `BatchEvent`, descuenta los inputs como `consumed` y crea los lotes de
 *    output) y `StoreBatch` de cada output (+ `produced`). El actor es el
 *    **operario** porque transformar es solo `worker`; la asignación full-day
 *    del seed mantiene I3 vigente a cualquier hora local.
 * 4. Cierre de la orden (admin): `CompleteProduction` sobre el lote raíz.
 *
 * Los timestamps son los del navegador (los use cases sellan con `new Date()`:
 * el reloj de la primera carga de la pestaña, igual que el backend usa el
 * reloj del servidor).
 *
 * **«Una sola vez»**: `ensureHistorySeeded` revisa el sello `data.historySeeded`
 * (extensión del tipo en `db.ts`) y es no-op si ya corrió; después de un
 * `resetDb()` el sello desaparece y el histórico se resiembra completo. El
 * flujo en sí (`runProductionHistory`) **no** es idempotente entre corridas —
 * los ids de lote y evento los genera el dominio; llamarlo dos veces duplica
 * la historia, así que los consumidores deben usar `ensureHistorySeeded`.
 */

/** Resultado resumido del flujo ejecutado (para tests y debug). */
export interface ProductionHistorySummary {
  /** Lote raíz de la orden (queda `completed`). */
  readonly rootBatchId: string;
  /** Lotes de suministro ingresados al almacén, en el orden del paso 1. */
  readonly arrivals: readonly { readonly materialId: string; readonly batchId: string }[];
  /** Eventos de transformación generados, en orden de ejecución. */
  readonly eventIds: readonly string[];
  /** Último lote producido por material (el output final queda `stored`). */
  readonly outputs: readonly { readonly materialId: string; readonly batchId: string }[];
}

// Actores del seed: el admin dirige la orden, el operario opera la mezcladora.
const ADMIN_ACTOR: DemoActor = { userId: DEMO_SEED_IDS.admin, role: 'admin' };
const OPERARIO_ACTOR: DemoActor = { userId: DEMO_SEED_IDS.operario, role: 'worker' };

/** Ejecuta el flujo completo de docs/03 contra el registro del demo. */
export async function runProductionHistory(
  registry: DemoRegistry = demoRegistry,
): Promise<ProductionHistorySummary> {
  const { useCases } = registry;
  const admin = toDomainActor(ADMIN_ACTOR);
  const operario = toDomainActor(OPERARIO_ACTOR);

  // La receta y su composición se leen por use case (el mismo camino de la
  // app): las cantidades del histórico derivan de sus pasos, nunca se tipean
  // duplicado aquí (si el seed cambia, el histórico sigue siendo válido).
  const recipe = await useCases.recipes.GetRecipe.execute(admin, {
    id: RecipeId.from(DEMO_SEED_IDS.panArtesanal),
  });
  const steps = [...recipe.steps].sort((a, b) => a.position - b.position);
  const firstStep = steps[0];
  if (!firstStep) {
    throw new Error('[fabrik-demo] La receta del histórico no tiene pasos (seed inválido).');
  }

  // 1. Arribos al almacén (actor admin): un lote de suministro por cada input
  // del primer paso, con la cantidad exacta que exige ese paso.
  const almacenId = LocationId.from(DEMO_SEED_IDS.almacen);
  const mezcladoraId = MachineId.from(DEMO_SEED_IDS.mezcladora);
  const operarioId = WorkerId.from(DEMO_SEED_IDS.operario);

  const pool = new Map<MaterialId, Batch>(); // último lote disponible por material
  const arrivals: { materialId: string; batchId: string }[] = [];
  for (const input of firstStep.inputs) {
    const batch = await useCases.production.RegisterSupplyArrival.execute(admin, {
      materialId: input.materialId,
      quantity: input.quantity,
      locationId: almacenId,
    });
    pool.set(input.materialId, batch);
    arrivals.push({ materialId: batch.materialId, batchId: batch.id });
  }

  // 2. Orden de producción (actor admin): lote raíz `in_progress`.
  const rootBatch = await useCases.production.StartProduction.execute(admin, {
    recipeId: recipe.id,
  });

  // 3. Pasos en orden (actor operario): transformar y almacenar cada output.
  const eventIds: string[] = [];
  for (const step of steps) {
    const inputs = step.inputs.map((input) => {
      // El lote fuente es el último disponible de ese material (los arribos
      // para el paso 1; los outputs del paso anterior, para los siguientes).
      const source = pool.get(input.materialId);
      if (!source) {
        throw new Error(
          `[fabrik-demo] El histórico no puede resolverse: falta el lote de ${input.materialId} para el paso ${step.position} (seed inválido).`,
        );
      }
      return {
        batchId: source.id,
        quantity: Quantity.create(input.quantity.amount, input.quantity.unit),
      };
    });

    const event = await useCases.production.RecordTransformation.execute(operario, {
      machineId: mezcladoraId,
      workerId: operarioId,
      recipeStepId: step.id,
      inputs,
      outputs: [{ materialId: step.outputProductId, quantity: step.outputQuantity }],
      observation: 'Historial de demo',
    });
    eventIds.push(event.id);

    // Lectura de apoyo con paridad del controlador real: ProductionController
    // resuelve los outputs con `batches.list({ originBatchEventId })`.
    const outputs = await useCases.traceability.ListBatches.execute(operario, {
      filter: { originBatchEventId: event.id },
    });
    if (outputs.length === 0) {
      throw new Error('[fabrik-demo] La transformación no produjo lotes (seed inválido).');
    }
    for (const batch of outputs) {
      pool.set(batch.materialId, batch);
      await useCases.production.StoreBatch.execute(operario, {
        batchId: batch.id,
        locationId: almacenId,
      });
    }
  }

  // 4. Cierre de la orden (actor admin).
  await useCases.production.CompleteProduction.execute(admin, { batchId: rootBatch.id });

  const produced = [...pool.entries()].map(([materialId, batch]) => ({
    materialId: materialId as string,
    batchId: batch.id,
  }));
  return { rootBatchId: rootBatch.id, arrivals, eventIds, outputs: produced };
}

/**
 * Garantiza el histórico sembrado **una sola vez** por pestaña: con el sello
 * `historySeeded` es no-op (sin duplicar nada) y devuelve `null`; si no, corre
 * el flujo con use cases reales, deja el sello persistido y devuelve el resumen
 * de lo generado.
 */
export async function ensureHistorySeeded(
  registry: DemoRegistry = demoRegistry,
): Promise<ProductionHistorySummary | null> {
  if (loadDb().historySeeded === true) {
    return null;
  }
  const summary = await runProductionHistory(registry);
  // Sello al final, sobre la base ya poblada: una falla a mitad del flujo (que
  // no debería ocurrir — el seed maestro es coherente por diseño) deja el sello
  // sin fijar y el arranque próximo reintenta en lugar de marcarse como logrado.
  const data = loadDb();
  saveDb({ ...data, historySeeded: true });
  return summary;
}
