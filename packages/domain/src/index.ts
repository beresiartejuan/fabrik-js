// Barrel público de la capa de dominio. Re-exporta las subcarpetas públicas en
// orden de dependencia: value objects → errores → eventos → entidades → puertos
// → casos de uso. Las utilidades de test (`src/testing/`) NO forman parte del
// API público y por eso no se re-exportan aquí.
export * from './value-objects';
export * from './errors';
export * from './events';
export * from './entities';
export * from './ports';
export * from './use-cases';
