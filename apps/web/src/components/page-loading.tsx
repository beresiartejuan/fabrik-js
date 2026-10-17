import { Loader2Icon } from 'lucide-react';

/**
 * Estado de carga a pantalla completa del shell (`RequireAuth`/`RequireRole`).
 *
 * Se usa mientras la sesión hidrata desde `sessionStorage` o mientras se resuelve
 * el `Actor` con `GET /auth/me`; evita el parpadeo y el *flash* de contenido
 * privado antes de redirigir a `/login`.
 */
export function PageLoading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Loader2Icon className="size-6 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
