import type { DomainEvent } from './domain-event';

/**
 * Bus de eventos de dominio. Interfaz mínima: cada app decide la implementación
 * (in-process síncrono al inicio; colas reales luego, sin tocar el dominio).
 */
export interface EventBus {
  publish(event: DomainEvent): void | Promise<void>;
}
