# Fabrik — Visión y Glosario

## Visión

**Fabrik** es una aplicación para la gestión de fábricas. Organiza la creación de
productos manufacturados a través de múltiples máquinas y operarios, manteniendo
**trazabilidad completa** de cada producto: qué suministros lo formaron, por qué
máquinas pasó, qué trabajadores intervinieron y en qué momento.

El objetivo central es poder **auditar la producción**: cuando algo sale mal en un
producto final, se puede reconstruir toda su genealogía y encontrar dónde ocurrió
el problema.

## Actores y roles

| Rol | Descripción | Permisos |
|---|---|---|
| **Admin** | Gestiona la fábrica | Lectura y escritura de todo: catálogos (productos, suministros, máquinas, lugares, recetas), trabajadores, asignaciones, producción |
| **Worker** | Operario de máquinas | Registra transformaciones de producción en las máquinas que tiene asignadas. Puede dejar observaciones opcionales. Lectura limitada a su contexto operativo |
| **Auditor** | Investigador / control | **Solo lectura** de todo lo que ve el admin. No puede modificar nada. Su caso de uso típico: trazar un lote para encontrar errores |

> Regla de acceso: los permisos se resuelven en la capa de aplicación (use cases),
> nunca dentro de las entidades de dominio.

## Glosario (lenguaje ubicuo)

| Término | Definición |
|---|---|
| **Factory** | La fábrica: raíz del contexto. Contiene lugares, máquinas, trabajadores y catálogos |
| **Material** | Cualquier ítem físico manejado: suministro o producto. Tiene estado físico (sólido, líquido, gaseoso) y unidad de medida. Catálogo definible por el admin |
| **Supply** | Material de tipo materia prima: insumo de la producción |
| **Product** | Material fabricable, final o intermedio. Un producto puede ser output de un paso e input del siguiente |
| **Machine** | Máquina ubicada en un lugar. Transforma inputs en outputs |
| **Location** | Lugar o estación dentro de la fábrica: contiene máquinas o almacena stock |
| **Recipe** | Receta: cadena ordenada de pasos (`RecipeStep`) que define cómo fabricar un producto |
| **Batch** | Lote: instancia concreta de un material en producción o almacenado |
| **BatchEvent** | Registro de una transformación: entradas, salidas, máquina, trabajador, timestamp, observación |
| **Assignment** | Asignación de un trabajador a una máquina en un horario (`TimeSlot`) |
| **Stock** | Cantidad actual de un material en un lugar. Solo muta por `StockMovement` |
| **Quantity** | Value object: monto + unidad de medida coherente con el estado físico del material |
| **TimeSlot** | Value object: rango horario (días de semana + horas) usado en asignaciones |
| **Trazabilidad** | Genealogía completa de un lote: árbol de `BatchEvent` desde los suministros hasta el producto final |

## Decisiones de diseño tomadas

1. El dominio vive en **`packages/domain`**, paquete independiente consumido por
   `apps/api` (backend) y `apps/web` (frontend). Cada app hace sus propias
   implementaciones de los puertos.
2. DDD a nivel sencillo: **entidades, value objects, casos de uso y eventos**.
   Sin aggregates formales ni specifications.
3. Persistencia: **Drizzle ORM + Turso (SQLite)** como adaptador de los puertos
   del dominio, implementado en `apps/api`. El dominio no conoce Drizzle.
4. Producción basada en **recetas de pasos ordenados** (modelo declarativo) más
   **eventos de transformación** (modelo de ejecución) para la trazabilidad real.
5. Un trabajador **no puede estar asignado a dos máquinas con horarios
   solapados** (invariante). Una máquina puede tener muchos trabajadores.
6. Inventario limitado a **stock actual + trazabilidad de movimientos**. Sin
   capacidad máxima de lugares.
7. Las observaciones de los trabajadores viven en el `BatchEvent` (opcionales),
   porque ahí es donde el trabajador actúa físicamente y donde el auditor las
   necesita al investigar.
