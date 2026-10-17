import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Reexportado desde `shared` para conservar los imports del dashboard.
export { PageHeader } from '@/components/shared/page-header';

export interface StatCardProps {
  readonly label: string;
  readonly value: number | undefined;
  readonly loading: boolean;
  readonly error?: boolean;
  readonly className?: string;
}

/** Tarjeta de contador con skeleton y estado de error ("—"). */
export function StatCard({ label, value, loading, error = false, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="gap-1">
        <CardDescription>{label}</CardDescription>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <CardTitle className="text-3xl">{error ? '—' : (value ?? 0)}</CardTitle>
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
