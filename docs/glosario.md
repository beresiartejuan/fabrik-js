# Glosario

El lenguaje ubicuo de Fabrik. Cada término corresponde a un concepto del código
(`packages/domain`); las definiciones describen el negocio, no la implementación.
El detalle técnico de cada entidad y value object está en la
[referencia del dominio](../packages/domain/docs/referencia/entidades.md).

| Término | Definición |
|---|---|
| **Actor** | Quien ejecuta una operación, identificado por su trabajador y su rol vigente. Toda operación de Fabrik declara primero quién la puede hacer |
| **Assignment** | Asignación de un trabajador a una máquina en una franja horaria. Un operario puede estar asignado a varias máquinas; una máquina admite varios operarios |
| **Batch** (lote) | Instancia física trazable de un material: nace con el arribo de un suministro, con el inicio de una orden o como producto de una transformación |
| **BatchEvent** | Registro inmutable de una transformación ejecutada en máquina: lotes consumidos, lotes y materiales producidos, máquina, operario, observación opcional e instante. Es el corazón de la trazabilidad |
| **Baja lógica** | Retiro de un elemento del catálogo sin borrarlo: se marca inactivo. Los datos históricos conservan las referencias intactas |
| **Factory** | La fábrica: raíz del contexto, contiene lugares, máquinas, trabajadores y catálogos |
| **Location** | Lugar dentro de la fábrica. Es de producción (aloja máquinas) o de almacenamiento (guarda stock) |
| **Machine** | Máquina ubicada en un lugar de producción. Tiene un tipo (que habilita pasos de receta) y un estado operativo (`idle`, `running`, `maintenance`) |
| **MachineType** | Categoría de máquina, definible por la fábrica (mezcladora, cocinera…). Lo que declara qué pasos de receta puede ejecutar una máquina |
| **Material** | Cualquier ítem físico manejado por la fábrica: suministro o producto. Tiene estado físico (sólido, líquido, gaseoso) y una unidad de medida coherente con él |
| **Merma** | Diferencia entre lo planeado y lo realmente producido en un paso. No se corrige: se registra la realidad y queda visible al auditar |
| **Orden de producción** | El lote raíz creado al iniciar una receta. Representa la orden, no aún producto físico: su cantidad es la planificada; la real se registra en los lotes producidos |
| **Product** | Material fabricable, final o intermedio. El producto de un paso puede ser insumo del siguiente |
| **Quantity** | Monto físico con unidad de medida, siempre mayor que cero. Se opera solo entre cantidades de la misma unidad |
| **Recall** | Investigación hacia adelante desde un lote dado: qué transformaciones lo consumieron y qué productos derivaron de él. Responde a «¿a dónde se fue este suministro?» |
| **Recipe** (receta) | Cadena ordenada de pasos que define cómo fabricar un producto, con su output final esperado |
| **RecipeStep** | Un paso de una receta: tipo de máquina que lo ejecuta, materiales y cantidades que consume, y producto que obtiene |
| **Stock** | Cantidad actual de un material en un lugar. No es un campo editable: es la suma de los movimientos registrados |
| **StockDelta** | Variación firmada de stock: positiva = entrada, negativa = salida. Nunca cero |
| **StockMovement** | Registro inmutable de una variación de stock en un lugar, con su motivo (`produced`, `consumed`, `supply_in`, …) y, si nace de producción, el vínculo al evento que la originó |
| **Supply** | Material de tipo materia prima: insumo externo de la producción |
| **TimeSlot** (franja) | Franja horaria semanal: días de la semana más un rango de horas. Se usa en asignaciones y evalúa la vigencia de un operario en su máquina |
| **Trazabilidad** | Genealogía completa de un lote: el árbol de eventos que conecta los suministros con el producto final, y también el camino inverso dado un suministro |
| **Transformation** | La operación real, registrada, de convertir inputs en outputs en una máquina. La planifican las recetas; la ejecutan y firman los operarios |
| **Worker** | Trabajador de la fábrica, con uno de tres roles: `admin`, `worker` (operario) o `auditor` |

Véanse también: [`producto.md`](producto.md) para los roles y sus alcances,
[`modelo-de-dominio.md`](modelo-de-dominio.md) para las reglas que unen estos
conceptos.