import type { LocationKind } from '@fabrik/domain';
import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { LocationWire } from '../types';

/**
 * Endpoints de lugares (`apps/api/src/locations/locations.controller.ts`).
 *
 * - `GET /locations` (filtro `kind`) — A/Au.
 * - `GET /locations/:id` — A/Au.
 * - `POST /locations` — admin.
 * - `PATCH /locations/:id` — admin; **solo renombra**: `UpdateLocation` no acepta
 *   `kind` (violaría I2), por eso `UpdateLocationInput` no lo expone.
 *
 * No hay baja: los lugares no tienen baja lógica en el dominio.
 */

export interface ListLocationsParams {
  readonly kind?: LocationKind;
}

export interface CreateLocationInput {
  readonly name: string;
  readonly kind: LocationKind;
}

export interface UpdateLocationInput {
  readonly name?: string;
}

export interface LocationsApi {
  list(params?: ListLocationsParams): Promise<LocationWire[]>;
  get(id: string): Promise<LocationWire>;
  create(input: CreateLocationInput): Promise<LocationWire>;
  update(id: string, input: UpdateLocationInput): Promise<LocationWire>;
}

export function createLocationsApi(client: AxiosInstance = apiClient): LocationsApi {
  return {
    async list(params) {
      const response = await client.get<LocationWire[]>('/locations', {
        params: params?.kind !== undefined ? { kind: params.kind } : undefined,
      });
      return response.data;
    },

    async get(id) {
      const response = await client.get<LocationWire>(`/locations/${id}`);
      return response.data;
    },

    async create(input) {
      const response = await client.post<LocationWire>('/locations', input);
      return response.data;
    },

    async update(id, input) {
      const response = await client.patch<LocationWire>(`/locations/${id}`, input);
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const locationsApi: LocationsApi = createLocationsApi();
