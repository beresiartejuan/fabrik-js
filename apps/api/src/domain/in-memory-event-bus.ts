import type { DomainEvent, EventBus } from '@fabrik/domain';

/**
 * `EventBus` in-process (Fase 2, docs/09).
 *
 * El contrato del dominio (`packages/domain/src/events/event-bus.ts`) es mínimo:
 * solo `publish(event): void | Promise<void>`. No hay `subscribe`, así que el
 * adaptador no inventa una API pública de suscripción; en su lugar **acumula** los
 * eventos publicados para que los tests puedan afirmar qué se emitió. En
 * producción el efecto es no-op (los eventos se descartan): cuando haga falta
 * entrega real (colas, webhooks) se sustituye este provider por el adaptador
 * correspondiente sin tocar el dominio.
 */
export class InMemoryEventBus implements EventBus {
  private readonly events: DomainEvent[] = [];

  /** Eventos publicados en orden de emisión (solo para inspección en tests). */
  get published(): readonly DomainEvent[] {
    return this.events;
  }

  publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  /** Vacía el histórico de eventos publicados. */
  clear(): void {
    this.events.length = 0;
  }
}
