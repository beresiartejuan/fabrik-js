import type {
  BatchStatus,
  DayOfWeek,
  LocationKind,
  MachineStatus,
  MachineType,
  MaterialKind,
  PhysicalState,
  StockMovementReason,
  UnitOfMeasure,
  WorkerRole,
} from '@fabrik/domain';

/**
 * DTOs de wire de la API (`apps/api`), espejo explícito de los serializadores.
 *
 * Reglas (docs/10-plan-de-web.md):
 * - Los **ids viajan como `string`** (los *branded ids* del dominio no aportan en
 *   runtime y añaden fricción al deserializar JSON).
 * - Se reutilizan las **unions literales** del dominio con `import type`
 *   (`UnitOfMeasure`, `WorkerRole`, `MaterialKind`, `PhysicalState`,
 *   `MachineStatus`, `LocationKind`, `BatchStatus`, `StockMovementReason`,
 *   `DayOfWeek`, `MachineType`).
 * - Los campos opcionales se **omiten** en el wire (no se emiten `null`).
 * - Los `Date` viajan como ISO 8601 (`string`).
 *
 * Referencias que fijan la forma:
 * - `apps/api/src/common/entity-serializers.ts` (Quantity, TimeSlot, Batch,
 *   BatchEvent, StockMovement, StockByLocationEntry).
 * - `apps/api/src/{materials,locations,machines,workers,recipes,assignments,
 *   production,supplies,batches,batch-events,stock,trace}/**\/*.dto.ts`.
 * - `apps/api/src/auth/{auth.controller.ts,auth.service.ts,dto.ts}`.
 */

// ---------------------------------------------------------------------------
// Value objects compartidos
// ---------------------------------------------------------------------------

/** Cantidad física: `{ amount, unit }`. */
export interface QuantityWire {
  readonly amount: number;
  readonly unit: UnitOfMeasure;
}

/** Delta de stock con signo en `amount`: `{ amount, unit }`. */
export interface StockDeltaWire {
  readonly amount: number;
  readonly unit: UnitOfMeasure;
}

/** Franja horaria: días (0 = domingo … 6 = sábado) + horas `HH:mm`. */
export interface TimeSlotWire {
  readonly daysOfWeek: DayOfWeek[];
  readonly start: string;
  readonly end: string;
}

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

/** `MaterialResponse`. */
export interface MaterialWire {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly kind: MaterialKind;
  readonly physicalState: PhysicalState;
  readonly unitOfMeasure: UnitOfMeasure;
  readonly active: boolean;
}

/** `LocationResponse`. */
export interface LocationWire {
  readonly id: string;
  readonly name: string;
  readonly kind: LocationKind;
}

/** `MachineResponse` (`type` es catálogo abierto = `string`). */
export interface MachineWire {
  readonly id: string;
  readonly name: string;
  readonly type: MachineType;
  readonly locationId: string;
  readonly status: MachineStatus;
}

/** `WorkerResponse`. */
export interface WorkerWire {
  readonly id: string;
  readonly name: string;
  readonly role: WorkerRole;
  readonly active: boolean;
}

// ---------------------------------------------------------------------------
// Recetas
// ---------------------------------------------------------------------------

/** Material + cantidad de un paso de receta. */
export interface MaterialQuantityWire {
  readonly materialId: string;
  readonly quantity: QuantityWire;
}

/** `RecipeStepResponse`. */
export interface RecipeStepWire {
  readonly id: string;
  readonly position: number;
  readonly machineType: MachineType;
  readonly inputs: MaterialQuantityWire[];
  readonly outputProductId: string;
  readonly outputQuantity: QuantityWire;
}

/** `RecipeResponse`. */
export interface RecipeWire {
  readonly id: string;
  readonly name: string;
  readonly outputProductId: string;
  readonly outputQuantity: QuantityWire;
  readonly steps: RecipeStepWire[];
}

