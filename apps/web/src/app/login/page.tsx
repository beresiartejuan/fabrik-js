'use client';

import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useId, useState } from 'react';

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
 * Flujo: `POST /auth/login` → `signIn` guarda tokens + nombre → `GET /auth/me`
 * resuelve el `Actor` con `setWorker` → `router.replace('/')`. Si ya hay sesión,
 * redirige a `/`.
 *
 * Errores: `401` se mapea a "Nombre o contraseña incorrectos" (el interceptor
 * no refresca en `/auth/login`, así que el 401 llega a la UI); el resto usa
 * `errorToMessage` (red, 403, 500…).
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
        // El Actor se reintenta en `RequireAuth` (GET /auth/me) al entrar al shell.
      }
      router.replace('/');
    } catch (cause) {
      setError(loginErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="gap-1">
          <CardTitle className="font-heading text-xl">Fabrik</CardTitle>
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
            Demo: <code className="font-mono">admin</code> /{' '}
            <code className="font-mono">admin123</code>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
