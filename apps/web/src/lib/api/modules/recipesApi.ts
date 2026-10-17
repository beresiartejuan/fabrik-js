import type { MachineType } from '@fabrik/domain';
import type { AxiosInstance } from 'axios';

import { apiClient } from '@/lib/api/client';

import type { MaterialQuantityWire, QuantityWire, RecipeWire } from '../types';

/**
 * Endpoints de recetas (`apps/api/src/recipes/recipes.controller.ts`).
 *
 * - `GET /recipes` (filtro `outputProductId`) — A/Au.
 * - `GET /recipes/:id` — A/Au.
 * - `POST /recipes` — admin.
 * - `PATCH /recipes/:id` — admin. Si el body incluye `steps`, **reemplaza la
 *   lista completa** de pasos (no es un merge por posición).
 *
 * El wire de entrada espeja `recipes.dto.ts`: `outputQuantity` y las cantidades
 * de inputs/outputs viajan como `{ amount, unit }`; el `position` de cada paso
 * es un entero positivo y la integridad del conjunto la valida el dominio.
 */

export interface RecipeStepInput {
  readonly position: number;
  readonly machineType: MachineType;
  readonly inputs: readonly MaterialQuantityWire[];
  readonly outputProductId: string;
  readonly outputQuantity: QuantityWire;
}

export interface CreateRecipeInput {
  readonly name: string;
  readonly outputProductId: string;
  readonly outputQuantity: QuantityWire;
  readonly steps: readonly RecipeStepInput[];
}

/** `PATCH /recipes/:id` (todos los campos son opcionales; `steps` reemplaza). */
export interface UpdateRecipeInput {
  readonly name?: string;
  readonly outputProductId?: string;
  readonly outputQuantity?: QuantityWire;
  readonly steps?: readonly RecipeStepInput[];
}

export interface ListRecipesParams {
  readonly outputProductId?: string;
}

export interface RecipesApi {
  list(params?: ListRecipesParams): Promise<RecipeWire[]>;
  get(id: string): Promise<RecipeWire>;
  create(input: CreateRecipeInput): Promise<RecipeWire>;
  update(id: string, input: UpdateRecipeInput): Promise<RecipeWire>;
}

export function createRecipesApi(client: AxiosInstance = apiClient): RecipesApi {
  return {
    async list(params) {
      const response = await client.get<RecipeWire[]>('/recipes', {
        params:
          params?.outputProductId !== undefined
            ? { outputProductId: params.outputProductId }
            : undefined,
      });
      return response.data;
    },

    async get(id) {
      const response = await client.get<RecipeWire>(`/recipes/${id}`);
      return response.data;
    },

    async create(input) {
      const response = await client.post<RecipeWire>('/recipes', input);
      return response.data;
    },

    async update(id, input) {
      const response = await client.patch<RecipeWire>(`/recipes/${id}`, input);
      return response.data;
    },
  };
}

/** Instancia por defecto que usa la app. */
export const recipesApi: RecipesApi = createRecipesApi();
