/**
 * Identificadores del wire en la UI.
 *
 * Los ids de lote/evento son UUID autogenerados; en tablas, selects y banners se
 * muestran abreviados (primeros 8 caracteres) para no romper la maqueta. El id
 * completo queda siempre disponible en `title`/datos técnicos.
 */
export function shortId(id: string): string {
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

/** Etiqueta de un lote para selects/tablas: `#<id corto>`. */
export function batchLabel(batchId: string): string {
  return `#${shortId(batchId)}`;
}
