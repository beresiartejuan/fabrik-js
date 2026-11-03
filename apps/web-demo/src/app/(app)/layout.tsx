'use client';

import { LogOutIcon, MenuIcon, RotateCcwIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { RequireAuth } from '@/components/guards';
import { Brand } from '@/components/shared/brand';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { resetDb } from '@/lib/api/demo/db';
import { authApi } from '@/lib/api/modules/authApi';
import {
  activeNavHref,
  NAV_GROUP_LABELS,
  type NavItem,
  navItemsForRole,
  ROLE_LABELS,
} from '@/lib/nav';
import { useSession } from '@/lib/session/session-store';
import { cn } from '@/lib/utils';

/**
 * Layout del grupo `(app)` (docs/arquitectura.md §App shell). Todo el shell es
 * cliente porque los tokens viven en `sessionStorage`:
 *
 * - `RequireAuth` redirige a `/login` sin sesión (y resuelve el `Actor` si falta).
 * - Sidebar **filtrado por rol** (`navItemsForRole`), hand-rolled sobre las
 *   primitivas de shadcn (`sheet` en mobile).
 * - Topbar con nombre + rol y "Cerrar sesión" (`authApi.logout` + limpieza
 *   local + redirect a `/login`).
 * - Afinamientos del **modo demo** (docs/demo.md §T5, excepciones de
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
function DemoBadge({ onSidebar = false }: { readonly onSidebar?: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] tracking-widest',
        onSidebar ? 'border-sidebar-border text-sidebar-foreground/70' : 'text-muted-foreground',
      )}
    >
      DEMO
    </Badge>
  );
}

function SidebarBrand() {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
      <Link href="/" aria-label="Fabrik, ir al inicio">
        <Brand />
      </Link>
      <DemoBadge onSidebar />
    </div>
  );
}

/** Acción "Resetear demo" del pie del sidebar (escritorio y menú móvil). */
function ResetDemoButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <div className="mt-auto border-t border-sidebar-border p-2">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={onClick}
      >
        <RotateCcwIcon aria-hidden="true" />
        Resetear demo
      </Button>
    </div>
  );
}

interface SidebarNavProps {
  readonly items: readonly NavItem[];
  readonly pathname: string;
  readonly onNavigate?: () => void;
}

function SidebarNav({ items, pathname, onNavigate }: SidebarNavProps) {
  const activeHref = activeNavHref(pathname, items);
  return (
    <nav className="flex flex-col gap-0.5 overflow-y-auto p-3" aria-label="Navegación principal">
      {items.map((item, index) => {
        const active = item.href === activeHref;
        const groupLabel = NAV_GROUP_LABELS[item.group];
        const startsGroup = index === 0 || items[index - 1]?.group !== item.group;
        const Icon = item.icon;
        return (
          <div key={item.href} className="contents">
            {startsGroup && groupLabel && (
              <p className="mt-4 mb-1 px-3 text-[11px] font-medium tracking-wider text-sidebar-foreground/50 uppercase">
                {groupLabel}
              </p>
            )}
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground shadow-sm'
                  : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          </div>
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
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <SidebarBrand />
        <SidebarNav items={items} pathname={pathname} />
        <ResetDemoButton onClick={() => setResetOpen(true)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
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
            <SheetContent
              side="left"
              className="w-64 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
            >
              <SheetHeader className="shrink-0 border-b border-sidebar-border p-0">
                <SheetTitle className="flex h-14 items-center gap-2 px-4 text-sidebar-foreground">
                  <Brand />
                  <DemoBadge onSidebar />
                </SheetTitle>
              </SheetHeader>
              <SidebarNav
                items={items}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
              <ResetDemoButton
                onClick={() => {
                  setMobileOpen(false);
                  setResetOpen(true);
                }}
              />
            </SheetContent>
          </Sheet>

          <span className="flex items-center gap-2 md:hidden">
            <Brand />
            <DemoBadge />
          </span>

          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            {role && (
              <div className="flex items-center gap-2.5">
                <span
                  className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground uppercase"
                  aria-hidden="true"
                >
                  {(session?.name ?? ROLE_LABELS[role]).slice(0, 2)}
                </span>
                <div className="hidden flex-col items-start leading-tight sm:flex">
                  {session?.name && <span className="text-sm font-medium">{session.name}</span>}
                  <span className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
                </div>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOutIcon aria-hidden="true" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">{children}</main>
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
