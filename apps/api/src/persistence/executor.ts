import type { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core';

/**
 * Tipo común para "algo sobre lo que se pueden ejecutar consultas Drizzle" —
 * tanto la conexión (`db`) como un handle de transacción (`tx`). Los adaptadores
 * dependen de esta interfaz para poder inyectarse dentro y fuera del
 * `UnitOfWork` sin duplicar lógica.
 */
export type Executor = SQLiteAsyncDatabase<'async', unknown>;
