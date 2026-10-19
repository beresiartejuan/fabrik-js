# Fabrik — documentación de producto

Fabrik es una aplicación de gestión de fábricas en TypeScript: catálogos de
materiales, máquinas y trabajadores; recetas con pasos y cantidades; agenda de
asignaciones máquina↔operario; producción completa (iniciar → transformar →
almacenar → completar) y stock por lugar calculado como suma de movimientos
firmados, con trazabilidad bidireccional (genealogía / recall). El monorepo
pnpm + Turborepo organiza cuatro piezas: un dominio DDD puro compartido
(`@fabrik/domain`), una API HTTP (NestJS), un panel de administración
(Next.js) y una demo autocontenida que ejecuta el mismo dominio en el
navegador, sin backend.

**Empieza por [`producto.md`](producto.md)**: qué es, para quién y qué capacidades tiene.

## Los documentos

| Documento | Qué contiene | Perfil de lector |
|---|---|---|
| [`producto.md`](producto.md) | Visión del producto: para quién es, capacidades, roles y límites de alcance. | Nuevo dev · operador · auditor |
| [`glosario.md`](glosario.md) | Lenguaje ubicuo: cada término y su correspondencia con el código. | Nuevo dev · backend · frontend |
| [`modelo-de-dominio.md`](modelo-de-dominio.md) | Entidades, agregados e invariantes (I1–I7) como reglas de negocio. | Backend · nuevo dev |
| [`flujo-de-produccion.md`](flujo-de-produccion.md) | La producción de punta a punta: receta declarativa, órdenes, lotes y transformaciones. | Backend · operador · nuevo dev |
| [`inventario.md`](inventario.md) | El modelo de stock: movimientos firmados, motivos y saldo por lugar. | Backend · operador |
| [`eventos.md`](eventos.md) | Eventos de dominio: qué son, cuándo se emiten y catálogo completo. | Backend · auditor |
| [`arquitectura.md`](arquitectura.md) | Las cuatro piezas del monorepo, sus flujos y las decisiones transversales. | Nuevo dev · backend · frontend |
| [`api.md`](api.md) | La API: autenticación, convenciones REST, formato wire y mapa de errores. | Backend · frontend |
| [`pantallas.md`](pantallas.md) | El panel web: shell, las 15 pantallas y su contrato con la API. | Frontend · auditor |
| [`demo.md`](demo.md) | El modo demo: mismo panel sin backend, siembra, credenciales y límites. | Operador · nuevo dev · frontend |
| [`limitaciones-conocidas.md`](limitaciones-conocidas.md) | El registro único de deudas técnicas: cada limitación, su estado y a quién afecta. | Todos — lectura obligatoria antes de asumir |

## Contrato con la documentación técnica (`packages/domain/docs`)

Los documentos de esta carpeta son la **fuente de verdad de las reglas y
decisiones de producto/diseño**. La documentación
[Diátaxis](https://diataxis.fr/) de
[`packages/domain/docs`](../packages/domain/docs/index.md) es su
**materialización técnica**: explica cómo esas reglas se concretan en el código
de `@fabrik/domain` y enlaza acá cuando corresponde. Si hay discrepancia sobre
reglas, manda el `docs/` raíz; sobre implementación, manda el código.

## Archivo histórico

[`plans/`](plans/README.md) guarda la cronología original de implementación
(los planes numerados por fase, con el estado del proyecto en cada momento).
Tiene valor de archivo: los enlaces internos pueden estar desactualizados; la
documentación vigente es la de esta carpeta.

## Puesta en marcha

Los comandos no se duplican: ver [Puesta en marcha](../README.md#puesta-en-marcha)
en el README raíz.