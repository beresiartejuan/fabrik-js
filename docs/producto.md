# Fabrik

**Fabrik** es una aplicación para la gestión de fábricas. Organiza la creación de
productos manufacturados a través de múltiples máquinas y operarios, y mantiene
**trazabilidad completa** de cada producto: qué suministros lo formaron, por qué
máquinas pasó, qué trabajadores intervinieron y en qué momento.

El objetivo central es poder **auditar la producción**: cuando algo sale mal en
un producto final, se puede reconstruir toda su genealogía y encontrar dónde
ocurrió el problema — y, en sentido inverso, dado un suministro sospechoso,
identificar todos los productos afectados (*recall*).

## Para quién

Fabrik está pensada para una fábrica con **máquinas** distribuidas en lugares de
producción, **operarios** que las operan en turnos definidos, y roles de
**gestión y auditoría** que planifican la producción e investigan resultado.
Cubre desde la definición del catálogo de materiales y recetas hasta el stock
resultante en los almacenes, pasando por la ejecución real en el piso de planta.

## Capacidades

Cada módulo se apoya en un dominio común (`@fabrik/domain`) y expone sus casos
de uso a la API y a la web:

- **Catálogos** — materiales (suministros y productos, con estado físico y
  unidad de medida), lugares (producción / almacenamiento), máquinas y
  trabajadores con sus roles.
- **Recetas** — cadenas ordenadas de pasos que definen cómo fabricar un
  producto: qué tipo de máquina ejecuta cada paso, qué consume y qué produce.
- **Agenda de máquinas** — asignaciones de operarios a máquinas en franjas
  horarias semanales, con detección de solapamientos.
- **Producción** — arribo de suministros; inicio de órdenes; registro de
  transformaciones paso a paso (lotes consumidos y producidos, con observación
  opcional del operario); almacenamiento y cierre de la orden.
- **Stock** — saldos por lugar calculados como suma de movimientos firmados
  (entradas y salidas), cada uno con su motivo y trazable a su origen.
- **Trazabilidad y eventos** — genealogía completa de cada lote (hacia atrás y
  hacia adelante), historial de eventos de producción y catálogo de eventos de
  dominio.

## Roles y capacidades

Los roles viven en el trabajador como dato de identidad (`admin`, `worker`,
`auditor`); la autorización se resuelve en los casos de uso. La siguiente matriz
es **la referencia canónica** del repositorio: cualquier documento que necesite
saber qué rol puede hacer qué debe derivar de aquí.

| Capacidad | Admin | Operario | Auditor |
|---|---|---|---|
| Catálogos: crear y editar (materiales, lugares, máquinas, trabajadores, recetas) | Sí | No | No |
| Catálogos: consulta | Sí | No | Sí |
| Agenda: asignar y liberar operarios | Sí | No | No |
| Agenda: ver la agenda de una máquina | Sí | No | Sí |
| Agenda: ver la propia agenda | Sí | Sí (solo la propia) | Sí |
| Suministros: registrar arribos | Sí | Sí | No |
| Producción: iniciar una orden | Sí | No | No |
| Producción: consultar órdenes y lotes | Sí | Sí | Sí |
| Producción: registrar transformaciones | No | Sí (solo las propias) | No |
| Producción: almacenar y completar | Sí | Sí | No |
| Stock: consultar saldo por lugar | Sí | Sí | Sí |
| Stock: ver historial de movimientos | Sí | No | Sí |
| Trazabilidad: genealogía, recall y eventos | Sí | No | Sí |

Notas de la matriz:

- El administrador **gestiona** la fábrica pero no opera máquinas: el registro
  de transformaciones de producción exige rol `worker`, y cada operario solo
  puede registrar sus propios eventos. Esta división es deliberada: quien
  planifica no firma la ejecución.
- La consulta de catálogos está reservada a admin y auditor; el operario trabaja
  con lotes y órdenes, no con el catálogo
  ([limitaciones-conocidas.md#catálogos-solo-para-admin-y-auditor](limitaciones-conocidas.md#catálogos-solo-para-admin-y-auditor)).
- La gestión de trabajadores protege el acceso: un admin no puede modificarse a
  sí mismo su rol ni desactivarse, existen guardas adicionales para el último
  admin activo
  ([limitaciones-conocidas.md#lastadminerror-inalcanzable-por-http](limitaciones-conocidas.md#lastadminerror-inalcanzable-por-http)).

## Alcance actual

Está dentro del alcance: múltiples materiales y recetas, máquinas con tipos
abiertos, varios lugares con múltiples almacenes, producción multi-paso con
mermas registradas tal como ocurren, stock por lugar, trazabilidad bidireccional
y eventos de dominio.

### Fuera de alcance hoy

- **Transferencias de stock entre lugares**: el motivo `transfer_out` está
  declarado en el modelo pero no existe caso de uso de transferencia
  ([limitaciones-conocidas.md#transfer_out-no-implementado](limitaciones-conocidas.md#transfer_out-no-implementado)).
- **Stock global fiable por material**: los saldos de planta pueden quedar
  negativos hoy, por lo que la suma global no es un indicador confiable
  ([limitaciones-conocidas.md#i5-stock-negativo-en-plantas](limitaciones-conocidas.md#i5-stock-negativo-en-plantas)).
- **Vistas en tiempo real**: las vistas se calculan a demanda; no existe la
  emisión del evento de inventario que alimentaría paneles en vivo
  ([limitaciones-conocidas.md#stockmoved-no-se-emite](limitaciones-conocidas.md#stockmoved-no-se-emite)).
- **Internacionalización**: la interfaz está en español y los mensajes de
  validación se muestran sin localizar
  ([limitaciones-conocidas.md](limitaciones-conocidas.md)).

## Demo en vivo

Hay una demo desplegada y navegable en
**<https://beresiartejuan.github.io/fabrik-js/>**.

| Usuario | Contraseña | Qué puede hacer |
|---|---|---|
| `admin` | `admin` | Todo: catálogos, recetas, agendas, iniciar producción, arribos. |
| `operario` | `operario` | Registrar transformaciones, arribos, almacenar y completar, ver stock. |
| `auditor` | `auditor` | Todo en **lectura**: stock, trazabilidad y eventos. |

La demo ejecuta los **mismos casos de uso del dominio** en el navegador, sin
backend: login, catálogos, producción, stock y trazabilidad funcionan de
punta a punta. Los datos viven en `sessionStorage` (cada pestaña es un mundo
aparte que se borra al cerrarla) y la base se siembra sola en el primer click,
con una historia productiva completa lista para auditar. El botón «Resetear
demo» la borra y re-siembra. Detalle en [`demo.md`](demo.md) y en el
[README de la demo](../apps/web-demo/README.md).

## Mapa de la documentación

| Documento | Contenido |
|---|---|
| [`glosario.md`](glosario.md) | Lenguaje ubicuo del producto |
| [`modelo-de-dominio.md`](modelo-de-dominio.md) | Entidades, value objects, invariantes y registro de transformaciones |
| [`flujo-de-produccion.md`](flujo-de-produccion.md) | El ciclo de producción de punta a punta |
| [`inventario.md`](inventario.md) | Stock, movimientos firmados y consultas |
| [`eventos.md`](eventos.md) | Catálogo real de eventos de dominio y su transporte |
| [`limitaciones-conocidas.md`](limitaciones-conocidas.md) | Límites y decisiones diferidas, con su estado |
| [Documentación Diátaxis de `@fabrik/domain`](../packages/domain/docs/index.md) | Detalle de implementación: casos de uso, entidades, value objects, errores y eventos |