# Limitaciones conocidas

Este es el único registro de deudas técnicas de Fabrik: cada entrada describe una
limitación real del sistema hoy, con su estado, a quién afecta y por qué existe.
Nada de lo listado está oculto — son decisiones conscientes o huecos por cerrar,
documentados para que nadie los reaprenda por error.

Estados usados: **diferido** (la decisión de diseño lo pospuso explícitamente),
**aceptado** (costo asumido a cambio de simplicidad) y **pendiente** (trabajo por hacer).

---

**Dominio**

## I5: stock negativo en plantas

Diferida. `InsufficientStockError` existe y mapea a `409`, pero ningún caso de uso la
lanza: el consumo se debita en el lugar de la máquina y los outputs solo ingresan a stock
en `StoreBatch`, así que comprobar no-negatividad ahí sería incoherente. Consecuencia:
`GET /stock/:locationId` muestra montos negativos en plantas (la UI los pinta con signo),
sin validación de suficiencia por lote (lotes inmutables, sin contador).

## transfer_out no implementado

Diferido. El reason `transfer_out` está declarado en el modelo de movimientos, pero no
existe un caso de uso de transferencia entre lugares; solo su par `transfer_in` se usa
hoy en `StoreBatch` para lotes sin evento de origen. Mover stock manualmente entre
lugares no es posible todavía (afecta a admin principalmente).

## stock.moved no se emite

Diferido. El evento `stock.moved`, su payload y su fábrica están definidos y exportados
en el dominio, pero ningún caso de uso lo publica: solo se emiten los eventos enumerados
por caso de uso (`supply.arrived`, `batch.transformed`, etc.). Quien quiera reaccionar a
movimientos de stock debe leer la tabla de movimientos o el evento productivo que la originó.

## LastAdminError inalcanzable por HTTP

Guarda de dominio sin camino. El último admin activo no puede degradarse ni
desactivarse, pero por HTTP la autoprotección (`SelfModificationNotAllowedError`) corta
antes: el último admin es a la vez actor y objetivo de la operación. La clase mapea a
`409` y queda lista para flujos futuros de administración en cascada; hoy no afecta a nadie.

## Transformación ad-hoc sin validación de paso

Aceptado. Cuando ningún lote de input aporta `recipeId`, `RecordTransformation` no tiene
receta contra la cual resolver `recipeStepId`: omite esa validación y registra la
transformación igualmente (vía para transformaciones fuera de receta). Contrapeso: la
comprobación paso ↔ tipo de máquina solo aplica cuando hay receta declarada en los inputs.

## Receta laxa entre pasos consecutivos

Aceptado. `Recipe` valida posiciones consecutivas (1..N) e I7 (output final = producto
de salida), pero no valida que el output del paso N sea input del paso N+1: una receta
puede declarar pasos no enlazados (los intermedios se declaran `kind: 'product'`).
Afecta a admin (recetas malas pasan la validación) y a auditor (mermas menos explicables).

## UpdateLocation solo renombra

Aceptado. `PATCH /locations/:id` solo cambia el nombre: cambiar el `kind` de un lugar
podría violar I2 (una máquina quedaría en un lugar que pasa a `storage`) y detectarlo
exigiría consultar máquinas por lugar. Afecta a admin: una ubicación mal tipada se
resuelve creando otra y moviendo las máquinas.

## Quantity no convierte unidades

Aceptado. Solo se opera entre cantidades de la misma unidad (no hay conversión
`kg` ↔ `g`) y `Quantity.subtract` rechaza resultados ≤ 0, así que los cálculos de stock
usan montos crudos y no este VO. Afecta a formularios y reportes: cada unidad es un
universo cerrado.

## GetStockByLocation: unidad y filas en cero

Aceptado. El agregado toma la unidad del `unitOfMeasure` del catálogo del material (I6),
no de cada movimiento: pueden convivir movimientos con unidad distinta y el reporte los
unifica igual. Un material con delta neto `0` se omite del resultado (sin filas en cero).
Afecta al panel de stock y a quien audite movimientos heterogéneos.

## El dominio no abstrae reloj ni ids

Aceptado y estructural. Los use cases sellan timestamps con `new Date()` y las fábricas
de ids usan `crypto.randomUUID`: la vigencia de franjas (`TimeSlot.contains`) se evalúa
en la **zona local del proceso** — en la API, la del servidor (fuente de verdad de I3;
conviene fijar `TZ`); en la demo, la del navegador. Sin inyección de reloj.

## Unidad de los inputs sin validar al transformar

Aceptado. `RecordTransformation` valida la coherencia de unidad de los **outputs** (I6),
pero no la de los **inputs**: nada impide consumir un lote más de lo que contiene, ni
una segunda vez en eventos distintos (lotes inmutables, sin contador). Contracara de
I5 diferida; afecta a la precisión del inventario declarado.

