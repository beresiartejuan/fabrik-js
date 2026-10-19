import type { WorkerRole } from '@fabrik/domain';

import type {
  AssignmentWire,
  BatchEventWire,
  BatchWire,
  LocationWire,
  MachineWire,
  MaterialWire,
  RecipeWire,
  StockMovementWire,
  WorkerWire,
} from '../types';

import { buildSeed } from './seed';

/**
 * "Base de datos" del runtime DEMO sobre `sessionStorage`.
 *
 * El demo no tiene backend: los módulos `lib/api/demo/*` servirán estos datos a
 * la UI (misma forma de wire que la API real) y guardarán los resultados de los
 * use cases de `@fabrik/domain` sobre esta base. Las filas son **los DTOs de
 * wire de `../types`, tal cual**: los ids van como `string` (los branded ids del
 * dominio son strings en runtime), `Quantity`/`TimeSlot` como `{ amount, unit }`
 * / `{ daysOfWeek, start, end }` y los `Date` como ISO. Es exactamente la lógica
 * de `apps/api/src/common/entity-serializers.ts`, así que *repositorio → wire →
 * UI* y *wire → repositorio (hidratación con `*Id.from`, `Quantity.create`,
 * `TimeSlot.create`)* quedan 1:1 con la API.
 *
 * Formato persistido en la clave `fabrik.demo.db`:
 *
 *     { schemaVersion: 1, savedAt: "<ISO>", data: DemoData }
 *
 * - **`sessionStorage` = aislamiento por pestaña, a propósito**: cada pestaña del
 *   demo tiene su propio mundo (se pueden abrir dos demos en paralelo sin
 *   interferirse y cerrar la pestaña descarta el estado). El resto de la app
 *   (`session-store.ts`) también usa `sessionStorage`, así que la sesión y los
 *   datos comparten vida por pestaña.
 * - **Reset**: `resetDb()` (para el botón/un comando de reset que cableará una
 *   tarea posterior), o en la consola del navegador
 *   `sessionStorage.removeItem('fabrik.demo.db')` + refrescar, o simplemente
 *   cerrar y reabrir la pestaña.
 * - **Tolerancia**: la primera lectura siembra (`buildSeed`) de forma
 *   transparente; JSON corrupto, `schemaVersion` distinta o una forma inválida
 *   se descartan y se resembra — nunca se tumba la demo por estado inválido.
 * - **Solo navegador** (`typeof window === 'undefined'` → error claro): el
 *   estado vive en `sessionStorage`, así que invocar estas funciones en
 *   SSR/prerender es un error de integración y debe fallar rápido, no hacer no-op
 *   silencioso (al contrario que `session-store.ts`, que tolera el servidor).
 * - **Ids sin contadores**: el dominio genera ids (`*Id.create()`, UUID v4) al
 *   crear entidades; aquí solo se persisten. El seed usa ids legibles fijos.
 * - `batches`, `batchEvents` y `stockMovements` quedan **vacíos en el seed**:
 *   una tarea posterior llena el "historial" ejecutando use cases reales.
 */

/** Clave de `sessionStorage` (no colisiona con `fabrik.session` del auth). */
export const DEMO_DB_STORAGE_KEY = 'fabrik.demo.db';

/** Versión del esquema persistido: un cambio de forma bumpa esto y resembra. */
export const DEMO_DB_SCHEMA_VERSION = 1;

/**
 * Credencial de acceso de demo: contraseña **en claro** a propósito (el auth
 * demo compara la contraseña sin hash; el scrypt y el JWT son del backend real
 * y allí se quedan). `id` es el `workerId` — misma identidad que la API real.
 */
export interface DemoUserRow {
  readonly id: string;
  readonly name: string;
  readonly password: string;
  readonly role: WorkerRole;
}

/**
 * Estado completo del demo. Cada colección espeja un agregado del dominio con su
 * DTO de wire (`../types`), en el mismo orden de persistencia que `apps/api`:
 * catálogos + asignaciones + histórico de producción/stock.
 *
 * `batches`, `batchEvents` y `stockMovements` son **colecciones requeridas**
 * (se tipan como array, empiezan vacías) porque el histórico que sembrará una
 * tarea posterior con use cases reales necesita dónde persistir: lotes, sus
 * eventos de transformación y los movimientos de stock (el stock se calcula
 * sumando `delta` por lugar, igual que la API).
 */
export interface DemoData {
  readonly users: DemoUserRow[];
  readonly workers: WorkerWire[];
  readonly locations: LocationWire[];
  readonly materials: MaterialWire[];
  readonly machines: MachineWire[];
  readonly recipes: RecipeWire[];
  readonly assignments: AssignmentWire[];
  /** Vacío en el seed; lo llena el histórico (use cases, tarea posterior). */
  readonly batches: BatchWire[];
  /** Vacío en el seed; ídem. */
  readonly batchEvents: BatchEventWire[];
  /** Vacío en el seed; ídem. */
  readonly stockMovements: StockMovementWire[];
  /**
   * Sello del "histórico" de producción: la primera vez que arranca una pestaña
   * se ejecuta el flujo de docs/03 **con use cases reales** (`history.ts`) y se
   * deja `true`, así el arranque siguiente es no-op (sin duplicar lotes,
   * eventos ni movimientos). Ausente o `false` = sin histórico todavía (seed
   * maestro recién sembrado, o después de un `resetDb`).
   */
  readonly historySeeded?: boolean;
}

