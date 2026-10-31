// Prueba de punta a punta de "Subir datos": una base local (postgres/larafarma.sql),
// una base que imita Supabase con la migración de subida, y un servidor HTTP que
// hace de API de Supabase (valida la clave y ejecuta las funciones reales).
// Lo corre scripts/probar-subida.sh; no toca ninguna base tuya.

import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { crearNube, ErrorNube } from "@/lib/nube-http";
import { sincronizar, type DatosLocales, type Local, type ResumenSubida } from "@/lib/subir-datos";

const { Client } = pg;
const puerto = Number(process.env.PUERTO);
const CLAVE = "clave-de-servicio-de-prueba";

const conectar = async (usuario: string, base: string) => {
  const cliente = new Client({ host: "127.0.0.1", port: puerto, user: usuario, database: base });
  await cliente.connect();
  return cliente;
};

const dueno = await conectar("postgres", "local");
const web = await conectar("web", "local");
const nubeDb = await conectar("postgres", "nube");

let pasos = 0;
const bien = (mensaje: string) => {
  pasos++;
  console.log(`OK ${mensaje}`);
};

// --- Base local, como la usa la aplicación: una transacción con el token de la sesión.
async function conSesion<T>(token: string, texto: string, valores: unknown[] = []): Promise<T[]> {
  await web.query("begin");
  try {
    await web.query("select set_config('larafarma.token', $1, true)", [token]);
    const r = await web.query(texto, valores);
    await web.query("commit");
    return r.rows as T[];
  } catch (error) {
    await web.query("rollback");
    throw error;
  }
}
async function entrar(correo: string, contrasena: string): Promise<string> {
  const [fila] = await conSesion<{ r: { ok: boolean; token: string; error?: string } }>("", "select iniciar_sesion($1, $2) as r", [correo, contrasena]);
  assert.ok(fila.r.ok, `no entró ${correo}: ${fila.r.error}`);
  return fila.r.token;
}
const uno = async <T>(token: string, texto: string, valores?: unknown[]) => (await conSesion<T>(token, texto, valores))[0];

// --- La "nube": un servidor HTTP que se comporta como la API de Supabase.
const FUNCIONES = new Set(["mapa_usuarios", "subir_catalogo", "subir_operacion"]);
const leerCuerpo = (req: IncomingMessage) =>
  new Promise<string>((ok) => {
    let datos = "";
    req.on("data", (trozo) => (datos += trozo));
    req.on("end", () => ok(datos));
  });
const servidor = createServer(async (req, res) => {
  const responder = (estado: number, cuerpo: unknown) => {
    res.writeHead(estado, { "Content-Type": "application/json" });
    res.end(JSON.stringify(cuerpo));
  };
  const coincide = /^\/rest\/v1\/rpc\/(\w+)$/.exec(req.url ?? "");
  if (!coincide || req.method !== "POST") return responder(404, { message: "no existe", code: "PGRST202" });
  if (req.headers.apikey !== CLAVE || req.headers.authorization !== `Bearer ${CLAVE}`) return responder(401, { message: "Invalid API key" });
  if (!FUNCIONES.has(coincide[1])) return responder(404, { message: "Could not find the function", code: "PGRST202" });
  const { p } = JSON.parse(await leerCuerpo(req)) as { p: unknown };
  try {
    await nubeDb.query("begin");
    await nubeDb.query("set local role service_role");
    const r = await nubeDb.query(`select public.${coincide[1]}($1::jsonb) as r`, [JSON.stringify(p)]);
    await nubeDb.query("commit");
    responder(200, r.rows[0].r);
  } catch (error) {
    await nubeDb.query("rollback");
    const { message, code } = error as { message: string; code?: string };
    responder(400, { message, code });
  }
});
await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
const url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
const nube = crearNube(url, CLAVE);

const cloud = async <T>(texto: string, valores: unknown[] = []) => (await nubeDb.query(texto, valores)).rows as T[];
const cuenta = async (tabla: string) => Number((await cloud<{ n: string }>(`select count(*) as n from public.${tabla}`))[0].n);

