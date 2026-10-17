// Barrel de casos de uso (Fase 5: catálogos; Fase 6: asignaciones; Fase 7:
// producción + stock; Fase 8: trazabilidad). Patrón uniforme: cada caso de uso es
// una clase con dependencias inyectadas (puertos + EventBus) y un único
// `execute(actor, command)`. La autorización por rol se aplica con `requireRole`.
export * from './actor.js';
export * from './assignment-use-cases.js';
export * from './location-use-cases.js';
export * from './machine-use-cases.js';
export * from './material-use-cases.js';
export * from './production-use-cases.js';
export * from './recipe-use-cases.js';
export * from './traceability-use-cases.js';
export * from './worker-use-cases.js';
