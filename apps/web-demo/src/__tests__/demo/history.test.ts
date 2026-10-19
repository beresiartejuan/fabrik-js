import { LocationId, MaterialId, Quantity, RecipeId } from '@fabrik/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { loadDb, readRaw, resetDb } from '@/lib/api/demo/db';
import { ensureHistorySeeded, runProductionHistory } from '@/lib/api/demo/history';
import { type DemoActor, demoRegistry, toDomainActor } from '@/lib/api/demo/registry';
import { DEMO_SEED_IDS } from '@/lib/api/demo/seed';

/**
 * Histórico de producción del demo: se llena **ejecutando use cases reales**
 * (`history.ts`) una sola vez tras el seed maestro; la trazabilidad forward del
 * harina de arribo debe llegar hasta el pan almacenado. `resetDb` devuelve la
 * base al seed maestro y el histórico se resiembra desde cero.
 */

const ADMIN: DemoActor = { userId: DEMO_SEED_IDS.admin, role: 'admin' };

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('ensureHistorySeeded', () => {
  it('tras loadDb de una pestaña fresca, ejecuta use cases y puebla el histórico', async () => {
    // El seed maestro arranca con el histórico vacío y sin sello.
    loadDb();
    expect(loadDb().batches).toEqual([]);
    expect(loadDb().batchEvents).toEqual([]);
    expect(loadDb().stockMovements).toEqual([]);
    expect(loadDb().historySeeded).toBeUndefined();

    const summary = await ensureHistorySeeded();
    expect(summary?.eventIds).toHaveLength(2);
    expect(summary?.arrivals.map((arrival) => arrival.materialId).sort()).toEqual([
      DEMO_SEED_IDS.agua,
      DEMO_SEED_IDS.harina,
    ]);
    const data = loadDb();
    expect(data.historySeeded).toBe(true);
    // 2 arribos + lote raíz + masa + pan; 2 transformaciones;
    // 2 supply_in + 3 consumed (harina, agua, masa) + 2 produced (masa, pan).
    expect(data.batches).toHaveLength(5);
    expect(data.batchEvents).toHaveLength(2);
    expect(data.stockMovements).toHaveLength(7);
    // Persistido de verdad (write-through del demo).
    expect(readRaw()?.data.batches).toHaveLength(5);
    expect(readRaw()?.data.historySeeded).toBe(true);
  });

  it('los timestamps del histórico vienen del reloj del navegador (ISO)', async () => {
    const before = Date.now();
    await ensureHistorySeeded();
    const data = loadDb();
    for (const event of data.batchEvents) {
      const timestamp = new Date(event.timestamp);
      expect(Number.isNaN(timestamp.getTime())).toBe(false);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before);
    }
    for (const movement of data.stockMovements) {
      const timestamp = new Date(movement.timestamp);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before);
    }
  });

  it('deriva de use cases reales: TraceForward une arribos → masa → pan', async () => {
    const summary = await ensureHistorySeeded();
    expect(summary?.eventIds).toHaveLength(2);

    const registry = demoRegistry;
    const admin = toDomainActor(ADMIN);
    // El lote de harina (arribo) es raíz hacia adelante:
    const arrivals = await registry.repos.batches.list({
      materialId: MaterialId.from(DEMO_SEED_IDS.harina),
    });
    expect(arrivals).toHaveLength(1);
    const forward = await registry.useCases.traceability.TraceForward.execute(admin, {
      batchId: arrivals[0].id,
    });
    expect(forward.batch?.materialId).toBe(DEMO_SEED_IDS.harina);

    // harina → evento del paso 1 → lote de masa → evento del paso 2 → pan
    const [masaNode] = forward.children[0].children;
    expect(masaNode.batch?.materialId).toBe(DEMO_SEED_IDS.masa);
    expect(masaNode.batch?.status).toBe('stored');
    const [panNode] = masaNode.children[0].children;
    expect(panNode.batch?.materialId).toBe(DEMO_SEED_IDS.pan);
    expect(panNode.batch?.status).toBe('stored');

    // La trazabilidad hacia atrás desde el pan reconstituye la genealogía:
    const panBatch = panNode.batch;
    if (!panBatch) {
      throw new Error('La traza forward no llegó a un lote de pan');
    }
    const backward = await registry.useCases.traceability.TraceBatch.execute(admin, {
      batchId: panBatch.id,
    });
    expect(backward.batch.materialId).toBe(DEMO_SEED_IDS.pan);
    expect(backward.event?.recipeStepId).toBe(DEMO_SEED_IDS.paso2);
    const massaInputNode = backward.children[0];
    expect(massaInputNode.batch.materialId).toBe(DEMO_SEED_IDS.masa);
    expect(massaInputNode.event?.recipeStepId).toBe(DEMO_SEED_IDS.paso1);
    // Las hojas son los dos arribos (harina, agua), sin evento propio:
    expect(massaInputNode.children.map((child) => child.batch?.materialId).sort()).toEqual([
      DEMO_SEED_IDS.agua,
      DEMO_SEED_IDS.harina,
    ]);
  });

  it('los estados de los lotes son los esperados para /produccion y /stock', async () => {
    await ensureHistorySeeded();
    const registry = demoRegistry;
    const admin = toDomainActor(ADMIN);

    const statuses = await registry.useCases.traceability.ListBatches.execute(admin, {});
    const byId = new Map(statuses.map((batch) => [batch.id, batch]));
    const root = [...byId.values()].find((batch) => batch.recipeId === DEMO_SEED_IDS.panArtesanal);
    expect(root?.status).toBe('completed'); // la orden cerrada

    const stored = await registry.useCases.traceability.ListBatches.execute(admin, {
      filter: { status: 'stored' },
    });
    // arribos (2) + masa + pan (outputs almacenados)
    expect(stored).toHaveLength(4);
    const completed = await registry.useCases.traceability.ListBatches.execute(admin, {
      filter: { status: 'completed' },
    });
    expect(completed.map((batch) => batch.id)).toEqual([root?.id as string]);
    const inProgress = await registry.useCases.traceability.ListBatches.execute(admin, {
      filter: { status: 'in_progress' },
    });
    expect(inProgress).toEqual([]);
  });

  it('corre UNA sola vez: repetir ensureHistorySeeded no duplica nada', async () => {
    await ensureHistorySeeded();
    const first = loadDb();
    // Segunda llamada: no-op con el sello puesto.
    await expect(ensureHistorySeeded()).resolves.toBeNull();
    expect(loadDb().batches).toEqual(first.batches);
    expect(loadDb().batchEvents).toEqual(first.batchEvents);
    expect(loadDb().stockMovements).toEqual(first.stockMovements);
    expect(readRaw()?.data.batches).toHaveLength(5);
    expect(readRaw()?.data.batchEvents).toHaveLength(2);
  });

  it('runProductionHistory directo deja la base poblada pero sin el sello (lo pone ensure)', async () => {
    // La función de bajo nivel genera el flujo real; su guardia de "una vez"
    // vive en `ensureHistorySeeded` (el sello es de esa capa).
    const summary = await runProductionHistory();
    expect(summary.arrivals).toHaveLength(2);
    expect(summary.eventIds).toHaveLength(2);
    expect(summary.rootBatchId).toBeTypeOf('string');
    const data = loadDb();
    expect(data.batches).toHaveLength(5);
    expect(data.historySeeded).toBeUndefined();
  });

  it('resetDb vuelve al seed maestro (histórico vacío) y permite resembrar', async () => {
    const summary = await ensureHistorySeeded();
    expect(loadDb().batches).toHaveLength(5);
    expect(summary?.rootBatchId).toBeTypeOf('string');

    resetDb();
    const fresh = loadDb();
    expect(fresh.batches).toEqual([]);
    expect(fresh.batchEvents).toEqual([]);
    expect(fresh.stockMovements).toEqual([]);
    expect(fresh.historySeeded).toBeUndefined(); // el sello se fue con el reset

    const summary2 = await ensureHistorySeeded();
    expect(summary2?.rootBatchId).toBeTypeOf('string');
    // Es una corrida NUEVA: los ids que genera el dominio son otros.
    expect(summary2?.rootBatchId).not.toBe(summary?.rootBatchId);
    expect(loadDb().batches).toHaveLength(5);
    expect(loadDb().batchEvents).toHaveLength(2);
    expect(loadDb().stockMovements).toHaveLength(7);
  });

  it('runProductionHistory usa las cantidades de la receta sembrada', async () => {
    await ensureHistorySeeded();
    const registry = demoRegistry;
    const admin = toDomainActor(ADMIN);
    const recipe = await registry.useCases.recipes.GetRecipe.execute(admin, {
      id: RecipeId.from(DEMO_SEED_IDS.panArtesanal),
    });

    // Los arribos traen exactamente las cantidades del paso 1.
    for (const input of recipe.steps[0].inputs) {
      const arrival = await registry.repos.batches.list({ materialId: input.materialId });
      expect(arrival).toHaveLength(1);
      expect(arrival[0].quantity).toEqual(
        Quantity.create(input.quantity.amount, input.quantity.unit),
      );
    }
    // El lote del paso 2 consume la masa producida (2 kg de la receta).
    // El almacén en /stock queda coherente con la receta: nada queda "a mano".
    const stock = await registry.useCases.traceability.GetStockByLocation.execute(admin, {
      locationId: LocationId.from(DEMO_SEED_IDS.almacen),
    });
    expect(stock.map((entry) => entry.materialId).sort()).toEqual([
      DEMO_SEED_IDS.agua,
      DEMO_SEED_IDS.harina,
      DEMO_SEED_IDS.masa,
      DEMO_SEED_IDS.pan,
    ]);
  });
});
