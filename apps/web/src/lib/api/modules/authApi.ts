import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { ActorWire, AuthTokensWire, LoginRequestWire, RefreshRequestWire } from '../types';

/**
 * Endpoints de auth (`apps/api/src/auth/auth.controller.ts`).
 *
 * - `POST /auth/login` (público): `{ name, password }` → `AuthTokensWire`.
 * - `POST /auth/refresh` (público): `{ refreshToken }` → nuevo par (rota el viejo).
 * - `POST /auth/logout` (protegido): 204, revoca los refresh del actor.
 * - `GET /auth/me` (protegido): `ActorWire` resuelto por el guard.
 *
 * `login`/`refresh` comparten la forma de la respuesta; el store de sesión las
 * persiste. `logout` y `me` van autenticadas con el Bearer del interceptor.
 */

export interface AuthApi {
  login(name: string, password: string): Promise<AuthTokensWire>;
  refresh(refreshToken: string): Promise<AuthTokensWire>;
  logout(): Promise<void>;
  me(): Promise<ActorWire>;
}

export function createAuthApi(client: AxiosInstance = apiClient): AuthApi {
  return {
    async login(name, password) {
      const body: LoginRequestWire = { name, password };
      const response = await client.post<AuthTokensWire>('/auth/login', body);
      return response.data;
    },

    async refresh(refreshToken) {
      const body: RefreshRequestWire = { refreshToken };
      const response = await client.post<AuthTokensWire>('/auth/refresh', body);
      return response.data;
    },

    async logout() {
      await client.post('/auth/logout');
    },

    async me() {
      const response = await client.get<ActorWire>('/auth/me');
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const authApi: AuthApi = createAuthApi();
