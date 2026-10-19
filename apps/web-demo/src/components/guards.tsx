'use client';

import type { WorkerRole } from '@fabrik/domain';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { authApi } from '@/lib/api/modules/authApi';
import { useSession } from '@/lib/session/session-store';

import { PageLoading } from './page-loading';

/**
 * Guardas de sesión y rol del shell client-rendered (docs/10-plan-de-web.md
 * §App shell y §Guardas). Los tokens viven en `sessionStorage`, por eso todo el
 * grupo `(app)` es cliente y la hidratación ocurre en un `useEffect`; hasta
 * entonces se muestra `PageLoading` (nunca contenido privado).
 *
 * `RequireRole` decide **redirigir al dashboard** (`/`) ante un rol indebido en
 * vez de mostrar una pantalla "sin permisos": la navegación ya filtra por rol y
 * el RBAC real lo decide el dominio (403), así que un redirect evita callejones
 * sin salida. Si en el futuro se prefiere un mensaje dedicado, cambiar aquí.
 */

export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { session, hydrated, setWorker, signOut } = useSession();

  // Sesión con tokens pero sin `Actor` (p. ej. login sin `me`): se resuelve con
  // `GET /auth/me`. El interceptor de axios ya maneja el 401 (logout + redirect).
  const needsWorker = Boolean(session && !session.worker);

  useEffect(() => {
    if (hydrated && !session) {
      router.replace('/login');
    }
  }, [hydrated, session, router]);

  useEffect(() => {
    if (!needsWorker) {
      return;
    }
    let cancelled = false;
    authApi.me().then(
      (actor) => {
        if (!cancelled) {
          setWorker(actor);
        }
      },
      () => {
        if (!cancelled) {
          signOut();
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [needsWorker, setWorker, signOut]);

  if (!hydrated || !session || needsWorker) {
    return <PageLoading />;
  }

  return <>{children}</>;
}

export interface RequireRoleProps {
  readonly roles: readonly WorkerRole[];
  readonly children: ReactNode;
}

export function RequireRole({ roles, children }: RequireRoleProps) {
  const router = useRouter();
  const { session, hydrated } = useSession();

  const role = session?.worker?.role;
  const allowed = role !== undefined && roles.includes(role);

  useEffect(() => {
    if (hydrated && role !== undefined && !allowed) {
      router.replace('/');
    }
  }, [hydrated, role, allowed, router]);

  if (!hydrated || role === undefined || !allowed) {
    return <PageLoading />;
  }

  return <>{children}</>;
}
