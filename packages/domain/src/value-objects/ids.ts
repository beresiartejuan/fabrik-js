// Identidades opacas de las entidades. Son strings "branded": en runtime son
// strings normales, pero el tipo evita mezclar IDs de entidades distintas.
declare const idBrand: unique symbol;

export type BrandedId<Name extends string> = string & { readonly [idBrand]: Name };

// Contrato común de las fábricas de IDs.
export interface IdFactory<Id extends string> {
  /** Genera una identidad nueva y única (UUID v4). */
  create(): Id;
  /** Reconstituye una identidad a partir de su valor persistido. */
  from(raw: string): Id;
}

interface CryptoLike {
  randomUUID?: () => string;
}

// UUID v4 desde la Web Crypto API global, sin depender de node: ni de tipos DOM.
function generateId(): string {
  const crypto = (globalThis as { crypto?: CryptoLike }).crypto;
  if (!crypto?.randomUUID) {
    throw new Error('crypto.randomUUID no está disponible en este entorno');
  }
  return crypto.randomUUID();
}

export function createIdFactory<Id extends string>(_name: string): IdFactory<Id> {
  return {
    create: () => generateId() as Id,
    from: (raw: string) => raw as Id,
  };
}

export type FactoryId = BrandedId<'FactoryId'>;
export const FactoryId = createIdFactory<FactoryId>('FactoryId');

export type WorkerId = BrandedId<'WorkerId'>;
export const WorkerId = createIdFactory<WorkerId>('WorkerId');

export type MachineId = BrandedId<'MachineId'>;
export const MachineId = createIdFactory<MachineId>('MachineId');

export type MaterialId = BrandedId<'MaterialId'>;
export const MaterialId = createIdFactory<MaterialId>('MaterialId');

export type LocationId = BrandedId<'LocationId'>;
export const LocationId = createIdFactory<LocationId>('LocationId');

export type RecipeId = BrandedId<'RecipeId'>;
export const RecipeId = createIdFactory<RecipeId>('RecipeId');

export type RecipeStepId = BrandedId<'RecipeStepId'>;
export const RecipeStepId = createIdFactory<RecipeStepId>('RecipeStepId');

export type BatchId = BrandedId<'BatchId'>;
export const BatchId = createIdFactory<BatchId>('BatchId');

export type BatchEventId = BrandedId<'BatchEventId'>;
export const BatchEventId = createIdFactory<BatchEventId>('BatchEventId');

export type AssignmentId = BrandedId<'AssignmentId'>;
export const AssignmentId = createIdFactory<AssignmentId>('AssignmentId');

export type StockMovementId = BrandedId<'StockMovementId'>;
export const StockMovementId = createIdFactory<StockMovementId>('StockMovementId');
