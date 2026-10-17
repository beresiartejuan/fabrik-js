// Barrel de casos de uso (Fase 5: catálogos; Fase 6: asignaciones; Fase 7:
// producción + stock). Patrón uniforme: cada caso de uso es una clase con
// dependencias inyectadas (puertos + EventBus) y un único `execute(actor,
// command)`. La autorización por rol se aplica con `requireRole`.
export * from './actor';
export * from './assignment-use-cases';
export * from './location-use-cases';
export * from './machine-use-cases';
export * from './material-use-cases';
export * from './production-use-cases';
export * from './recipe-use-cases';
export * from './worker-use-cases';
