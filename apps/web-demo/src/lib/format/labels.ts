import type {
  BatchStatus,
  LocationKind,
  MachineStatus,
  MaterialKind,
  PhysicalState,
  StockMovementReason,
  WorkerRole,
} from '@fabrik/domain';

/**
 * Etiquetas y tonos en español de las *unions* del dominio (docs/pantallas.md
 * §Pantallas 3–6). Es el único punto donde se traduce un valor del wire a texto de
 * UI; así las tablas y los badges no reparten literales por todo el código.
 *
 * `BadgeTone` vive aquí (capa `lib`) para que `StatusBadge` (capa `components`) lo
 * importe sin ciclos.
 */

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'info' | 'destructive';

export interface BadgeMeta {
  readonly label: string;
  readonly tone: BadgeTone;
}

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  supply: 'Suministro',
  product: 'Producto',
};

export const PHYSICAL_STATE_LABELS: Record<PhysicalState, string> = {
  solid: 'Sólido',
  liquid: 'Líquido',
  gas: 'Gaseoso',
};

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  production: 'Producción',
  storage: 'Almacén',
};

export const MACHINE_STATUS_LABELS: Record<MachineStatus, string> = {
  idle: 'Inactiva',
  running: 'En marcha',
  maintenance: 'Mantenimiento',
};

export const WORKER_ROLE_LABELS: Record<WorkerRole, string> = {
  admin: 'Administrador',
  worker: 'Operario',
  auditor: 'Auditor',
};

export const MATERIAL_KIND_META: Record<MaterialKind, BadgeMeta> = {
  supply: { label: MATERIAL_KIND_LABELS.supply, tone: 'info' },
  product: { label: MATERIAL_KIND_LABELS.product, tone: 'success' },
};

export const PHYSICAL_STATE_META: Record<PhysicalState, BadgeMeta> = {
  solid: { label: PHYSICAL_STATE_LABELS.solid, tone: 'neutral' },
  liquid: { label: PHYSICAL_STATE_LABELS.liquid, tone: 'info' },
  gas: { label: PHYSICAL_STATE_LABELS.gas, tone: 'warning' },
};

export const LOCATION_KIND_META: Record<LocationKind, BadgeMeta> = {
  production: { label: LOCATION_KIND_LABELS.production, tone: 'success' },
  storage: { label: LOCATION_KIND_LABELS.storage, tone: 'info' },
};

export const MACHINE_STATUS_META: Record<MachineStatus, BadgeMeta> = {
  idle: { label: MACHINE_STATUS_LABELS.idle, tone: 'neutral' },
  running: { label: MACHINE_STATUS_LABELS.running, tone: 'success' },
  maintenance: { label: MACHINE_STATUS_LABELS.maintenance, tone: 'warning' },
};

export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  in_progress: 'En curso',
  stored: 'Almacenado',
  completed: 'Completada',
};

export const BATCH_STATUS_META: Record<BatchStatus, BadgeMeta> = {
  in_progress: { label: BATCH_STATUS_LABELS.in_progress, tone: 'info' },
  stored: { label: BATCH_STATUS_LABELS.stored, tone: 'success' },
  completed: { label: BATCH_STATUS_LABELS.completed, tone: 'neutral' },
};

/** Motivo de un movimiento de stock (Fase 5). */
export const STOCK_REASON_LABELS: Record<StockMovementReason, string> = {
  supply_in: 'Ingreso de suministro',
  produced: 'Producción',
  consumed: 'Consumo',
  transfer_in: 'Transferencia entrada',
  transfer_out: 'Transferencia salida',
  manual_adjustment: 'Ajuste manual',
};

export const STOCK_REASON_META: Record<StockMovementReason, BadgeMeta> = {
  supply_in: { label: STOCK_REASON_LABELS.supply_in, tone: 'info' },
  produced: { label: STOCK_REASON_LABELS.produced, tone: 'success' },
  consumed: { label: STOCK_REASON_LABELS.consumed, tone: 'warning' },
  transfer_in: { label: STOCK_REASON_LABELS.transfer_in, tone: 'info' },
  transfer_out: { label: STOCK_REASON_LABELS.transfer_out, tone: 'warning' },
  manual_adjustment: { label: STOCK_REASON_LABELS.manual_adjustment, tone: 'neutral' },
};

/** Estado lógico (`active`) del material/trabajador. */
export const ACTIVE_META: Record<'active' | 'inactive', BadgeMeta> = {
  active: { label: 'Activo', tone: 'success' },
  inactive: { label: 'Inactivo', tone: 'neutral' },
};

/** Meta de `active` a partir del booleano del wire. */
export function activeMeta(active: boolean): BadgeMeta {
  return active ? ACTIVE_META.active : ACTIVE_META.inactive;
}
