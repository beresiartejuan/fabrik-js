'use client';

import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useId, useState } from 'react';

import { Brand } from '@/components/shared/brand';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorToMessage, toApiError } from '@/lib/api/errors';
import { authApi } from '@/lib/api/modules/authApi';
import { useSession } from '@/lib/session/session-store';

/**
 * Pantalla 1 — `/login` (docs/pantallas.md §1). Pública, sin sidebar.
 *
 * Flujo: `authApi.login` → `signIn` guarda tokens + nombre → `authApi.me`
 * resuelve el `Actor` con `setWorker` → `router.replace('/')`. Si ya hay sesión,
 * redirige a `/`.
 *
 * Errores: `401` se mapea a "Nombre o contraseña incorrectos." (en demo el
 * `LoginService` demo lanza la misma `ApiError` 401 que el `AuthService` de la
 * API); el resto usa `errorToMessage`.
 */

function loginErrorMessage(error: unknown): string {
  const api = toApiError(error);
  if (api.hasStatus(401)) {
    return 'Nombre o contraseña incorrectos.';
  }
  return errorToMessage(error);
}

export default function LoginPage() {
  const router = useRouter();
  const { session, hydrated, signIn, setWorker } = useSession();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  useEffect(() => {
    if (hydrated && session) {
      router.replace('/');
    }
  }, [hydrated, session, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const tokens = await authApi.login(name, password);
      signIn(tokens, null, name);
      try {
        const actor = await authApi.me();
        setWorker(actor);
      } catch {
        // El Actor se reintenta en `RequireAuth` (authApi.me) al entrar al shell.
      }
      router.replace('/');
    } catch (cause) {
      setError(loginErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-24 size-96 rounded-full bg-sidebar-primary/20 blur-3xl"
        />
        <Brand />
        <div className="relative flex flex-col gap-3">
          <h2 className="font-heading text-3xl leading-tight font-semibold tracking-tight">
            Producción, stock y trazabilidad en un solo lugar.
          </h2>
          <p className="max-w-md text-sidebar-foreground/70">
            De la materia prima al lote terminado, con cada movimiento registrado y cada lote
            rastreable hacia atrás y hacia adelante.
          </p>
        </div>
        <p className="relative text-xs text-sidebar-foreground/50">Fabrik · gestión de fábrica</p>
      </aside>
      <div className="flex items-center justify-center bg-background p-4">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Brand className="lg:hidden" />
          <Card className="w-full shadow-sm">
            <CardHeader className="gap-1">
              <CardTitle className="font-heading text-xl">Bienvenido</CardTitle>
              <CardDescription>Ingresá con tu nombre y contraseña.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} noValidate>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="login-name">Nombre</FieldLabel>
                    <Input
                      id="login-name"
                      name="name"
                      type="text"
                      autoComplete="username"
                      autoFocus
                      required
                      value={name}
                      aria-invalid={error !== null}
                      aria-describedby={error !== null ? errorId : undefined}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="login-password">Contraseña</FieldLabel>
                    <Input
                      id="login-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      aria-invalid={error !== null}
                      aria-describedby={error !== null ? errorId : undefined}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </Field>
                  {error !== null && <FieldError id={errorId}>{error}</FieldError>}
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2Icon className="animate-spin" aria-hidden="true" />}
                    {submitting ? 'Ingresando…' : 'Ingresar'}
                  </Button>
                </FieldGroup>
              </form>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Modo demo — los datos viven solo en esta pestaña. Usuarios:{' '}
                <code className="font-mono">admin/admin</code>,{' '}
                <code className="font-mono">operario/operario</code>,{' '}
                <code className="font-mono">auditor/auditor</code>.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
