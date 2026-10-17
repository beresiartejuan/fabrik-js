# Auth (Fase 3)

Autenticación de la API: hash de contraseñas, JWT manual, refresh tokens rotativos
y el guard que resuelve el `Actor` del dominio. Criterio de salida y tabla de
errores en [`docs/09-plan-de-api.md`](../../../../docs/09-plan-de-api.md).

La auth vive **solo** en `apps/api` y se guarda por `workerId`: el `Worker` del
dominio no tiene password ni campos de sesión.

## Layout

```
apps/api/src/auth/
├─ password.ts               # scrypt: hashPassword / verifyPassword (node:crypto)
├─ jwt.ts                    # signJwt / verifyJwt / hashToken / secureEqual (HMAC-SHA256)
├─ auth.config.ts            # AuthConfig desde env (JWT_*, BOOTSTRAP_ADMIN_*)
├─ auth.tokens.ts            # symbols de DI (AUTH_CONFIG, CREDENTIAL_REPOSITORY, …)
├─ credentials.repository.ts # CredentialRepository + adaptador Drizzle
├─ refresh-token.repository.ts # RefreshTokenRepository + adaptador Drizzle
├─ auth.service.ts           # login / refresh (rotación) / logout
├─ auth.controller.ts        # POST /auth/login|refresh|logout, GET /auth/me
├─ dto.ts                    # schemas zod de login/refresh
├─ public.decorator.ts       # @Public() (APP_GUARD exento)
├─ actor.guard.ts            # ActorGuard global
├─ actor.decorator.ts        # @Actor() (param decorator)
├─ bootstrap-admin.service.ts# admin de desarrollo/e2e por env
└─ auth.module.ts            # wiring + APP_GUARD
```

## Persistencia

- `auth_credentials`: `worker_id` (PK), `password_hash`, `created_at`, `updated_at`.
  El hash de scrypt es **autocontenido** (`scrypt$N=…,r=…,p=…$<salt>$<hash>`), así
  que no hay columna `salt` aparte.
- `refresh_tokens`: `id` (`jti`), `worker_id`, `token_hash` (SHA-256), `expires_at`,
  `revoked_at`, `created_at`. Se guarda **solo el hash**: el token en claro solo
  existe en el cliente. `revoked_at` marca la rotación o el logout. La rotación
  es un **compare-and-swap**: `revoke()` solo pasa `revoked_at` de `NULL` a fecha
  y devuelve si ganó la carrera; ante reuso se revoca toda la cadena del worker.
- Sin foreign keys, igual que el resto del esquema; la relación con `workers` es por
  convención (`worker_id`).

## Decisiones

- **scrypt** (`node:crypto`) frente a argon2/bcrypt: KDF memory-hard en la librería
  estándar, sin addon nativo. Parámetros `N=2^14`, `r=8`, `p=1`, sal de 16 B y
  comparación con `timingSafeEqual`. En login con nombre inexistente se calcula un
  scrypt de descarte para no filtrar qué usuarios existen por timing.
- **JWT manual** sin `jsonwebtoken`/`jose`: JWS compacto
  `header.payload.signature` firmado con HMAC-SHA256. Claims `sub`, `iat`, `exp`,
  `role`, `typ` (`access`/`refresh`) y `jti` en el refresh. El access usa
  `JWT_ACCESS_SECRET` (~15 min); el refresh, `JWT_REFRESH_SECRET` (~30 días).
- **Login por `name` + contraseña**: el `Worker` se identifica por `name`; no se
  inventó un campo de identidad nuevo. Limitación: `name` debería ser único (hoy lo
  garantiza el seeding/uso, no el esquema).
- **Rol fresco desde la BD**: el `ActorGuard` recarga el worker en cada request y
  usa su rol actual; no se confía en el claim `role` (token viejo no conserva
  privilegios, y un worker inactivo da 401).
- **Guard global con `@Public()`**: `ActorGuard` (`APP_GUARD`) exige token salvo en
  `/health`, `/auth/login` y `/auth/refresh`. El guard **solo autentica**; la
  autorización por rol es del dominio (`UnauthorizedRoleError` → 403).
- **Bootstrap de admin por env**: `BOOTSTRAP_ADMIN_NAME` + `BOOTSTRAP_ADMIN_PASSWORD`
  crean (idempotente) un worker `admin` con credencial al arrancar. Es el seeder
  mínimo; el seeder completo es la Fase 7.

## Rutas

| Método y ruta | Público | Descripción |
|---|---|---|
| `POST /auth/login` | sí | `{ name, password }` → `{ accessToken, refreshToken, tokenType, expiresIn }`. |
| `POST /auth/refresh` | sí | `{ refreshToken }` → par nuevo; rota el viejo (CAS). Si el token ya estaba revocado (reuso), revoca toda la cadena del worker → 401. |
| `POST /auth/logout` | no | 204; revoca **todos** los refresh del actor. |
| `GET /auth/me` | no | Devuelve el `Actor` (smoke del guard y utilidad para el front). |

## Tests

- Unitarios (colocados): `password.spec.ts`, `jwt.spec.ts`, `auth.config.spec.ts`,
  `actor.guard.spec.ts` (con repos mockeados) y `auth.service.spec.ts` (dobles
  in-memory: login, rotación, refresh concurrente donde solo uno gana, reuso que
  revoca la cadena y logout).
- E2E `test/auth/auth.e2e-spec.ts`: bootstrap admin por env → login → `GET /auth/me`
  (200) → ruta protegida (admin 201 / auditor 403) → refresh rota (viejo 401) y el
  reuso del viejo invalida también el par nuevo (401) → logout revoca (401) → sin
  token / token vencido 401.
