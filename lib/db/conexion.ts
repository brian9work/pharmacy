import "server-only";
import { Pool, types, type PoolClient } from "pg";

// Tipos que pg convierte distinto de lo que esperan las pantallas.
// bigint (folios, conteos) cabe en un number.
types.setTypeParser(types.builtins.INT8, Number);
// Las fechas sin hora se quedan como texto "AAAA-MM-DD": sin zona de por medio.
types.setTypeParser(types.builtins.DATE, (valor) => valor);
// Los instantes llegan como texto ISO, como los espera lib/formato.ts.
const leerInstante = types.getTypeParser(types.builtins.TIMESTAMPTZ);
types.setTypeParser(types.builtins.TIMESTAMPTZ, (valor) => new Date(leerInstante(valor) as Date).toISOString());

declare global {
  var larafarmaPool: Pool | undefined;
}

/** Un solo pool por proceso (en desarrollo sobrevive a las recargas). */
function pool(): Pool {
  if (!globalThis.larafarmaPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Falta la variable DATABASE_URL en .env");
    globalThis.larafarmaPool = new Pool({ connectionString, max: 10 });
  }
  return globalThis.larafarmaPool;
}

export type Consultar = <T>(texto: string, valores?: unknown[]) => Promise<T[]>;

/**
 * Corre `trabajo` en una transacción con la sesión de quien hace la petición.
 * La base lee el token con usuario_actual() y aplica sus reglas RLS. Sin
 * token (acceso), las funciones y reglas tratan la petición como anónima.
 */
export async function enTransaccion<T>(token: string | null, trabajo: (consultar: Consultar) => Promise<T>): Promise<T> {
  const cliente: PoolClient = await pool().connect();
  try {
    await cliente.query("begin");
    // true = solo dura esta transacción: la conexión vuelve limpia al pool.
    await cliente.query("select set_config('larafarma.token', $1, true)", [token ?? ""]);
    const resultado = await trabajo(async (texto, valores) => (await cliente.query(texto, valores)).rows);
    await cliente.query("commit");
    return resultado;
  } catch (error) {
    await cliente.query("rollback").catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}
