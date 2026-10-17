// Barrel de puertos (Fase 4): interfaces de repositorio + UnitOfWork que el
// dominio define y la API (Drizzle/Turso) implementa, más los fakes in-memory
// para tests en `src/testing`.

export * from './assignment-repository.js';
export * from './batch-event-repository.js';
export * from './batch-repository.js';
export * from './location-repository.js';
export * from './machine-repository.js';
export * from './material-repository.js';
export * from './recipe-repository.js';
export * from './stock-movement-repository.js';
export * from './unit-of-work.js';
export * from './worker-repository.js';
