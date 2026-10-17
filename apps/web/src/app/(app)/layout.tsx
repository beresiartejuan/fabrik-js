'use client';

import { LogOutIcon, MenuIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { RequireAuth } from '@/components/guards';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
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
    <div className="flex h-14 shrink-0 items-center border-b px-4">
      <Link href="/" className="font-heading text-lg font-semibold">
        Fabrik
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
    <div className="flex min-h-screen w-full bg-muted/30">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-background md:flex">
        <SidebarBrand />
        <SidebarNav items={items} pathname={pathname} />
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
                <SheetTitle className="flex h-14 items-center px-4">Fabrik</SheetTitle>
              </SheetHeader>
              <SidebarNav
                items={items}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <span className="font-heading text-sm font-medium md:hidden">Fabrik</span>

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
    </div>
  );
}
