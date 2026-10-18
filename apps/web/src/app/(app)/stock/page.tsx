'use client';

import { RequireRole } from '@/components/guards';
import { StockScreen } from '@/components/stock/stock-screen';

/**
 * Ruta `/stock` (pantalla 13): existencias por lugar (A/Au/W) con drawer de
 * movimientos (solo A/Au; ver `StockScreen`).
 */
export default function StockPage() {
  return (
    <RequireRole roles={['admin', 'worker', 'auditor']}>
      <StockScreen />
    </RequireRole>
  );
}