try {
  // ===== Una farmacia con movimiento: ventas de Eva (turno cerrado), de Ana (turno abierto) y una entrada
  await dueno.query("select crear_primer_admin('Ana López', 'ana@farmacia.mx', 'temporal-ana-123')");
  const tokenAna = await entrar("ana@farmacia.mx", "temporal-ana-123");
  await uno(tokenAna, "select cambiar_contrasena('temporal-ana-123', 'ana-nueva-1234')");
  await uno(tokenAna, "select crear_usuario('Eva Cajera', 'eva@farmacia.mx', 'temporal-eva-123', 'empleado')");

  const ids = Object.fromEntries(
    (await dueno.query("select codigo_barras, id from productos")).rows.map((f: { codigo_barras: string; id: string }) => [f.codigo_barras, f.id]),
  );
  const PARACETAMOL = ids["7501000000011"];
  const AMOXICILINA = ids["7501000000035"];
  const IBUPROFENO = ids["7501000000028"];
  const LORATADINA = ids["7501000000059"];
  const proveedor = (await dueno.query("select id from proveedores order by nombre limit 1")).rows[0].id;
  const partida = (producto: string, cantidad: number) => JSON.stringify([{ producto_id: producto, cantidad }]);

  const tokenEva = await entrar("eva@farmacia.mx", "temporal-eva-123");
  await uno(tokenEva, "select abrir_turno(50000)");
  await uno(tokenEva, "select registrar_venta($1, 'efectivo', 10000)", [partida(PARACETAMOL, 2)]);
  await uno(tokenEva, "select registrar_venta(p_partidas => $1, p_metodo => 'tarjeta', p_receta => $2)", [
    partida(AMOXICILINA, 1),
    JSON.stringify({ medico: "Dra. Ruiz", cedula: "ab123", fecha: "2026-01-01", folio: "R-1" }),
  ]);
  await uno(tokenEva, "select cerrar_turno(57000)"); // fondo 500 + 70 de la venta en efectivo
  await uno(tokenAna, "select abrir_turno(10000)");
  await uno(tokenAna, "select registrar_venta($1, 'efectivo')", [partida(IBUPROFENO, 1)]);
  await uno(tokenAna, "select registrar_entrada($1, 'F-E2E-1', current_date, $2)", [
    proveedor,
    JSON.stringify([{ producto_id: LORATADINA, lote: "e2e1", caducidad: "2030-01-01", cantidad: 5, costo: 1900 }]),
  ]);

  const local = (token: string): Local => ({
    iniciar: async () => (await uno<{ r: { id: number; desde: string } }>(token, "select iniciar_sincronizacion() as r")).r,
    datos: async (desde) => (await uno<{ d: DatosLocales }>(token, "select datos_para_subir($1) as d", [desde])).d,
    terminar: async (id, ok, resumen, error) => {
      await uno(token, "select terminar_sincronizacion($1, $2, $3, $4)", [id, ok, resumen ? JSON.stringify(resumen) : null, error]);
    },
  });
  const ultimaSubida = async () =>
    (await dueno.query("select desde::text, ok, completa from sincronizaciones order by id desc limit 1")).rows[0] as { desde: string; ok: boolean; completa: boolean };

  // La nube solo conoce a Ana.
  const [ana] = await cloud<{ id: string }>("insert into auth.users (email) values ('ana@farmacia.mx') returning id");
  await cloud("insert into public.usuarios (id, nombre, correo, rol, debe_cambiar_contrasena) values ($1, 'Ana López', 'ana@farmacia.mx', 'admin', false)", [ana.id]);

  // ===== 1. Primera subida: falta la cuenta de Eva
  let r: ResumenSubida = await sincronizar(local(tokenAna), nube);
  assert.deepEqual(r.sinCuenta.correos, ["eva@farmacia.mx"]);
  assert.equal(r.completa, false);
  assert.equal(r.operacion.ventas_nuevas, 1, "solo la venta de Ana");
  assert.equal(r.sinCuenta.ventas, 2, "las dos de Eva quedan pendientes");
  assert.equal(await cuenta("ventas"), 1);
  assert.equal(await cuenta("productos"), Number((await dueno.query("select count(*) from productos")).rows[0].count));
  bien("1ª subida: lo de Eva queda pendiente y dice qué cuenta falta");
  assert.equal((await ultimaSubida()).completa, false);
  bien("una subida incompleta no marca el punto de partida");

  // ===== 2. Se crea la cuenta de Eva en la nube y se vuelve a subir
  const [eva] = await cloud<{ id: string }>("insert into auth.users (email) values ('eva@farmacia.mx') returning id");
  await cloud("insert into public.usuarios (id, nombre, correo, rol, debe_cambiar_contrasena) values ($1, 'Eva Cajera', 'eva@farmacia.mx', 'empleado', false)", [eva.id]);
  r = await sincronizar(local(tokenAna), nube);
  assert.equal(r.completa, true);
  assert.equal(r.operacion.ventas_nuevas, 2, "ahora sí las dos de Eva");
  assert.equal(r.operacion.ventas_ya_estaban, 1, "la de Ana no se repite");
  assert.equal(r.operacion.entradas_ya_estaban, 1, "la entrada tampoco");
  assert.equal(await cuenta("ventas"), 3);
  assert.equal((await ultimaSubida()).completa, true);
  bien("2ª subida: con la cuenta creada suben las ventas pendientes sin repetir las anteriores");

  // ===== 3. Local y nube cuadran
  const igual = async (que: string, local_: string, nube_: string, valores: unknown[] = []) => {
    const a = (await dueno.query(local_, valores)).rows;
    const b = await cloud(nube_, valores);
    assert.deepEqual(b, a, `${que}: la nube no coincide con local`);
  };
  await igual("folios y totales", "select folio::int, total, subtotal, iva, estado from ventas order by folio", "select folio::int, total, subtotal, iva, estado from public.ventas order by folio");
  await igual("pagos", "select metodo, monto, recibido from venta_pagos order by monto, metodo", "select metodo, monto, recibido from public.venta_pagos order by monto, metodo");
  await igual("partidas", "select cantidad, precio, importe from venta_partidas order by importe, cantidad", "select cantidad, precio, importe from public.venta_partidas order by importe, cantidad");
  await igual("recetas", "select tipo, medico, cedula, folio_receta from recetas", "select tipo, medico, cedula, folio_receta from public.recetas");
  await igual(
    "existencias por lote",
    "select p.codigo_barras, l.numero, l.cantidad, l.costo, l.estado from lotes l join productos p on p.id = l.producto_id order by 1, 2",
    "select p.codigo_barras, l.numero, l.cantidad, l.costo, l.estado from public.lotes l join public.productos p on p.id = l.producto_id order by 1, 2",
  );
  await igual("costos y precios", "select codigo_barras, precio, costo from productos order by codigo_barras", "select codigo_barras, precio, costo from public.productos order by codigo_barras");
  await igual("kardex", "select tipo, cantidad::int from movimientos_inventario order by tipo, cantidad", "select tipo, cantidad::int from public.movimientos_inventario order by tipo, cantidad");
  await igual("caja", "select tipo, metodo, monto from movimientos_caja order by monto, metodo", "select tipo, metodo, monto from public.movimientos_caja order by monto, metodo");
  await igual("cortes", "select fondo_inicial, efectivo_esperado, efectivo_contado, (cerrado_en is null) as abierto from turnos_caja order by fondo_inicial", "select fondo_inicial, efectivo_esperado, efectivo_contado, (cerrado_en is null) as abierto from public.turnos_caja order by fondo_inicial");
  assert.equal(
    (await cloud<{ n: string }>("select count(*) as n from public.ventas v join public.usuarios u on u.id = v.usuario_id where u.correo = 'eva@farmacia.mx'"))[0].n,
    "2",
  );
  bien("local y nube coinciden: folios, totales, pagos, partidas, recetas, existencias, costos, kardex, caja y cortes");

  // El administrador ve los mismos reportes en la nube
  const reporteLocal = (await uno<{ r: { resumen: Record<string, number> } }>(tokenAna, "select reporte_ventas(hoy_local() - 30, hoy_local()) as r")).r.resumen;
  await nubeDb.query("begin");
  await nubeDb.query("set local role authenticated");
  await nubeDb.query("select set_config('request.jwt.claim.sub', $1, true)", [ana.id]);
  const reporteNube = (await nubeDb.query("select public.reporte_ventas(public.hoy_local() - 30, public.hoy_local()) as r")).rows[0].r.resumen as Record<string, number>;
  await nubeDb.query("commit");
  assert.deepEqual(reporteNube, reporteLocal);
  assert.equal(reporteLocal.tickets, 3);
  assert.ok(reporteLocal.costo > 0, "el reporte usa los costos de los lotes");
  bien("el reporte de la nube (ventas, utilidad, costo) es idéntico al local");

  // El siguiente folio de la nube sigue después del último
  const folioMax = Number((await cloud<{ m: string }>("select max(folio) as m from public.ventas"))[0].m);
  const [{ n: siguiente }] = await cloud<{ n: string }>("select nextval(pg_get_serial_sequence('public.ventas', 'folio')) as n");
  assert.ok(Number(siguiente) > folioMax);
  bien("la nube no repite folios");

  // ===== 4. Subir sin cambios no duplica nada
  const antes = { ventas: await cuenta("ventas"), partidas: await cuenta("venta_partidas"), kardex: await cuenta("movimientos_inventario"), caja: await cuenta("movimientos_caja") };
  r = await sincronizar(local(tokenAna), nube);
  assert.equal(r.operacion.ventas_nuevas, 0);
  assert.equal(r.operacion.entradas_nuevas, 0);
  assert.equal(r.completa, true);
  assert.deepEqual(
    { ventas: await cuenta("ventas"), partidas: await cuenta("venta_partidas"), kardex: await cuenta("movimientos_inventario"), caja: await cuenta("movimientos_caja") },
    antes,
  );
  bien("subir otra vez no cambia nada");

  // ===== 5. Más movimiento local: una venta nueva y el corte del turno abierto
  await uno(tokenAna, "select registrar_venta($1, 'efectivo')", [partida(LORATADINA, 2)]);
  await uno(tokenAna, "select cerrar_turno(50000)");
  r = await sincronizar(local(tokenAna), nube);
  assert.equal(r.operacion.ventas_nuevas, 1);
  assert.equal(r.operacion.turnos_cerrados, 1, "el turno que estaba abierto en la nube se cierra");
  assert.equal((await cloud<{ n: string }>("select count(*) as n from public.turnos_caja where cerrado_en is null"))[0].n, "0");
  await igual(
    "existencias tras la venta",
    "select p.codigo_barras, l.numero, l.cantidad from lotes l join productos p on p.id = l.producto_id order by 1, 2",
    "select p.codigo_barras, l.numero, l.cantidad from public.lotes l join public.productos p on p.id = l.producto_id order by 1, 2",
  );
  bien("una venta nueva y el corte de caja llegan en la siguiente subida; las existencias siguen iguales");

  // ===== 6. Un cambio de precio local llega a la nube
  await dueno.query("update productos set precio = precio + 100 where id = $1", [PARACETAMOL]);
  r = await sincronizar(local(tokenAna), nube);
  assert.equal(r.catalogo.productos_actualizados, 1);
  await igual("precios", "select codigo_barras, precio from productos order by 1", "select codigo_barras, precio from public.productos order by 1");
  bien("un cambio de precio en local llega a la nube");

  // ===== 7. Fallos: clave mala y subida que se corta
  await assert.rejects(() => crearNube(url, "clave-mala").usuarios([]), (e: unknown) => e instanceof ErrorNube && /rechazó la clave/.test(e.message));
  await assert.rejects(() => sincronizar(local(tokenAna), crearNube(url, "clave-mala")), /rechazó la clave/);
  const fallida = await ultimaSubida();
  assert.equal(fallida.ok, false);
  r = await sincronizar(local(tokenAna), nube);
  assert.equal(r.completa, true);
  bien("con la clave mala no sube y lo anota; la siguiente subida funciona");
  await assert.rejects(() => crearNube("http://127.0.0.1:9", CLAVE).usuarios([]), (e: unknown) => e instanceof ErrorNube && /No se pudo conectar/.test(e.message));
  bien("sin conexión da un mensaje claro");

  console.log(`\nSubida de punta a punta: ${pasos} comprobaciones correctas`);
} finally {
  servidor.close();
  await Promise.all([dueno.end(), web.end(), nubeDb.end()]);
}
