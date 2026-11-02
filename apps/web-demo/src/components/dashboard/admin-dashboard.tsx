'use client';

import { ArrowRightIcon, BoxesIcon, FactoryIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { machinesApi } from '@/lib/api/modules/machinesApi';
import { materialsApi } from '@/lib/api/modules/materialsApi';
import { workersApi } from '@/lib/api/modules/workersApi';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useErrorToast } from '@/lib/hooks/useErrorToast';
import { isNavHrefEnabled, NAV_ITEMS } from '@/lib/nav';

import { PageHeader, StatCard } from './dashboard-common';

/**
 * Dashboard del **admin** (docs/pantallas.md §2): contadores de catálogo
 * (`materials`/`machines`/`workers` activos), acciones rápidas y accesos a los
 * catálogos. Un admin **no** registra transformaciones (worker-only).
 *
 * Los accesos y CTAs se filtran con el registro de `lib/nav`: las secciones de
 * fases futuras (`enabled: false`) no se muestran hasta que exista su pantalla.
 */

const CATALOG_LINKS = NAV_ITEMS.filter(
  (item) => item.group === 'catalogs' && isNavHrefEnabled(item.href),
);

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
          icon={BoxesIcon}
          value={activeMaterials}
          loading={materials.loading}
          error={materials.error !== null}
        />
        <StatCard
          label="Máquinas"
          icon={FactoryIcon}
          value={machines.data?.length}
          loading={machines.loading}
          error={machines.error !== null}
        />
        <StatCard
          label="Trabajadores activos"
          icon={UsersIcon}
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
              <Link key={catalog.href} href={catalog.href} className="group">
                <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-primary/30">
                  <div className="flex items-center gap-3 px-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <catalog.icon className="size-4.5" aria-hidden="true" />
                    </span>
                    <CardTitle className="flex-1 text-base">{catalog.label}</CardTitle>
                    <ArrowRightIcon
                      className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
