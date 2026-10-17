// Barrel público de la capa de dominio. Re-exporta las subcarpetas públicas en
// orden de dependencia: value objects → errores → eventos → entidades → puertos
// → casos de uso. Las utilidades de test (`src/testing/`) NO forman parte del
// API público y por eso no se re-exportan aquí.

export * from './entities/index.js';
export * from './errors/index.js';
export * from './events/index.js';
export * from './ports/index.js';
export * from './use-cases/index.js';
export * from './value-objects/index.js';
