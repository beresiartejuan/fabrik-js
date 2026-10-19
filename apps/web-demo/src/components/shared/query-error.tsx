import { Button } from '@/components/ui/button';
import { errorToMessage } from '@/lib/api/errors';

/**
 * Bloque de error para una consulta fallida (docs/pantallas.md §Pantallas
 * 3–6). Evita mostrar un estado vacío engañoso cuando en realidad falló la carga;
 * el aviso transitorio lo da además el toast (`useErrorToast`).
 */

export interface QueryErrorProps {
  readonly error: unknown;
  readonly onRetry?: () => void;
}

export function QueryError({ error, onRetry }: QueryErrorProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
    >
      <p>{errorToMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