---

**API**

## Catálogos solo para admin y auditor

Aceptado (por ahora). Las lecturas de catálogo (`/materials`, `/locations`, `/machines`,
`/workers`, `/recipes`) son `admin`/`auditor`; un **worker** recibe `403` aunque el
dominio le permita arribar, almacenar o completar — el panel degrada sus pantallas a
entrada manual de ids. Si se agregan lecturas para worker, los modos de catálogo del
front se activan solos (la puerta compara el rol, no el error).

## Eventos sin paginación

Pendiente. `GET /batch-events` y el resto de listados devuelven todo (o lo que calce en
un filtro), sin cursor ni límite: con histórico grande crece la respuesta y el recorte
lo hace cada cliente. El panel muestra la cola de 200 eventos con nota explícita; la
demo no recorta. Afecta a admin/auditor con datos acumulados y a la latencia de `/eventos`.

## No hay endpoint para reactivar workers

Pendiente. `Worker.activate()` existe en la entidad, pero `PATCH /workers/:id` no expone
reactivación tras una baja lógica; la UI muestra "Reactivar" deshabilitado con nota.
Para devolver un worker dado de baja hay que tocar la base o crearlo de nuevo.

## El status de las máquinas es de solo lectura

Pendiente. Ninguna ruta transiciona `Machine.status` (`idle`/`running`/`maintenance`):
se crea con el estado inicial y por HTTP no hay transiciones. El panel lo muestra como
badge y filtra máquinas en mantenimiento al registrar transformaciones. Afecta a admin:
no puede poner una máquina en mantenimiento desde la UI.

## No existe GET /assignments

Pendiente. El recurso `assignments` expone crear, desasignar y las agendas por worker y
por máquina (`GET /workers/:id/schedule`, `GET /machines/:id/schedule`); no hay un
listado plano de todas las asignaciones — consolidar la matriz completa exige consultar
agenda por agenda.

## Sin rate limiting

Pendiente. La API no limita la tasa de peticiones por IP, usuario o token; los endpoints
públicos (`/auth/login`, `/auth/refresh`) son los más expuestos a intentos repetidos. El
scrypt y la contención de reuso reducen el daño, pero un despliegue expuesto necesita
capas externas (proxy/gateway) hasta que exista un limitador propio.

## El name de login no garantiza unicidad

Aceptado. El login identifica workers por `name` (el `Worker` del dominio no tiene email
ni username aparte), pero el esquema no impone índice único: la unicidad hoy la
garantizan el seed y el uso, no el almacén. Dos workers con el mismo `name` dejarían el
login ambiguo (gana el primero de la lista).

## Sin stock global por material

Pendiente. El stock existe siempre por ubicación (`GET /stock/:locationId`); no hay una
consulta que sume un material sobre todas las ubicaciones. Un inventario global exige
sumar respuestas en el cliente; el dominio ya ofrece las piezas para derivarla
(`sumByLocationAndMaterial` por lugar).

## Trazabilidad solo busca por id de lote

Aceptado. Los árboles de genealogía y recall se consultan por `batchId` exacto: no hay
búsqueda por material, nombre, máquina ni fecha (los filtros de `/batch-events` cubren
parte del camino). El panel ayuda con un listado de "lotes recientes" derivado de esa
ruta; afecta a auditor/admin al buscar recalls sin el id a mano.

## EventBus in-process sin consumidores

Aceptado. El event bus es un singleton en memoria cuyo `publish` es no-op en producción
(contrato sin `subscribe`): los eventos se emiten pero nadie los consume — ni webhooks,
ni colas, ni proyecciones. Conectar consumidores no toca el dominio: es cambiar el
provider.

---

**Web**

## Copys de UI en español hardcodeados

Aceptado. Toda la interface (labels, mensajes de error, estados vacíos, fechas con
`Intl` y locale `es`) está en español sin capa de i18n; cambiar de idioma exige tocar
código. Afecta a cualquier despliegue que aspire a otro idioma.

## Sin tiempo real

Aceptado. No hay websockets ni polling continuo: el dashboard y las pantallas se
actualizan por refetch manual. Un panel que necesite "eventos nuevos ahora" pide
recargar; los eventos del bus no llegan al front por ningún canal.

## La UI acopla su mapa de errores al shape de la API

Aceptado. `errorToMessage()` mapea clases de dominio y status a mensajes en español: un
cambio en la tabla error → HTTP o en el cuerpo
`{ statusCode, error, message, context }` obliga a actualizar el mapa del front (y su
espejo en la demo). Es el contrato más frágil entre capas; lo protegen los tests de
parity con fixtures del wire real.

