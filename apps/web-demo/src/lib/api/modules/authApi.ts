import { login, me, refresh } from '@/lib/api/demo/auth';
import { toApiError } from '@/lib/api/demo/module-kit';
import { readTokens } from '@/lib/session/session-store';

import type { ActorWire, AuthTokensWire } from '../types';

/**
 * Endpoints de auth (`apps/api/src/auth/auth.controller.ts`) sobre el **core
 * de auth del demo** (`demo/auth.ts`, docs/11-plan-demo.md §5: la auth no vive
 * en el dominio — acá se reproduce el *comportamiento observable* del
 * `AuthService`).
 *
 * - `login` (público): `demoLogin(name, password)` compara la contraseña en
 *   claro contra la fila de usuario sembrada (`users.id === workers.id`) y
 *   devuelve el par de tokens opacos (`demo-access.<id>` / `demo-refresh.<id>`,
 *   `tokenType: 'Bearer'`, `expiresIn` nominal). Credenciales inválidas y
 *   usuario desconocido producen **el mismo 401** (`'Credenciales inválidas'`).
 * - `refresh` (público): rotación del par (en demo es inerte: los tokens opacos
 *   no tienen storage de revocación); forma ajena o usuario desconocido → 401.
 * - `me` (protegido): `demoMe(token)` con el access token **leído de la sesión
 *   en cada llamada** (`readTokens()`, de `lib/session/session-store`) — el rol
 *   sale **fresco** de la fila del worker (parity del
 *   `ActorGuard`); token ausente/ilegible o worker inexistente/inactivo → 401.
 * - `logout` (protegido, 204 en la API): **no-op** en demo (los tokens opacos
 *   no tienen revocación que registrar); la limpieza local de la sesión queda
 *   en el caller (`SessionProvider.signOut`), igual que hoy.
 *
 * Todo el cuerpo va en el `try/catch` del kit: `DemoUnauthorizedError` sale
 * como `ApiError` 401 `{ error: 'Unauthorized', message }`, la misma forma que
 * el `UnauthorizedException` de Nest al pasar por el filter.
 */

export interface AuthApi {
  login(name: string, password: string): Promise<AuthTokensWire>;
  refresh(refreshToken: string): Promise<AuthTokensWire>;
  logout(): Promise<void>;
  me(): Promise<ActorWire>;
}

export function createAuthApi(): AuthApi {
  return {
    async login(name, password) {
      try {
        return await login(name, password);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async refresh(refreshToken) {
      try {
        return await refresh(refreshToken);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async logout() {
      // 204 demo: los tokens opacos del demo no tienen storage de revocación
      // (docs/11-plan-demo.md §5: no-op); el caller limpia la sesión local.
    },

    async me() {
      try {
        return await me(readTokens()?.accessToken ?? '');
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

/** Instancia por defecto que usa la app. */
export const authApi: AuthApi = createAuthApi();
