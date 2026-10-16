import type { DomainEvent, EventBus } from '../events';

/**
 * Bus de eventos en memoria para tests: acumula los eventos publicados en orden.
 * No forma parte del API público del paquete (vive en src/testing).
 */
export interface CollectingEventBus extends EventBus {
  readonly events: readonly DomainEvent[];
  clear(): void;
}

/** Crea un bus colector: `publish` acumula, `events` expone lo publicado. */
export function collectingEventBus(): CollectingEventBus {
  const published: DomainEvent[] = [];
  return {
    get events(): readonly DomainEvent[] {
      return published;
    },
    publish(event: DomainEvent): void {
      published.push(event);
    },
    clear(): void {
      published.length = 0;
    },
  };
}
