# Fabrik — Web

Panel Next.js (App Router) del proyecto Fabrik. Consume la API de `apps/api` con
axios; el detalle de pantallas, capa HTTP y decisiones vive en
[`docs/10-plan-de-web.md`](../../docs/10-plan-de-web.md).

## Config

- `NEXT_PUBLIC_API_URL`: URL base de la API (por defecto `http://localhost:3001`).
  Next inlinea las variables `NEXT_PUBLIC_*` **en tiempo de build**: si la cambiás,
  hay que reconstruir (`pnpm build`) y volver a desplegar; reiniciar el proceso no
  alcanza.

## Comandos

```bash
pnpm dev     # desarrollo
pnpm test    # tests (vitest)
pnpm build   # build de producción
pnpm lint    # biome
```
