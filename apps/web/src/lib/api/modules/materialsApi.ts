import type { MaterialKind } from '@fabrik/domain';
import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { MaterialWire } from '../types';

/**
 * Endpoints de materiales (`apps/api/src/materials/materials.controller.ts`).
 *
 * En Fase 0b solo se necesita `list()` para los contadores del dashboard (y el
 * filtro por `kind` para el arribo de suministros de Fase 4). La Fase 1 añade
 * `create`/`update`/`deactivate` sobre este mismo módulo.
 */

export interface ListMaterialsParams {
  readonly kind?: MaterialKind;
}

export interface MaterialsApi {
  list(params?: ListMaterialsParams): Promise<MaterialWire[]>;
}

export function createMaterialsApi(client: AxiosInstance = apiClient): MaterialsApi {
  return {
    async list(params) {
      const response = await client.get<MaterialWire[]>('/materials', {
        params: params?.kind ? { kind: params.kind } : undefined,
      });
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const materialsApi: MaterialsApi = createMaterialsApi();