// ---------------------------------------------------------------------------
// Asignaciones
// ---------------------------------------------------------------------------

/** `AssignmentResponse`. */
export interface AssignmentWire {
  readonly id: string;
  readonly workerId: string;
  readonly machineId: string;
  readonly slot: TimeSlotWire;
}

/**
 * `MeScheduleItemResponse` (`GET /me/schedule`): asignación + máquina resuelta
 * (`null` si el dato estuviera huérfano) + vigencia calculada **en el servidor**
 * con su reloj (`TimeSlot.contains`).
 */
export interface MeScheduleItemWire extends AssignmentWire {
  readonly machine: MachineWire | null;
  readonly activeNow: boolean;
}

// ---------------------------------------------------------------------------
// Lotes y eventos
// ---------------------------------------------------------------------------

/** `BatchResponse`. */
export interface BatchWire {
  readonly id: string;
  readonly materialId: string;
  readonly quantity: QuantityWire;
  readonly recipeId?: string;
  readonly originBatchEventId?: string;
  readonly status: BatchStatus;
}

/** Referencia material+cantidad dentro de un evento (`BatchQuantityResponse`). */
export interface BatchQuantityWire {
  readonly batchId?: string;
  readonly materialId: string;
  readonly quantity: QuantityWire;
}

/** `BatchEventResponse`; `timestamp` como ISO 8601. */
export interface BatchEventWire {
  readonly id: string;
  readonly machineId: string;
  readonly workerId: string;
  readonly locationId: string;
  readonly recipeStepId?: string;
  readonly inputs: BatchQuantityWire[];
  readonly outputs: BatchQuantityWire[];
  readonly observation?: string;
  readonly timestamp: string;
}

/** Respuesta de `POST /production/transform`. */
export interface TransformationWire {
  readonly event: BatchEventWire;
  readonly outputBatches: BatchWire[];
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

/** `StockMovementResponse`; `timestamp` como ISO 8601. */
export interface StockMovementWire {
  readonly id: string;
  readonly locationId: string;
  readonly materialId: string;
  readonly delta: StockDeltaWire;
  readonly reason: StockMovementReason;
  readonly batchEventId?: string;
  readonly timestamp: string;
}

/** `StockByLocationEntryResponse`: stock agregado por lugar. */
export interface StockByLocationEntryWire {
  readonly materialId: string;
  readonly amount: number;
  readonly unit: UnitOfMeasure;
}

// ---------------------------------------------------------------------------
// Trazabilidad
// ---------------------------------------------------------------------------

/** Nodo de genealogía hacia atrás (`BatchTraceNodeResponse`). */
export interface BatchTraceNodeWire {
  readonly batch: BatchWire;
  readonly event?: BatchEventWire;
  readonly children: BatchTraceNodeWire[];
  readonly cycleDetected?: boolean;
}

/** Nodo de genealogía hacia adelante / recall (`BatchForwardNodeResponse`). */
export interface BatchForwardNodeWire {
  readonly batch?: BatchWire;
  readonly event?: BatchEventWire;
  readonly children: BatchForwardNodeWire[];
  readonly cycleDetected?: boolean;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** `AuthTokens` (login/refresh). */
export interface AuthTokensWire {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  /** Vida del access token en segundos. */
  readonly expiresIn: number;
}

/** `GET /auth/me`: actor resuelto por el guard. */
export interface ActorWire {
  readonly workerId: string;
  readonly role: WorkerRole;
}

/** `POST /auth/login`. */
export interface LoginRequestWire {
  readonly name: string;
  readonly password: string;
}

/** `POST /auth/refresh`. */
export interface RefreshRequestWire {
  readonly refreshToken: string;
}

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

/**
 * Cuerpo estable del `DomainExceptionFilter`: `error` es el **nombre** de la
 * clase de error de dominio y `context` los campos tipados propios.
 */
export interface ApiErrorBody {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
  readonly context?: Record<string, unknown>;
}
