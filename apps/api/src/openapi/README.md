# OpenAPI (Fase 7)

Documento OpenAPI 3.0 de la API, servido por `@nestjs/swagger` en:

- `GET /docs` — UI de Swagger.
- `GET /docs-json` — documento JSON (y `/docs-yaml`).

Decisión y criterio de salida en [`docs/09-plan-de-api.md`](../../../../docs/09-plan-de-api.md)
(sección *Fase 7*).

## Decisión: zod → OpenAPI (no decoradores `@ApiProperty`)

Los controladores validan **con zod** (`ZodValidationPipe`), no con `class-validator`,
así que el plugin automático de `@nestjs/swagger` no puede documentar los cuerpos:
no hay clases con decoradores que inspeccionar. Se evaluaron tres caminos:

1. **`@nestjs/swagger` + `@ApiBody`/`@ApiProperty` manuales** — descartado: duplica
   en decoradores la forma que ya describe el schema zod (dos fuentes que se
   desincronizan).
2. **Generación zod → OpenAPI** — **elegido**: `@asteasolutions/zod-to-openapi`
   convierte los **mismos** schemas que valida la API en schemas OpenAPI. Se
   verificó compatibilidad con zod v4 (peer `zod: ^4.0.0`, instalado `4.6.7`) y con
   Nest 12 (`@nestjs/swagger@12` exige `@nestjs/core ^12`; sus peers
   `class-validator`/`class-transformer` son **opcionales**, así que no reintroducen
   `class-validator`). `@nestjs/swagger` solo aporta `SwaggerModule.setup`.
3. **Diferir** — no hizo falta.

`@anatine/zod-openapi` no se usó: su peer es `zod ^3.20`. `nestjs-zod` no se usó:
su peer de `@nestjs/common` llega hasta `^11` (no Nest 12).

## Layout

```
apps/api/src/openapi/
├─ openapi.ts       # OPENAPI_ROUTES (tabla) + buildOpenApiDocument()
└─ openapi.spec.ts  # test del documento (info, seguridad, rutas, cuerpos, tags)
```

- `OPENAPI_ROUTES` lista método + path + resumen + `tags` de forma **explícita**
  (los controladores no llevan decoradores de Swagger). Es la única duplicación:
  los **cuerpos** no se reescriben, salen de los schemas zod de cada DTO.
- `buildOpenApiDocument()` registra el esquema `bearerAuth` (http/bearer/JWT),
  fija `security: [{ bearerAuth: [] }]` global y lo anulan (`security: []`) las
  rutas `@Public()` (`/health`, `/auth/login`, `/auth/refresh`).
- `main.ts` monta `SwaggerModule.setup('docs', app, buildOpenApiDocument())`; no
  depende de la base de datos.

## Sin duplicación... salvo la tabla de rutas

La tabla de rutas es inevitable sin decoradores. Para que no derive del código,
`test/openapi/openapi.e2e-spec.ts` enumera las rutas **realmente montadas** por el
adaptador Express y verifica que el conjunto coincide exactamente con
`OPENAPI_ROUTES` (anti-drift): añadir un endpoint sin documentarlo rompe el test.

## Tests

- `src/openapi/openapi.spec.ts` — forma mínima del documento (título/versión,
  `bearerAuth`, cada ruta con resumen/respuesta/tags, rutas públicas sin seguridad,
  cuerpos derivados de zod y ausencia de `workerId` en `transform`).
- `test/openapi/openapi.e2e-spec.ts` — `/docs-json` y `/docs` responden 200 y la
  tabla cubre todas las rutas montadas.
