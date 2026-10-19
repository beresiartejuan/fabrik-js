import { cn } from 'cn';
import type { ReactNode } from 'react';

/**
 * Estado vacío reutilizable (docs/10-plan-de-web.md §Pantallas 3–6). Se compone
 * sobre primitivas (no se añadió el componente `empty` de shadcn); el texto y el
 * icono los decide cada pantalla, siempre en español.
 */

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-background px-6 py-10 text-center',
        className,
      )}
    >
      {icon && <div className="text-muted-foreground [&_svg]:size-6">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
