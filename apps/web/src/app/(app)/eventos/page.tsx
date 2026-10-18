'use client';

import { EventsScreen } from '@/components/events/events-screen';
import { RequireRole } from '@/components/guards';

/**
 * Ruta `/eventos` (pantalla 15, Fase 6): historial de transformaciones con
 * filtros (A/Au; ver `EventsScreen`).
 */
export default function EventosPage() {
  return (
    <RequireRole roles={['admin', 'auditor']}>
      <EventsScreen />
    </RequireRole>
  );
}
