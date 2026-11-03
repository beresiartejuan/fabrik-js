import type { LucideIcon } from 'lucide-react';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Reexportado desde `shared` para conservar los imports del dashboard.
export { PageHeader } from '@/components/shared/page-header';

export interface StatCardProps {
  readonly label: string;
  readonly value: number | undefined;
  readonly loading: boolean;
  readonly error?: boolean;
  readonly icon?: LucideIcon;
  readonly className?: string;
}

/** Tarjeta de contador con skeleton y estado de error ("—"). */
export function StatCard({
  label,
  value,
  loading,
  error = false,
  icon: Icon,
  className,
}: StatCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="relative gap-1">
        {Icon && (
          <span className="absolute top-0 right-4 flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-4.5" aria-hidden="true" />
          </span>
        )}
        <CardDescription>{label}</CardDescription>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <CardTitle className="text-3xl tabular-nums">{error ? '—' : (value ?? 0)}</CardTitle>
        )}
      </CardHeader>
    </Card>
  );
}

/** Bloque de carga del dashboard (mientras hidrata la sesión o cargan datos). */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
