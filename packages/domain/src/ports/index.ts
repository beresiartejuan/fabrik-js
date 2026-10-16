// Barrel de puertos (Fase 4): interfaces de repositorio + UnitOfWork que el
// dominio define y la API (Drizzle/Turso) implementa, más los fakes in-memory
// para tests en `src/testing`.
export * from './material-repository';
export * from './machine-repository';
export * from './worker-repository';
export * from './location-repository';
export * from './recipe-repository';
export * from './batch-repository';
export * from './batch-event-repository';
export * from './assignment-repository';
export * from './stock-movement-repository';
export * from './unit-of-work';
