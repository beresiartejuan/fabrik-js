import type { TimeSlotWire } from '../types';
import type { DemoData, DemoUserRow } from './db';

/**
 * Seed del runtime DEMO: espejo de `apps/api/src/persistence/seed.ts`
 * (docs/09-plan-de-api.md, Fase 7) con ids **legibles y cortos** (`mat-harina`,
 * `loc-almacen-1`, …) porque el dominio no impone formato (`*Id.from` solo
 * castea) y para la demo son UX pura.
 *
 * Ajustes deliberados respecto al seed real:
 * - **Contraseñas planas** (`admin`/`admin`, `operario`/`operario`,
 *   `auditor`/`auditor`). El auth demo compara en claro: el scrypt del hash y el
 *   JWT del `apps/api` están ausentes **a propósito** (no hay backend que
 *   verificar; aquí solo cuentan el flujo y los roles).
 * - **Sin histórico**: `batches`, `batchEvents` y `stockMovements` quedan vacíos;
 *   una tarea posterior siembra el "historial" ejecutando use cases reales.
 * - **Asignación de jornada completa** (`00:00`–`24:00`, los 7 días):
 *   `TimeSlot.create` admite `'24:00'` como fin de jornada (1440), así que
 *   `activeNow` es siempre `true` y el flujo de producción "siempre funciona",
 *   a cualquier hora local, igual que el seed de la API.
 *
 * El seed es **determinista**: ninguna llamada lo cambia (sin `Date.now` ni
 * `Math.random`). Los timestamps (`savedAt`) los pone `db.ts`, no el seed.
 */

/**
 * Usuarios de demo. `id` **es el `workerId`** (misma identidad que la API real:
 * las credenciales se resuelven por worker a partir de ese id), y es a la vez el
 * id del worker en `DemoData.workers`.
 */
export const DEMO_SEED_USERS: readonly DemoUserRow[] = [
  { id: 'usr-admin', name: 'admin', password: 'admin', role: 'admin' },
  { id: 'usr-operario', name: 'operario', password: 'operario', role: 'worker' },
  { id: 'usr-auditor', name: 'auditor', password: 'auditor', role: 'auditor' },
];

/** Ids canónicos del seed (para tests, guiones de demo y documentación). */
export const DEMO_SEED_IDS = {
  admin: 'usr-admin',
  operario: 'usr-operario',
  auditor: 'usr-auditor',
  almacen: 'loc-almacen-1',
  produccion: 'loc-produccion-1',
  harina: 'mat-harina',
  agua: 'mat-agua',
  masa: 'mat-masa',
  pan: 'mat-pan',
  mezcladora: 'maq-mezcladora-1',
  panArtesanal: 'rec-pan-artesanal',
  paso1: 'rec-pan-artesanal-paso-1',
  paso2: 'rec-pan-artesanal-paso-2',
  asignacionOperario: 'asg-operario-mezcladora-1',
} as const;

/**
 * Construye el estado inicial completo de la demo. Devuelve un objeto **nuevo**
 * en cada llamada (literal inline); los consumidores (tests, `loadDb`) nunca
 * comparten referencias entre builds.
 */
export function buildSeed(): DemoData {
  return {
    users: DEMO_SEED_USERS.map((user) => ({ ...user })),
    // Los workers son los mismos usuarios de demo (users.id === workers.id).
    workers: DEMO_SEED_USERS.map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      active: true,
    })),

    locations: [
      { id: DEMO_SEED_IDS.almacen, name: 'Almacén central', kind: 'storage' },
      { id: DEMO_SEED_IDS.produccion, name: 'Planta de producción', kind: 'production' },
    ],

    materials: [
      {
        id: DEMO_SEED_IDS.harina,
        name: 'Harina',
        description: 'Suministro de demo',
        kind: 'supply',
        physicalState: 'solid',
        unitOfMeasure: 'kg',
        active: true,
      },
      {
        id: DEMO_SEED_IDS.agua,
        name: 'Agua',
        description: 'Suministro de demo',
        kind: 'supply',
        physicalState: 'liquid',
        unitOfMeasure: 'l',
        active: true,
      },
      {
        id: DEMO_SEED_IDS.masa,
        name: 'Masa',
        description: 'Producto intermedio de demo',
        kind: 'product',
        physicalState: 'solid',
        unitOfMeasure: 'kg',
        active: true,
      },
      {
        id: DEMO_SEED_IDS.pan,
        name: 'Pan',
        description: 'Producto final de demo',
        kind: 'product',
        physicalState: 'solid',
        unitOfMeasure: 'unit',
        active: true,
      },
    ],

    machines: [
      {
        id: DEMO_SEED_IDS.mezcladora,
        name: 'Mezcladora',
        type: 'mixer',
        locationId: DEMO_SEED_IDS.produccion,
        status: 'idle',
      },
    ],

    // Receta de dos pasos (docs/03): harina + agua → masa → pan.
    recipes: [
      {
        id: DEMO_SEED_IDS.panArtesanal,
        name: 'Pan artesanal',
        outputProductId: DEMO_SEED_IDS.pan,
        outputQuantity: { amount: 1, unit: 'unit' },
        steps: [
          {
            id: DEMO_SEED_IDS.paso1,
            position: 1,
            machineType: 'mixer',
            inputs: [
              { materialId: DEMO_SEED_IDS.harina, quantity: { amount: 2, unit: 'kg' } },
              { materialId: DEMO_SEED_IDS.agua, quantity: { amount: 1, unit: 'l' } },
            ],
            outputProductId: DEMO_SEED_IDS.masa,
            outputQuantity: { amount: 2, unit: 'kg' },
          },
          {
            id: DEMO_SEED_IDS.paso2,
            position: 2,
            machineType: 'mixer',
            inputs: [{ materialId: DEMO_SEED_IDS.masa, quantity: { amount: 2, unit: 'kg' } }],
            outputProductId: DEMO_SEED_IDS.pan,
            outputQuantity: { amount: 1, unit: 'unit' },
          },
        ],
      },
    ],

    // Operario asignado a la mezcladora de lunes a domingo todo el día (I3):
    // `TimeSlot` admite `24:00` como fin de jornada, así que `activeNow` del
    // `me/schedule` demo es siempre `true`.
    assignments: [
      {
        id: DEMO_SEED_IDS.asignacionOperario,
        workerId: DEMO_SEED_IDS.operario,
        machineId: DEMO_SEED_IDS.mezcladora,
        slot: {
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          start: '00:00',
          end: '24:00',
        } satisfies TimeSlotWire,
      },
    ],

    // Histórico vacío: una tarea posterior llena estos colecciones ejecutando
    // los use cases reales de `@fabrik/domain` ("seed history").
    batches: [],
    batchEvents: [],
    stockMovements: [],
  };
}
