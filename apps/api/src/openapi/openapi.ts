import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  type RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { CreateAssignmentSchema } from '../assignments/assignments.dto.js';
import { LoginSchema, RefreshSchema } from '../auth/dto.js';
import { BatchEventsQuerySchema } from '../batch-events/batch-events.dto.js';
import { ListBatchesQuerySchema } from '../batches/batches.dto.js';
import {
  CreateLocationSchema,
  ListLocationsQuerySchema,
  UpdateLocationSchema,
} from '../locations/locations.dto.js';
import {
  CreateMachineSchema,
  ListMachinesQuerySchema,
  MoveMachineSchema,
  UpdateMachineSchema,
} from '../machines/machines.dto.js';
import {
  CreateMaterialSchema,
  ListMaterialsQuerySchema,
  UpdateMaterialSchema,
} from '../materials/materials.dto.js';
import {
  CompleteProductionSchema,
  RecordTransformationSchema,
  StartProductionSchema,
  StoreBatchSchema,
} from '../production/production.dto.js';
import {
  CreateRecipeSchema,
  ListRecipesQuerySchema,
  UpdateRecipeSchema,
} from '../recipes/recipes.dto.js';
import { StockMovementsQuerySchema } from '../stock/stock.dto.js';
import { RegisterSupplyArrivalSchema } from '../supplies/supplies.dto.js';
import {
  CreateWorkerSchema,
  ListWorkersQuerySchema,
  UpdateWorkerSchema,
} from '../workers/workers.dto.js';

/**
 * OpenAPI 3.0 generado a partir de los **schemas zod** (Fase 7, docs/09).
 *
 * Decisión (ver docs/09 y `README.md`): los controladores validan con `zod`
 * (`ZodValidationPipe`), no con `class-validator`, así que el plugin automático
 * de `@nestjs/swagger` no puede documentar los cuerpos. En vez de duplicar la
 * forma con decoradores `@ApiProperty` (opción descartada por duplicación), el
 * documento se construye con `@asteasolutions/zod-to-openapi`, que convierte los
 * **mismos** schemas que valida la API en schemas OpenAPI. `@nestjs/swagger` solo
 * aporta el `SwaggerModule` que sirve la UI/JSON en `/docs` y `/docs-json`.
 *
 * La tabla de rutas (`OPENAPI_ROUTES`) lista método + path + resumen + tag de
 * forma explícita porque los controladores no llevan decoradores de Swagger; un
 * e2e (`test/openapi/openapi.e2e-spec.ts`) recorre los controladores reales de
 * Nest y verifica que la tabla cubre **todas** las rutas montadas (evita el drift).
 */

/** Etiqueta de agrupación en la UI por recurso. */
const TAGS = [
  'health',
  'auth',
  'materials',
  'locations',
  'machines',
  'workers',
  'recipes',
  'assignments',
  'supplies',
  'production',
  'stock',
  'trace',
  'batch-events',
  'batches',
] as const;

/** Parámetro de path (`:id`, `:locationId`, …): string no vacío. */
function pathParam(name: string): z.ZodObject<Record<string, z.ZodString>> {
  return z.object({ [name]: z.string().trim().min(1) });
}

const UNAUTHENTICATED = {
  401: { description: 'Falta el access token, o es inválido/vencido.' },
};
const FORBIDDEN = {
  403: {
    description: 'El rol del actor no tiene permiso (lo decide el dominio).',
  },
};
const NOT_FOUND = {
  404: { description: 'Recurso inexistente (NotFoundError).' },
};
const CONFLICT = {
  409: {
    description: 'Conflicto de dominio (solapamiento, stock, estado, I3…).',
  },
};
const UNPROCESSABLE = {
  422: { description: 'Entrada bien formada pero inválida para el dominio.' },
};
const BAD_REQUEST = {
  400: { description: 'La forma de la petición no pasa el schema zod.' },
};

/** Cuerpo JSON a partir de un schema zod (sin duplicar la forma). */
function jsonBody(schema: z.ZodType): NonNullable<RouteConfig['request']>['body'] {
  return { content: { 'application/json': { schema } } };
}

const PROTECTED = { ...UNAUTHENTICATED, ...FORBIDDEN };

/**
 * Rutas documentadas. Se exporta para que los tests puedan contrastarla con los
 * controladores realmente montados por Nest.
 */