/** Sobre la clave de storage: versión del esquema + sello de guardado + data. */
export interface DemoDbEnvelope {
  readonly schemaVersion: number;
  /** Momento del último `saveDb`/seed inicial, en ISO 8601. */
  readonly savedAt: string;
  readonly data: DemoData;
}

// ---------------------------------------------------------------------------
// Guard de navegador
// ---------------------------------------------------------------------------

/** Falla rápido fuera del navegador: el estado demo solo existe en el browser. */
function requireSessionStorage(): Storage {
  if (typeof window === 'undefined') {
    throw new Error(
      '[fabrik-demo] La base demo vive en sessionStorage del navegador: ' +
        'no invoques loadDb/saveDb/resetDb/readRaw en SSR o prerender.',
    );
  }
  return window.sessionStorage;
}

// ---------------------------------------------------------------------------
// Clonación
// ---------------------------------------------------------------------------

/**
 * Copia profunda de `DemoData`. Los datos son JSON plano (sin `Date` ni clases),
 * así que `structuredClone` equivale a un round-trip de JSON: garantiza que lo
 * leído/escrito no comparte referencias con quien lo invocó.
 */
function cloneData(data: DemoData): DemoData {
  return structuredClone(data);
}

// ---------------------------------------------------------------------------
// Validación de forma (sin validadores: check barato y suficiente)
// ---------------------------------------------------------------------------

/** Colecciones requeridas por `DemoData` (todas arrays, vacías o no). */
const DEMO_COLLECTION_KEYS = [
  'users',
  'workers',
  'locations',
  'materials',
  'machines',
  'recipes',
  'assignments',
  'batches',
  'batchEvents',
  'stockMovements',
] as const;

/** `true` si `value` tiene todas las colecciones de `DemoData` como arrays. */
function isDemoDataShape(value: unknown): value is DemoData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return DEMO_COLLECTION_KEYS.every((key) => Array.isArray(record[key]));
}

/**
 * Parsea el sobre persistido: `null` si el JSON está corrupto, la versión del
 * esquema no coincide o las colecciones no están completas. Nunca lanza.
 */
function parseEnvelope(raw: string): DemoDbEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const candidate = parsed as { schemaVersion?: unknown; savedAt?: unknown; data?: unknown };
  if (
    candidate.schemaVersion !== DEMO_DB_SCHEMA_VERSION ||
    typeof candidate.savedAt !== 'string' ||
    !isDemoDataShape(candidate.data)
  ) {
    return null;
  }
  return {
    schemaVersion: DEMO_DB_SCHEMA_VERSION,
    savedAt: candidate.savedAt,
    data: candidate.data,
  };
}

// ---------------------------------------------------------------------------
// Lectura/escritura del storage (todas tolerantes para no tumbar la demo)
// ---------------------------------------------------------------------------

function readStoredRaw(storage: Storage): string | null {
  try {
    return storage.getItem(DEMO_DB_STORAGE_KEY);
  } catch {
    return null; // storage bloqueado → se comporta como vacío y se resembra.
  }
}

function writeEnvelope(storage: Storage, envelope: DemoDbEnvelope): void {
  try {
    storage.setItem(DEMO_DB_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Quota/deshabilitado: se ignora igual que `session-store.ts`. La demo
    // sigue corriendo con el último estado persistido en vez de tumbarse.
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Carga la base demo; siembra de forma **transparente** en el primer acceso (o
 * cuando lo persistido no se puede leer). Devuelve siempre un clon profundo.
 */
export function loadDb(): DemoData {
  const storage = requireSessionStorage();
  const raw = readStoredRaw(storage);
  if (raw !== null) {
    const envelope = parseEnvelope(raw);
    if (envelope !== null) {
      return cloneData(envelope.data);
    }
  }

  // Primera vez o estado ilegible: se descarta y se resembra.
  const seeded = buildSeed();
  writeEnvelope(storage, {
    schemaVersion: DEMO_DB_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    data: seeded,
  });
  return seeded;
}

/**
 * Escritura *write-through*: guarda el sobre completo con `savedAt` nuevo y una
 * copia profunda de `data`, de modo que mutar el objeto entregado después de
 * `saveDb` no altera lo persistido.
 */
export function saveDb(data: DemoData): void {
  const storage = requireSessionStorage();
  writeEnvelope(storage, {
    schemaVersion: DEMO_DB_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    data: cloneData(data),
  });
}

/**
 * Vuelve al estado de fábrica: limpia la clave y resembra de inmediato, así que
 * después de `resetDb()` la base ya está lista sin cargar de nuevo.
 */
export function resetDb(): void {
  const storage = requireSessionStorage();
  try {
    storage.removeItem(DEMO_DB_STORAGE_KEY);
  } catch {
    // Sin storage activo no hay nada que limpiar; el re-seed de abajo es no-op.
  }
  loadDb();
}

/**
 * Lee el sobre crudo tal cual está persistido (`null` si no hay datos válidos).
 * Para tests y debug: **no** siembra ni repara nada, refleja el storage real.
 */
export function readRaw(): DemoDbEnvelope | null {
  const storage = requireSessionStorage();
  const raw = readStoredRaw(storage);
  return raw === null ? null : parseEnvelope(raw);
}
