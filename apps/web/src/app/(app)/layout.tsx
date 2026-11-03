'use client';

import { LogOutIcon, MenuIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { RequireAuth } from '@/components/guards';
import { Brand } from '@/components/shared/brand';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
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
 * - Topbar con nombre + rol y "Cerrar sesión" (`POST /auth/logout` + limpieza
 *   local + redirect a `/login`).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

function SidebarBrand() {
  return (
    <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
      <Link href="/" aria-label="Fabrik, ir al inicio">
        <Brand />
      </Link>
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

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <SidebarBrand />
        <SidebarNav items={items} pathname={pathname} />
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
                <SheetTitle className="flex h-14 items-center px-4 text-sidebar-foreground">
                  <Brand />
                </SheetTitle>
              </SheetHeader>
              <SidebarNav
                items={items}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <Brand className="md:hidden" />

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
    </div>
  );
}