## useApiQuery no cancela peticiones en vuelo

Aceptado. El hook pasa un `AbortSignal` que ningún transporte honra (axios tampoco lo
usaba): la cancelación real no existe y una respuesta tardía de una navegación anterior
puede llegar después; el generation id del hook ya descarta respuestas fuera de orden.

## El worker opera con entrada manual de ids

Aceptado (puente de la limitación de catálogos). Donde su rol no puede leer catálogos
(arribo, transformación, almacenar, stock), la UI del operario pide ids y unidades a
mano y delega la validación en el servidor (I6 → `422`). Correcto pero incómodo; lo
elimina exponer lecturas de catálogo al rol worker.

---

**Demo**

## Demo sin errores 400 de zod

Aceptado. La API valida cuerpos con zod y responde `400` con
`{ error: "ValidationError", issues[] }`; la demo no replica ese paso — confía en la
pre-validación del cliente y la entrada que la salta emerge como `409`/`422` del
dominio. Solo se alcanza fabricando un payload a mano; sin parity total del `400`.

## UnitOfWork demo sin rollback

Aceptado. El `UnitOfWork` de la demo entrega los mismos repos y hace autosave al
confirmar: no abre transacción ni revierte. Los casos de uso validan **antes** de
escribir dentro del `run`, así que el riesgo de escritura parcial es marginal — pero una
falla a mitad de `run` podría persistir estado incompleto. La API real sí tiene
commit/rollback: la principal asimetría entre ambas apps.

## Tokens opacos y contraseñas en claro

Aceptado por diseño de demo. Los tokens (`demo-access.<id>` / `demo-refresh.<id>`) no
se firman ni vencen (`expiresIn` es decorativo) y las contraseñas sembradas viajan en
claro en el snapshot. Equivalencia funcional con la API (login, rotación de par y rol
fresco) sin sus garantías criptográficas: la demo nunca debe copiarse a un entorno real.

## sessionStorage por pestaña

Aceptado. El snapshot de datos (`fabrik.demo.db`) y la sesión (`fabrik.session`) viven
en `sessionStorage`: cada pestaña es un mundo aparte, no comparte estado y todo se
borra al cerrarla. Está avisado en la propia UI; conservar trabajo exige mantener la
pestaña viva (o resetear a conciencia).

## La demo exige contexto seguro

Aceptado. La generación de ids del dominio usa `crypto.randomUUID`, que en navegador
solo existe en contextos seguros: la demo corre sobre `localhost` o `https`; abierta
por `http://` con un host remoto, falla ruidoso. No hay fallback — misma exigencia que
la API bajo Node ≥ 20.

## Deriva del fork web/web-demo

Aceptado, con costo asumido. La demo duplica el árbol de componentes, pantallas y suite
de `apps/web` (app original congelada como referencia): cada arreglo se hace dos veces
y los árboles pueden divergir. Contenciones: fixtures espejo del wire real, comentarios
de "mantener sincronizado" sobre los serializadores duplicados y el procedimiento de
sincronización en el README de la demo.

---

**Operación**

## Turso remoto por definir

Pendiente. La persistencia hoy es SQLite local por archivo (`FABRIK_DB_FILE`), y no hay
URL de Turso Cloud, estrategia de seeding de un entorno remoto ni despliegue
automatizado de la API — el único pipeline de despliegue es el de la demo (GitHub
Pages). Un entorno multi-instancia requiere definir ese camino.

## Un solo proceso por archivo SQLite

Aceptado (limitación del motor). El SDK de Turso embebido no admite múltiples procesos
escribiendo el mismo archivo: un solo proceso API por `FABRIK_DB_FILE` (WAL por
defecto). Suficiente para el despliegue single-node actual; relevante si aparecen
réplicas o workers separados sobre la misma base.

## Secretos de desarrollo en .env.example

Aceptado con advertencia. El ejemplo de entorno trae secretos JWT y credenciales de
fábrica (`admin/admin123` — vía seed — y `BOOTSTRAP_ADMIN_*`), necesarios para arrancar
sin configurar nada. Olvidar su rotación antes de un despliegue real es el riesgo
operativo asociado.

## FABRIK_ALLOW_CLIENT_TIMESTAMP debe mantenerse apagado

Aceptado, con riesgo conocido. La variable hace que `POST /production/transform` honre
el `timestamp` del cuerpo en vez del reloj del servidor: es la válvula para tests e2e
deterministas de la ventana de I3, pero activada por descuido permitiría backdating de
eventos. Apagada salvo en entornos de test (ver la [tabla de variables de
`apps/api`](../apps/api/README.md)).