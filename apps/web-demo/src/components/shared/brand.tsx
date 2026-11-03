import { FactoryIcon } from 'lucide-react';

/** Marca de Fabrik: ícono sobre fondo primario + wordmark. */
export function Brand({ className }: { readonly className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
        <FactoryIcon className="size-4.5" aria-hidden="true" />
      </span>
      <span className="font-heading text-lg font-semibold tracking-tight">Fabrik</span>
    </span>
  );
}
