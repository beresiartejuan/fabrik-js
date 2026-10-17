<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Persistencia (Fase 1)

La capa de persistencia (Drizzle + Turso/SQLite) implementa los 9 puertos de
repositorio de `@fabrik/domain` y `UnitOfWork`. Detalle de la **elección de
cliente**, layout, decisiones de esquema y comandos en
[`src/persistence/README.md`](./src/persistence/README.md).

- Cliente elegido: **`@tursodatabase/database`** (SDK actual del motor Turso) con
  el driver `drizzle-orm/tursodatabase/database` de **Drizzle v1.0 RC** (el
  Drizzle estable solo soporta el SDK anterior `@libsql/client`).
- Base local por env var `FABRIK_DB_FILE` (default `./data/fabrik.db`).
- Migraciones: `pnpm --filter api db:generate` y `pnpm --filter api db:migrate`.

## Dominio (Fase 2)

El `DomainModule` (`src/domain/`) cablea los 9 puertos a sus adaptadores Drizzle y
registra los **37 casos de uso** del dominio como providers (un factory explícito
por caso de uso, sin reflexión). Detalle del patrón, tokens de DI, filtro de
errores y validación en [`src/domain/README.md`](./src/domain/README.md).

- `EventBus` in-process (`InMemoryEventBus`); en producción es no-op salvo por el
  histórico que usan los tests.
- `DomainExceptionFilter` global (`APP_FILTER`): `DomainError → HTTP` según la
  tabla de `docs/09-plan-de-api.md`, fallback 500.
- Validación con **zod** (`ZodValidationPipe`): schemas compartibles con
  `apps/web` y tipos inferidos; decisión documentada frente a `class-validator`.
- Health check: `GET /health` → `{ ok: true }`.

## Auth (Fase 3)

La autenticación vive **solo** en `apps/api/src/auth/` y se guarda por `workerId`
(el `Worker` del dominio no tiene password). Detalle de decisiones en
[`src/auth/README.md`](./src/auth/README.md).

- Contraseñas con **scrypt** (`node:crypto`, sal por usuario, `timingSafeEqual`).
- **JWT manual** HMAC-SHA256 (`header.payload.signature`, base64url), sin
  `jsonwebtoken`: access ~15 min + refresh rotativo ~30 días. El refresh se
  persiste **hasheado** (SHA-256) en `refresh_tokens`; al rotar se revoca el viejo.
- `ActorGuard` global con `@Public()`: valida el access token y **recarga el
  worker** (rol fresco, debe estar activo). `@Actor()` inyecta el `Actor`. El guard
  autentica (401); la autorización por rol es del dominio (403).
- Endpoints: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
  `GET /auth/me`.
- Tablas `auth_credentials` y `refresh_tokens` (migración en `apps/api/drizzle/`).

### Variables de entorno

| Variable | Obligatoria | Default | Descripción |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | fuera de tests | — | Secreto HMAC del access token. |
| `JWT_REFRESH_SECRET` | fuera de tests | — | Secreto HMAC del refresh token. |
| `JWT_ACCESS_TTL_SECONDS` | no | `900` | Vida del access token. |
| `JWT_REFRESH_TTL_SECONDS` | no | `2592000` | Vida del refresh token. |
| `BOOTSTRAP_ADMIN_NAME` | no | — | Crea un admin al arrancar si no existe. |
| `BOOTSTRAP_ADMIN_PASSWORD` | no | — | Contraseña de ese admin (junto con la anterior). |
| `FABRIK_DB_FILE` | no | `./data/fabrik.db` | Archivo SQLite. |


## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

To add it to this project:

```bash
$ pnpm install @nestjs/observe
```

Then follow the [setup guide](https://docs.nestjs.com/observability/overview) - it takes a single import and an app key.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
