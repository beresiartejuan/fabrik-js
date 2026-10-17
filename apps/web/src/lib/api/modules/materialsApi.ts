import type { MaterialKind, PhysicalState, UnitOfMeasure } from '@fabrik/domain';
import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { MaterialWire } from '../types';

/**
 * Endpoints de materiales (`apps/api/src/materials/materials.controller.ts`).
 *
 * - `GET /materials` (filtros `kind`, `physicalState`) — A/Au.
 * - `GET /materials/:id` — A/Au.
 * - `POST /materials` — admin.
 * - `PATCH /materials/:id` (nombre/descripción/unidad; **no** `kind` ni
 *   `physicalState`, que el dominio no permite cambiar) — admin.
 * - `POST /materials/:id/deactivate` (baja lógica, idempotente) — admin.
 */

export interface ListMaterialsParams {
  readonly kind?: MaterialKind;
  readonly physicalState?: PhysicalState;
}

export interface CreateMaterialInput {
  readonly name: string;
  readonly description?: string;
  readonly kind: MaterialKind;
  readonly physicalState: PhysicalState;
  readonly unitOfMeasure: UnitOfMeasure;
}

export interface UpdateMaterialInput {
  readonly name?: string;
  readonly description?: string;
  readonly unitOfMeasure?: UnitOfMeasure;
}

export interface MaterialsApi {
  list(params?: ListMaterialsParams): Promise<MaterialWire[]>;
  get(id: string): Promise<MaterialWire>;
  create(input: CreateMaterialInput): Promise<MaterialWire>;
  update(id: string, input: UpdateMaterialInput): Promise<MaterialWire>;
  deactivate(id: string): Promise<MaterialWire>;
}

function listQuery(params?: ListMaterialsParams): Record<string, string> | undefined {
  const query: Record<string, string> = {};
  if (params?.kind !== undefined) {
    query.kind = params.kind;
  }
  if (params?.physicalState !== undefined) {
    query.physicalState = params.physicalState;
  }
  return Object.keys(query).length > 0 ? query : undefined;
}

export function createMaterialsApi(client: AxiosInstance = apiClient): MaterialsApi {
  return {
    async list(params) {
      const response = await client.get<MaterialWire[]>('/materials', {
        params: listQuery(params),
      });
      return response.data;
    },

    async get(id) {
      const response = await client.get<MaterialWire>(`/materials/${id}`);
      return response.data;
    },

    async create(input) {
      const response = await client.post<MaterialWire>('/materials', input);
      return response.data;
    },

    async update(id, input) {
      const response = await client.patch<MaterialWire>(`/materials/${id}`, input);
      return response.data;
    },

    async deactivate(id) {
      const response = await client.post<MaterialWire>(`/materials/${id}/deactivate`);
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const materialsApi: MaterialsApi = createMaterialsApi();
