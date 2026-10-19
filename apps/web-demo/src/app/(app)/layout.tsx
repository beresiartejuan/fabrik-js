'use client';

import { LogOutIcon, MenuIcon, RotateCcwIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { RequireAuth } from '@/components/guards';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { resetDb } from '@/lib/api/demo/db';
import { authApi } from '@/lib/api/modules/authApi';
import { isActiveHref, type NavItem, navItemsForRole, ROLE_LABELS } from '@/lib/nav';
import { useSession } from '@/lib/session/session-store';
import { cn } from '@/lib/utils';

/**
 * Layout del grupo `(app)` (docs/10-plan-de-web.md §App shell). Todo el shell es
 * cliente porque los tokens viven en `sessionStorage`:
 *
 * - `RequireAuth` redirige a `/login` sin sesión (y resuelve el `Actor` si falta).
 * - Sidebar **filtrado por rol** (`navItemsForRole`), hand-rolled sobre las
 *   primitivas de shadcn (`sheet` en mobile).
 * - Topbar con nombre + rol y "Cerrar sesión" (`authApi.logout` + limpieza
 *   local + redirect a `/login`).
 * - Afinamientos del **modo demo** (docs/11-plan-demo.md §T5, excepciones de
 *   componente declaradas): badge "DEMO" junto a la marca y acción "Resetear
 *   demo" en el pie del aside (`resetDb()` + reload, con `ConfirmDialog`).
 */

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

/** La marca del sidebar con su badge del modo demo (renderizado incondicional). */
function DemoBadge() {
  return (
    <Badge variant="outline" className="text-[10px] tracking-widest text-muted-foreground">
      DEMO
    </Badge>
  );
}

function SidebarBrand() {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <Link href="/" className="font-heading text-lg font-semibold">
        Fabrik
      </Link>
      <DemoBadge />
    </div>
  );
}

interface SidebarNavProps {
  readonly items: readonly NavItem[];
  readonly pathname: string;
  readonly onNavigate?: () => void;
}

function SidebarNav({ items, pathname, onNavigate }: SidebarNavProps) {
  return (
    <nav className="flex flex-col gap-1 overflow-y-auto p-2" aria-label="Navegación principal">
      {items.map((item) => {
        const active = isActiveHref(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, signOut } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const worker = session?.worker ?? null;
  const role = worker?.role ?? null;
  const items = role ? navItemsForRole(role) : [];

  async function handleLogout(): Promise<void> {
    try {
      await authApi.logout();
    } catch {
      // El token puede estar vencido: igual cerramos la sesión local.
    }
    signOut();
    router.replace('/login');
  }

  function handleResetDemo(): void {
    // Borra la base de la pestaña (`fabrik.demo.db`): el mundo se resiembra,
    // con su histórico, en el primer acceso tras el reload.
    resetDb();
    window.location.reload();
  }

  return (
    <div className="flex min-h-screen w-full bg-muted/30">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-background md:flex">
        <SidebarBrand />
        <SidebarNav items={items} pathname={pathname} />
        <div className="mt-auto border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => setResetOpen(true)}
          >
            <RotateCcwIcon aria-hidden="true" />
            Resetear demo
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="md:hidden"
                  aria-label="Abrir menú"
                />
              }
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 gap-0 p-0">
              <SheetHeader className="shrink-0 border-b p-0">
                <SheetTitle className="flex h-14 items-center gap-2 px-4">
                  Fabrik
                  <DemoBadge />
                </SheetTitle>
              </SheetHeader>
              <SidebarNav
                items={items}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <span className="flex items-center gap-2 md:hidden">
            <span className="font-heading text-sm font-medium">Fabrik</span>
            <DemoBadge />
          </span>

          <div className="ml-auto flex items-center gap-3">
            {role && (
              <div className="flex flex-col items-end leading-tight">
                {session?.name && <span className="text-sm font-medium">{session.name}</span>}
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOutIcon aria-hidden="true" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Resetear demo"
        description="Se borran los datos de esta pestaña (sessionStorage `fabrik.demo.db`) y se vuelve a sembrar el estado inicial con su histórico de producción. Los cambios que hiciste no se pueden recuperar."
        confirmLabel="Resetear"
        destructive
        onConfirm={handleResetDemo}
      />
    </div>
  );
}
