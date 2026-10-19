'use client';

import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { machinesApi } from '@/lib/api/modules/machinesApi';
import { materialsApi } from '@/lib/api/modules/materialsApi';
import { workersApi } from '@/lib/api/modules/workersApi';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';
import { isNavHrefEnabled } from '@/lib/nav';

import { PageHeader, StatCard } from './dashboard-common';

/**
 * Dashboard del **admin** (docs/pantallas.md §2): contadores de catálogo
 * (`materials`/`machines`/`workers` activos), acciones rápidas y accesos a los
 * catálogos. Un admin **no** registra transformaciones (worker-only).
 *
 * Los accesos y CTAs se filtran con el registro de `lib/nav`: las secciones de
 * fases futuras (`enabled: false`) no se muestran hasta que exista su pantalla.
 */

const CATALOG_LINKS = [
  { href: '/materiales', label: 'Materiales' },
  { href: '/ubicaciones', label: 'Ubicaciones' },
  { href: '/maquinas', label: 'Máquinas' },
  { href: '/trabajadores', label: 'Trabajadores' },
  { href: '/recetas', label: 'Recetas' },
  { href: '/asignaciones', label: 'Asignaciones' },
].filter((catalog) => isNavHrefEnabled(catalog.href));

export function AdminDashboard() {
  const materials = useApiQuery(() => materialsApi.list());
  const machines = useApiQuery(() => machinesApi.list());
  const workers = useApiQuery(() => workersApi.list());

  // Los contadores degradan a «—» en las tarjetas; el toast avisa el porqué.
  useErrorToast(materials.error);
  useErrorToast(machines.error);
  useErrorToast(workers.error);

  const activeMaterials = materials.data?.filter((material) => material.active).length;
  const activeWorkers = workers.data?.filter((worker) => worker.active).length;
  const canCreateProduction = isNavHrefEnabled('/produccion/nueva');
  const canRegisterArrival = isNavHrefEnabled('/suministros/arribo');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Panel" description="Resumen de la fábrica y accesos a los catálogos." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Materiales activos"
          value={activeMaterials}
          loading={materials.loading}
          error={materials.error !== null}
        />
        <StatCard
          label="Máquinas"
          value={machines.data?.length}
          loading={machines.loading}
          error={machines.error !== null}
        />
        <StatCard
          label="Trabajadores activos"
          value={activeWorkers}
          loading={workers.loading}
          error={workers.error !== null}
        />
      </div>

      {(canCreateProduction || canRegisterArrival) && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-medium">Acciones rápidas</h2>
          <div className="flex flex-wrap gap-2">
            {canCreateProduction && (
              <Link href="/produccion/nueva" className={buttonVariants()}>
                Nueva producción
              </Link>
            )}
            {canRegisterArrival && (
              <Link href="/suministros/arribo" className={buttonVariants({ variant: 'outline' })}>
                Registrar arribo
              </Link>
            )}
          </div>
        </section>
      )}

      {CATALOG_LINKS.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-medium">Catálogos</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CATALOG_LINKS.map((catalog) => (
              <Link key={catalog.href} href={catalog.href}>
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-base">{catalog.label}</CardTitle>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