export const OPENAPI_ROUTES: RouteConfig[] = [
  {
    method: 'get',
    path: '/health',
    summary: 'Health check (público, sin token).',
    tags: ['health'],
    security: [],
    responses: { 200: { description: 'La API responde.' }, ...UNAUTHENTICATED },
  },

  // --- auth (Fase 3) ---
  {
    method: 'post',
    path: '/auth/login',
    summary: 'Login por nombre de worker + contraseña. Devuelve access + refresh.',
    tags: ['auth'],
    security: [],
    request: { body: jsonBody(LoginSchema) },
    responses: {
      200: { description: 'Par de tokens.' },
      ...UNAUTHENTICATED,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'post',
    path: '/auth/refresh',
    summary: 'Rota el refresh token (revoca el anterior) y emite un par nuevo.',
    tags: ['auth'],
    security: [],
    request: { body: jsonBody(RefreshSchema) },
    responses: {
      200: { description: 'Par de tokens renovado.' },
      ...UNAUTHENTICATED,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'post',
    path: '/auth/logout',
    summary: 'Revoca todos los refresh tokens del actor.',
    tags: ['auth'],
    responses: { 204: { description: 'Sesión cerrada.' }, ...UNAUTHENTICATED },
  },
  {
    method: 'get',
    path: '/auth/me',
    summary: 'Devuelve el Actor resuelto por el guard.',
    tags: ['auth'],
    responses: {
      200: { description: 'Actor autenticado.' },
      ...UNAUTHENTICATED,
    },
  },

  // --- materials (Fase 4) ---
  {
    method: 'post',
    path: '/materials',
    summary: 'Crea un material.',
    tags: ['materials'],
    request: { body: jsonBody(CreateMaterialSchema) },
    responses: {
      201: { description: 'Material creado.' },
      ...PROTECTED,
      ...UNPROCESSABLE,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'get',
    path: '/materials',
    summary: 'Lista materiales (filtros `kind` y `physicalState`).',
    tags: ['materials'],
    request: { query: ListMaterialsQuerySchema },
    responses: {
      200: { description: 'Listado de materiales.' },
      ...UNAUTHENTICATED,
      ...FORBIDDEN,
    },
  },
  {
    method: 'get',
    path: '/materials/{id}',
    summary: 'Obtiene un material por id.',
    tags: ['materials'],
    request: { params: pathParam('id') },
    responses: {
      200: { description: 'Material.' },
      ...PROTECTED,
      ...NOT_FOUND,
    },
  },
  {
    method: 'patch',
    path: '/materials/{id}',
    summary: 'Actualiza un material (campos parciales).',
    tags: ['materials'],
    request: { params: pathParam('id'), body: jsonBody(UpdateMaterialSchema) },
    responses: {
      200: { description: 'Material actualizado.' },
      ...PROTECTED,
      ...NOT_FOUND,
      ...UNPROCESSABLE,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'post',
    path: '/materials/{id}/deactivate',
    summary: 'Baja lógica de un material (idempotente).',
    tags: ['materials'],
    request: { params: pathParam('id') },
    responses: {
      200: { description: 'Material desactivado.' },
      ...PROTECTED,
      ...NOT_FOUND,
    },
  },

  // --- locations (Fase 4) ---
  {
    method: 'post',
    path: '/locations',
    summary: 'Crea un lugar (planta de producción o almacén).',
    tags: ['locations'],
    request: { body: jsonBody(CreateLocationSchema) },
    responses: {
      201: { description: 'Lugar creado.' },
      ...PROTECTED,
      ...UNPROCESSABLE,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'get',
    path: '/locations',
    summary: 'Lista lugares (filtro `kind`).',
    tags: ['locations'],
    request: { query: ListLocationsQuerySchema },
    responses: {
      200: { description: 'Listado de lugares.' },
      ...UNAUTHENTICATED,
      ...FORBIDDEN,
    },
  },
  {
    method: 'get',
    path: '/locations/{id}',
    summary: 'Obtiene un lugar por id.',
    tags: ['locations'],
    request: { params: pathParam('id') },
    responses: { 200: { description: 'Lugar.' }, ...PROTECTED, ...NOT_FOUND },
  },
  {
    method: 'patch',
    path: '/locations/{id}',
    summary: 'Renombra un lugar (no cambia `kind`).',
    tags: ['locations'],
    request: { params: pathParam('id'), body: jsonBody(UpdateLocationSchema) },
    responses: {
      200: { description: 'Lugar actualizado.' },
      ...PROTECTED,
      ...NOT_FOUND,
      ...BAD_REQUEST,
    },
  },

  // --- machines (Fase 4) ---
  {
    method: 'post',
    path: '/machines',
    summary: 'Crea una máquina.',
    tags: ['machines'],
    request: { body: jsonBody(CreateMachineSchema) },
    responses: {
      201: { description: 'Máquina creada.' },
      ...PROTECTED,
      ...UNPROCESSABLE,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'get',
    path: '/machines',
    summary: 'Lista máquinas (filtros `locationId`, `status`, `type`).',
    tags: ['machines'],
    request: { query: ListMachinesQuerySchema },
    responses: {
      200: { description: 'Listado de máquinas.' },
      ...UNAUTHENTICATED,
      ...FORBIDDEN,
    },
  },
  {
    method: 'get',
    path: '/machines/{id}',
    summary: 'Obtiene una máquina por id.',
    tags: ['machines'],
    request: { params: pathParam('id') },
    responses: { 200: { description: 'Máquina.' }, ...PROTECTED, ...NOT_FOUND },
  },
  {
    method: 'patch',
    path: '/machines/{id}',
    summary: 'Actualiza nombre y/o tipo de una máquina.',
    tags: ['machines'],
    request: { params: pathParam('id'), body: jsonBody(UpdateMachineSchema) },
    responses: {
      200: { description: 'Máquina actualizada.' },
      ...PROTECTED,
      ...NOT_FOUND,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'post',
    path: '/machines/{id}/move',
    summary: 'Mueve una máquina a otro lugar (debe ser de producción).',
    tags: ['machines'],
    request: { params: pathParam('id'), body: jsonBody(MoveMachineSchema) },
    responses: {
      200: { description: 'Máquina movida.' },
      ...PROTECTED,
      ...NOT_FOUND,
      ...UNPROCESSABLE,
      ...BAD_REQUEST,
    },
  },

  // --- workers (Fase 4) ---
  {
    method: 'post',
    path: '/workers',
    summary: 'Crea un trabajador.',
    tags: ['workers'],
    request: { body: jsonBody(CreateWorkerSchema) },
    responses: {
      201: { description: 'Trabajador creado.' },
      ...PROTECTED,
      ...UNPROCESSABLE,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'get',
    path: '/workers',
    summary: 'Lista trabajadores (filtros `role` y `active`).',
    tags: ['workers'],
    request: { query: ListWorkersQuerySchema },
    responses: {
      200: { description: 'Listado de trabajadores.' },
      ...UNAUTHENTICATED,
      ...FORBIDDEN,
    },
  },
  {
    method: 'get',
    path: '/workers/{id}',
    summary: 'Obtiene un trabajador por id.',
    tags: ['workers'],
    request: { params: pathParam('id') },
    responses: {
      200: { description: 'Trabajador.' },
      ...PROTECTED,
      ...NOT_FOUND,
    },
  },
  {
    method: 'patch',
    path: '/workers/{id}',
    summary: 'Actualiza nombre y/o rol de un trabajador.',
    tags: ['workers'],
    request: { params: pathParam('id'), body: jsonBody(UpdateWorkerSchema) },
    responses: {
      200: { description: 'Trabajador actualizado.' },
      ...PROTECTED,
      ...NOT_FOUND,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'post',
    path: '/workers/{id}/deactivate',
    summary: 'Baja lógica de un trabajador (idempotente).',
    tags: ['workers'],
    request: { params: pathParam('id') },
    responses: {
      200: { description: 'Trabajador desactivado.' },
      ...PROTECTED,
      ...NOT_FOUND,
    },
  },

  // --- recipes (Fase 4) ---
  {
    method: 'post',
    path: '/recipes',
    summary: 'Crea una receta con sus pasos.',
    tags: ['recipes'],
    request: { body: jsonBody(CreateRecipeSchema) },
    responses: {
      201: { description: 'Receta creada.' },
      ...PROTECTED,
      ...UNPROCESSABLE,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'get',
    path: '/recipes',
    summary: 'Lista recetas (filtro `outputProductId`).',
    tags: ['recipes'],
    request: { query: ListRecipesQuerySchema },
    responses: {
      200: { description: 'Listado de recetas.' },
      ...UNAUTHENTICATED,
      ...FORBIDDEN,
    },
  },
  {
    method: 'get',
    path: '/recipes/{id}',
    summary: 'Obtiene una receta por id.',
    tags: ['recipes'],
    request: { params: pathParam('id') },
    responses: { 200: { description: 'Receta.' }, ...PROTECTED, ...NOT_FOUND },
  },
  {
    method: 'patch',
    path: '/recipes/{id}',
    summary: 'Actualiza una receta; enviar `steps` reemplaza la lista completa.',
    tags: ['recipes'],
    request: { params: pathParam('id'), body: jsonBody(UpdateRecipeSchema) },
    responses: {
      200: { description: 'Receta actualizada.' },
      ...PROTECTED,
      ...NOT_FOUND,
      ...UNPROCESSABLE,
      ...BAD_REQUEST,
    },
  },

  // --- assignments + schedule (Fase 4) ---
  {
    method: 'post',
    path: '/assignments',
    summary: 'Asigna un trabajador a una máquina en una franja horaria (I1).',
    tags: ['assignments'],
    request: { body: jsonBody(CreateAssignmentSchema) },
    responses: {
      201: { description: 'Asignación creada.' },
      ...PROTECTED,
      ...NOT_FOUND,
      ...CONFLICT,
      ...UNPROCESSABLE,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'delete',
    path: '/assignments/{id}',
    summary: 'Elimina una asignación.',
    tags: ['assignments'],
    request: { params: pathParam('id') },
    responses: {
      204: { description: 'Asignación eliminada.' },
      ...PROTECTED,
      ...NOT_FOUND,
    },
  },
  {
    method: 'get',
    path: '/workers/{id}/schedule',
    summary: 'Agenda de un trabajador.',
    tags: ['assignments'],
    request: { params: pathParam('id') },
    responses: {
      200: { description: 'Asignaciones del trabajador.' },
      ...PROTECTED,
      ...NOT_FOUND,
    },
  },
  {
    method: 'get',
    path: '/machines/{id}/schedule',
    summary: 'Agenda de una máquina.',
    tags: ['assignments'],
    request: { params: pathParam('id') },
    responses: {
      200: { description: 'Asignaciones de la máquina.' },
      ...PROTECTED,
      ...NOT_FOUND,
    },
  },
  {
    method: 'get',
    path: '/me/schedule',
    summary: 'Agenda del propio actor con `activeNow` calculado en el servidor.',
    tags: ['assignments'],
    responses: {
      200: {
        description:
          'Asignaciones del actor + máquina enriquecida (nombre/tipo/estado) + vigencia ahora (I3).',
      },
      ...UNAUTHENTICATED,
    },
  },

  // --- supplies, production y stock (Fase 5) ---
  {
    method: 'post',
    path: '/supplies/arrivals',
    summary: 'Registra el arribo de un suministro (crea lote `stored` + movimiento `supply_in`).',
    tags: ['supplies'],
    request: { body: jsonBody(RegisterSupplyArrivalSchema) },
    responses: {
      201: { description: 'Lote de suministro creado.' },
      ...PROTECTED,
      ...NOT_FOUND,
      ...UNPROCESSABLE,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'post',
    path: '/production/start',
    summary: 'Inicia una orden de producción desde una receta (crea el lote raíz).',
    tags: ['production'],
    request: { body: jsonBody(StartProductionSchema) },
    responses: {
      201: { description: 'Lote raíz `in_progress`.' },
      ...PROTECTED,
      ...NOT_FOUND,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'post',
    path: '/production/transform',
    summary:
      'Registra una transformación (el `workerId` sale del Actor). Devuelve el evento y los lotes de output.',
    tags: ['production'],
    request: { body: jsonBody(RecordTransformationSchema) },
    responses: {
      201: { description: 'Evento + lotes de output.' },
      ...PROTECTED,
      ...NOT_FOUND,
      ...CONFLICT,
      ...UNPROCESSABLE,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'post',
    path: '/production/store',
    summary: 'Mueve un lote `in_progress` a almacenamiento.',
    tags: ['production'],
    request: { body: jsonBody(StoreBatchSchema) },
    responses: {
      200: { description: 'Lote almacenado.' },
      ...PROTECTED,
      ...NOT_FOUND,
      ...CONFLICT,
      ...UNPROCESSABLE,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'post',
    path: '/production/complete',
    summary: 'Cierra la orden de producción.',
    tags: ['production'],
    request: { body: jsonBody(CompleteProductionSchema) },
    responses: {
      200: { description: 'Orden completada.' },
      ...PROTECTED,
      ...NOT_FOUND,
      ...CONFLICT,
      ...UNPROCESSABLE,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'get',
    path: '/stock/{locationId}',
    summary: 'Existencias agregadas de un lugar (worker incluido).',
    tags: ['stock'],
    request: { params: pathParam('locationId') },
    responses: {
      200: { description: 'Existencias por material.' },
      ...PROTECTED,
      ...NOT_FOUND,
    },
  },
  {
    method: 'get',
    path: '/stock/{locationId}/movements',
    summary: 'Historial de movimientos de un lugar (filtro `materialId`).',
    tags: ['stock'],
    request: {
      params: pathParam('locationId'),
      query: StockMovementsQuerySchema,
    },
    responses: {
      200: { description: 'Movimientos de stock.' },
      ...PROTECTED,
      ...NOT_FOUND,
    },
  },

  // --- trace y batch-events (Fase 6) ---
  {
    method: 'get',
    path: '/trace/{batchId}',
    summary: 'Genealogía hacia atrás de un lote.',
    tags: ['trace'],
    request: { params: pathParam('batchId') },
    responses: {
      200: { description: 'Árbol de trazabilidad (hacia atrás).' },
      ...PROTECTED,
      ...NOT_FOUND,
    },
  },
  {
    method: 'get',
    path: '/trace/{batchId}/forward',
    summary: 'Genealogía hacia adelante de un lote (recall).',
    tags: ['trace'],
    request: { params: pathParam('batchId') },
    responses: {
      200: { description: 'Árbol de trazabilidad (hacia adelante).' },
      ...PROTECTED,
      ...NOT_FOUND,
    },
  },
  {
    method: 'get',
    path: '/batch-events',
    summary: 'Lista eventos de transformación (filtros machineId/workerId/materialId/from/to).',
    tags: ['batch-events'],
    request: { query: BatchEventsQuerySchema },
    responses: {
      200: { description: 'Eventos en orden cronológico.' },
      ...UNAUTHENTICATED,
      ...FORBIDDEN,
      ...BAD_REQUEST,
    },
  },

  // --- batches (post-plan, hueco del plan de web) ---
  {
    method: 'get',
    path: '/batches',
    summary: 'Lista lotes (filtros status/materialId/recipeId/originBatchEventId).',
    tags: ['batches'],
    request: { query: ListBatchesQuerySchema },
    responses: {
      200: { description: 'Listado de lotes.' },
      ...UNAUTHENTICATED,
      ...FORBIDDEN,
      ...BAD_REQUEST,
    },
  },
  {
    method: 'get',
    path: '/batches/{id}',
    summary: 'Obtiene un lote por id.',
    tags: ['batches'],
    request: { params: pathParam('id') },
    responses: {
      200: { description: 'Lote.' },
      ...PROTECTED,
      ...NOT_FOUND,
    },
  },
];

/**
 * Construye el documento OpenAPI a partir de los schemas zod. Globalmente exige
 * `bearerAuth`; las rutas `@Public()` lo anulan con `security: []`.
 */
export function buildOpenApiDocument(): ReturnType<OpenApiGeneratorV3['generateDocument']> {
  const registry = new OpenAPIRegistry();

  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Access token JWT (`JWT_ACCESS_SECRET`). Enviar como `Authorization: Bearer <token>`.',
  });

  for (const route of OPENAPI_ROUTES) {
    registry.registerPath(route);
  }

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'fabrik-api',
      version: '0.0.1',
      description:
        'API HTTP del monorepo fabrik-js. Cuerpos/schemas generados desde los DTOs zod; ' +
        'el RBAC lo decide el dominio (403). Ver docs/api.md.',
    },
    security: [{ bearerAuth: [] }],
    tags: TAGS.map((name) => ({ name })),
  });
}
