-- Pruebas de reglas: anónimo, sesión sin cuenta, empleado bloqueado, empleado y admin.
-- Se corren con scripts/probar-base.sh sobre un PostgreSQL temporal.
\set QUIET 1
\pset tuples_only on
\pset format unaligned
set client_min_messages = notice;

create schema pruebas;
grant usage on schema pruebas to anon, authenticated;

create function pruebas.error(consulta text, que text) returns void language plpgsql as $$
begin
  execute consulta;
  raise exception 'FALLO: se esperaba error en "%"', que;
exception when others then
  if sqlerrm like 'FALLO:%' then raise; end if;
  raise notice 'OK (bloqueado) %  →  %', que, sqlerrm;
end;
$$;

-- Como pruebas.error, pero además exige que el mensaje diga `esperado`.
create function pruebas.error_con(consulta text, esperado text, que text) returns void language plpgsql as $$
begin
  execute consulta;
  raise exception 'FALLO: se esperaba error en "%"', que;
exception when others then
  if sqlerrm like 'FALLO:%' then raise; end if;
  if position(esperado in sqlerrm) = 0 then
    raise exception 'FALLO: "%" falló por otra razón: %', que, sqlerrm;
  end if;
  raise notice 'OK (bloqueado) %  →  %', que, sqlerrm;
end;
$$;

create function pruebas.cumple(cond boolean, que text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLO: %', que; end if;
  raise notice 'OK %', que;
end;
$$;

create function pruebas.como(correo text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    coalesce((select json_build_object('sub', id, 'role', 'authenticated')::text from auth.users where email = correo), ''), false);
end;
$$;

grant execute on all functions in schema pruebas to anon, authenticated;

-- Cuentas: admin, empleado, empleado bloqueado y alguien con sesión pero sin cuenta en la farmacia.
insert into auth.users (email) values ('ana@farmacia.mx'), ('carlos@farmacia.mx'), ('jorge@farmacia.mx'), ('intruso@ejemplo.com');
insert into public.usuarios (id, nombre, correo, rol, debe_cambiar_contrasena)
select id, 'Ana López', email, 'admin', false from auth.users where email = 'ana@farmacia.mx';
insert into public.usuarios (id, nombre, correo, rol)
select id, 'Carlos Ruiz', email, 'empleado' from auth.users where email = 'carlos@farmacia.mx';
insert into public.usuarios (id, nombre, correo, rol, activo)
select id, 'Jorge Peña', email, 'empleado', false from auth.users where email = 'jorge@farmacia.mx';

\echo '--- Sin sesión (anon)'
select pruebas.como('');
set role anon;
select pruebas.error($$select count(*) from public.productos$$, 'anon lee productos');
select pruebas.error($$select public.registrar_venta('[]', 'efectivo')$$, 'anon llama RPC');
reset role;

\echo '--- Sesión sin cuenta en la farmacia'
select pruebas.como('intruso@ejemplo.com');
set role authenticated;
select pruebas.cumple((select count(*) = 0 from public.productos), 'no ve productos');
select pruebas.cumple((select count(*) = 0 from public.negocio), 'no ve el negocio');
select pruebas.error($$select public.abrir_turno(100)$$, 'no abre caja');
reset role;

\echo '--- Empleado bloqueado'
select pruebas.como('jorge@farmacia.mx');
set role authenticated;
select pruebas.cumple((select count(*) = 0 from public.productos), 'no ve productos');
select pruebas.error($$select public.registrar_acceso()$$, 'no registra acceso');
reset role;

\echo '--- Empleado (Carlos)'
select pruebas.como('carlos@farmacia.mx');
set role authenticated;
select pruebas.cumple((select count(*) = 16 from public.productos), 've 16 productos');
select pruebas.error($$select costo from public.productos limit 1$$, 'lee costos de productos');
select pruebas.error($$select costo from public.lotes limit 1$$, 'lee costos de lotes');
select pruebas.error($$select * from public.costos_productos()$$, 'llama costos_productos()');
select pruebas.error($$insert into public.ventas (turno_id, usuario_id, subtotal, iva, total) values (gen_random_uuid(), auth.uid(), 1, 0, 1)$$, 'inserta venta directo');
select pruebas.error($$truncate public.bitacora$$, 'truncate');
update public.productos set precio = 1;
update public.usuarios set rol = 'admin' where id = auth.uid();
reset role;
select pruebas.cumple((select min(precio) > 1 from public.productos), 'no pudo cambiar precios (RLS)');
select pruebas.cumple((select rol = 'empleado' from public.usuarios where correo = 'carlos@farmacia.mx'), 'no pudo hacerse admin (RLS)');
set role authenticated;
select pruebas.error($$select public.guardar_permisos_empleado(array['reportes.ver'])$$, 'cambia permisos');
select pruebas.error($$select public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos limit 1), 'cantidad', 1)), 'efectivo')$$, 'vende sin caja abierta');
select public.registrar_acceso();
select public.abrir_turno(50000) is not null;
select pruebas.error($$select public.abrir_turno(100)$$, 'abre segunda caja');
select pruebas.error($$insert into public.ventas (turno_id, usuario_id, subtotal, iva, total) select id, auth.uid(), 1, 0, 1 from public.turnos_caja$$, 'inserta venta directo con su caja abierta');
select pruebas.error($$insert into public.movimientos_caja (turno_id, tipo, metodo, monto, concepto, usuario_id) select id, 'retiro', 'efectivo', -100, 'x', auth.uid() from public.turnos_caja$$, 'registra retiro directo');

select pruebas.cumple((
  select (public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id', id, 'cantidad', 10)), 'efectivo', 40000)
          ->> 'cambio')::int = 5000
  from public.productos where nombre = 'Paracetamol 500 mg'), 'vende 10 paracetamol, cobra $350 y da $50 de cambio');
select pruebas.cumple((select cantidad = 0 from public.lotes where numero = 'PA2611'), 'FEFO: vació primero el lote que caduca antes');
select pruebas.cumple((select cantidad = 38 from public.lotes where numero = 'PA2708'), 'FEFO: tomó el resto del siguiente lote');
select pruebas.cumple((select count(*) = 2 from public.venta_partidas), 'una partida por lote');
select pruebas.error_con($$select public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where nombre = 'Amoxicilina 500 mg'), 'cantidad', 25)), 'tarjeta', null, '', jsonb_build_object('medico', 'Dra. Ana Ruiz', 'cedula', '1234567', 'fecha', public.hoy_local()))$$, 'No hay suficientes piezas', 'vende 25 amoxicilina con receta (solo 22 vendibles)');
select pruebas.error_con($$select public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where nombre = 'Amoxicilina 500 mg'), 'cantidad', 1)), 'tarjeta')$$, 'captura médico, cédula y fecha', 'empleado vende antibiótico sin receta');
select pruebas.cumple((select cantidad = 22 from public.lotes where numero = 'AM2705'), 'la venta fallida no descontó nada');
select pruebas.error($$select public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where nombre = 'Ibuprofeno 400 mg'), 'cantidad', 1)), 'efectivo', 100)$$, 'efectivo que no alcanza');
select pruebas.cumple((select ventas = 1 and efectivo_esperado is null from public.resumen_turnos), 'corte ciego: no ve efectivo esperado con caja abierta');
select pruebas.cumple((select count(*) = 1 from public.ventas_de_hoy), 've su venta de hoy');

select pruebas.cumple((
  select (public.registrar_entrada(
    (select id from public.proveedores where nombre = 'Distribuidora Norte'), 'F-1', public.hoy_local(),
    jsonb_build_array(jsonb_build_object('producto_id', id, 'lote', 'pa2712', 'caducidad', '2027-12-31', 'cantidad', 10, 'costo', 1700))
  ) ->> 'piezas')::int = 10
  from public.productos where nombre = 'Paracetamol 500 mg'), 'recibe 10 piezas de un lote nuevo');
select pruebas.cumple((select cantidad = 10 from public.lotes where numero = 'PA2712'), 'lote nuevo con 10 piezas (número en mayúsculas)');
select pruebas.error($$select public.registrar_entrada((select id from public.proveedores where nombre = 'Distribuidora Norte'), 'F-1', public.hoy_local(), '[{"producto_id":"00000000-0000-0000-0000-000000000000","lote":"X","caducidad":"2030-01-01","cantidad":1,"costo":1}]')$$, 'factura repetida');
select pruebas.error($$select public.registrar_entrada((select id from public.proveedores limit 1), 'F-2', public.hoy_local(), jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos limit 1), 'lote', 'X', 'caducidad', '2020-01-01', 'cantidad', 1, 'costo', 1)))$$, 'recibir lote caducado');
select pruebas.cumple((select count(*) = 0 from public.bitacora), 'no ve la bitácora');

select pruebas.cumple((select (public.cerrar_turno(85000) ->> 'diferencia')::int = 0), 'corte: esperado $850, contado $850, cuadra');
select pruebas.error($$select public.cerrar_turno(1)$$, 'cerrar otra vez');
reset role;

\echo '--- Administradora (Ana)'
select pruebas.como('ana@farmacia.mx');
set role authenticated;
select pruebas.cumple((select count(*) = 16 from public.costos_productos()), 've costos con costos_productos()');
select pruebas.cumple((select count(*) = 1 from public.ventas), 've la venta de Carlos');
select pruebas.cumple((select count(*) = 3 from public.usuarios), 've las 3 cuentas');
select public.guardar_permisos_empleado(array['ventas.vender', 'inventario.ver']);
select pruebas.cumple((select count(*) = 2 from public.permisos_efectivos pe join public.usuarios u on u.id = pe.usuario_id where u.correo = 'carlos@farmacia.mx'), 'empleado queda con 2 permisos');
select pruebas.error($$select public.guardar_permisos_empleado(array['usuarios.gestionar'])$$, 'dar permiso de admin al empleado');
select pruebas.error($$update public.usuarios set rol = 'empleado' where correo = 'ana@farmacia.mx'$$, 'quitarse el único admin');
update public.productos set precio = 4000 where nombre = 'Paracetamol 500 mg';
select pruebas.cumple((select precio = 4000 from public.productos where nombre = 'Paracetamol 500 mg'), 'admin cambia precio');
select pruebas.cumple((select count(*) >= 4 from public.bitacora where accion in ('rol_permisos.delete', 'productos.update', 'sesion.iniciar')), 'bitácora registra permisos, precio y acceso');
reset role;

\echo '--- Correo sincronizado desde Supabase Auth'
update auth.users set email = 'carlos.ruiz@farmacia.mx' where email = 'carlos@farmacia.mx';
select pruebas.cumple((select count(*) = 1 from public.usuarios where correo = 'carlos.ruiz@farmacia.mx'), 'correo copiado a la cuenta');

\echo '--- Reportes'
select pruebas.como('carlos.ruiz@farmacia.mx');
set role authenticated;
select pruebas.error($$select public.reporte_ventas(public.hoy_local(), public.hoy_local())$$, 'empleado sin reportes.ver pide reporte');
select pruebas.error($$select * from public.exportar_ventas(public.hoy_local(), public.hoy_local())$$, 'empleado exporta ventas');
select pruebas.error($$select public.resumen_ventas(now() - interval '1 day', now())$$, 'llamar la función interna resumen_ventas');
reset role;
select pruebas.como('ana@farmacia.mx');
set role authenticated;
select pruebas.cumple((select (r -> 'resumen' ->> 'ventas')::int = 35000 and (r -> 'resumen' ->> 'tickets')::int = 1
                              and (r -> 'resumen' ->> 'piezas')::int = 10 from (select public.reporte_ventas(public.hoy_local(), public.hoy_local()) r) x),
                      'reporte: $350, 1 ticket, 10 piezas');
select pruebas.cumple((select (r -> 'resumen' ->> 'costo')::int = 17600 from (select public.reporte_ventas(public.hoy_local(), public.hoy_local()) r) x),
                      'reporte: costo por lote (8×$17.50 + 2×$18.00 = $176)');
select pruebas.cumple((select (r -> 'anterior' ->> 'ventas')::int = 0 from (select public.reporte_ventas(public.hoy_local(), public.hoy_local()) r) x),
                      'reporte: periodo anterior sin ventas');
select pruebas.cumple((select jsonb_array_length(r -> 'por_dia') = 7 and jsonb_array_length(r -> 'por_hora') = 24
                       from (select public.reporte_ventas(public.hoy_local() - 6, public.hoy_local()) r) x),
                      'reporte semanal: 7 días (con ceros) y 24 horas');
select pruebas.cumple((select r -> 'productos' -> 0 ->> 'producto' = 'Paracetamol 500 mg' and (r -> 'compras' ->> 'total')::int = 17000
                       from (select public.reporte_ventas(public.hoy_local(), public.hoy_local()) r) x),
                      'reporte: producto más vendido y compras del periodo ($170)');
select pruebas.cumple((select (r -> 'mermas' ->> 'costo')::int = 0 from (select public.reporte_ventas(public.hoy_local(), public.hoy_local()) r) x), 'reporte: mermas');
select pruebas.cumple((select count(*) = 1 and min(costo) = 17600 and min(cajero) = 'Carlos Ruiz' from public.exportar_ventas(public.hoy_local(), public.hoy_local())), 'exportación: una fila por ticket con costo y cajero');
select pruebas.error($$select public.reporte_ventas(public.hoy_local() - 400, public.hoy_local())$$, 'periodo de más de un año');
reset role;

\echo '--- Productos, categorías y proveedores'
-- Aquí Carlos solo tiene ventas.vender e inventario.ver (Ana se los dejó así arriba).
select pruebas.como('carlos.ruiz@farmacia.mx');
set role authenticated;
select pruebas.error($$insert into public.productos (nombre, precio) values ('Prueba', 1000)$$, 'empleado sin productos.crear da de alta un producto');
select pruebas.error($$insert into public.categorias (nombre) values ('Prueba')$$, 'empleado sin permiso crea categoría');
select pruebas.error($$insert into public.proveedores (nombre) values ('Prueba')$$, 'empleado sin permiso crea proveedor');
update public.productos set nombre = 'Cambiado' where nombre = 'Ibuprofeno 400 mg';
reset role;
select pruebas.cumple((select count(*) = 0 from public.productos where nombre = 'Cambiado'), 'empleado sin productos.editar no cambia nombres (RLS)');

select pruebas.como('ana@farmacia.mx');
set role authenticated;
select public.guardar_permisos_empleado(array['ventas.vender', 'inventario.ver', 'productos.crear', 'productos.editar']);
reset role;

select pruebas.como('carlos.ruiz@farmacia.mx');
set role authenticated;
insert into public.productos (codigo_barras, nombre, precio, costo, iva) values ('7509999000017', 'Producto de prueba', 2500, 1200, 16);
select pruebas.cumple((select count(*) = 1 from public.productos where codigo_barras = '7509999000017'), 'con productos.crear da de alta un producto');
select pruebas.error($$insert into public.productos (codigo_barras, nombre, precio) values ('7509999000017', 'Otro', 100)$$, 'código de barras repetido');
select pruebas.error($$insert into public.productos (codigo_barras, nombre, precio) values ('750 999', 'Otro', 100)$$, 'código de barras con espacios');
select pruebas.error($$insert into public.productos (nombre, precio, iva) values ('Otro', 100, 8)$$, 'IVA distinto de 0 o 16');
select pruebas.error($$insert into public.productos (nombre, precio) values ('Otro', -100)$$, 'precio negativo');
select pruebas.error($$insert into public.productos (nombre, precio, clasificacion) values ('Otro', 100, 'magia')$$, 'clasificación inexistente');
update public.productos set nombre = 'Producto de prueba editado', stock_minimo = 4 where codigo_barras = '7509999000017';
select pruebas.cumple((select nombre = 'Producto de prueba editado' and stock_minimo = 4 from public.productos where codigo_barras = '7509999000017'), 'con productos.editar cambia nombre y mínimo');
select pruebas.error($$update public.productos set precio = 1 where codigo_barras = '7509999000017'$$, 'cambiar precio sin productos.precios');
select pruebas.error($$update public.productos set costo = 1 where codigo_barras = '7509999000017'$$, 'cambiar costo sin productos.precios');
select pruebas.error($$select costo from public.productos where codigo_barras = '7509999000017'$$, 'sigue sin poder leer costos');
insert into public.categorias (nombre) values ('Vitaminas');
select pruebas.error($$insert into public.categorias (nombre) values ('Vitaminas')$$, 'categoría repetida');
insert into public.proveedores (nombre, rfc) values ('Proveedor de prueba', 'PRU010101AB1');
select pruebas.cumple((select count(*) = 1 from public.proveedores where nombre = 'Proveedor de prueba'), 'con productos.crear da de alta un proveedor');
delete from public.productos where codigo_barras = '7509999000017';
select pruebas.cumple((select count(*) = 1 from public.productos where codigo_barras = '7509999000017'), 'nadie borra productos desde la app (RLS)');
update public.productos set activo = false where codigo_barras = '7509999000017';
select pruebas.cumple((select count(*) = 0 from public.existencias e join public.productos p on p.id = e.producto_id where p.codigo_barras = '7509999000017'), 'producto inactivo sale del inventario');
reset role;

select pruebas.como('ana@farmacia.mx');
set role authenticated;
select public.abrir_turno(10000) is not null;
select pruebas.error($$select public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where codigo_barras = '7509999000017'), 'cantidad', 1)), 'tarjeta')$$, 'vender un producto inactivo');
update public.productos set precio = 2700, costo = 1300 where codigo_barras = '7509999000017';
select pruebas.cumple((select precio = 2700 from public.productos where codigo_barras = '7509999000017'), 'con productos.precios cambia precio y costo');
reset role;

select pruebas.cumple((
  select count(*) >= 2 from public.bitacora b join public.usuarios u on u.id = b.usuario_id
  where u.correo = 'carlos.ruiz@farmacia.mx' and b.accion in ('productos.insert', 'productos.update')
), 'bitácora registra alta y edición con quién lo hizo');
select pruebas.cumple((
  select (b.antes ->> 'precio')::int = 2500 and (b.despues ->> 'precio')::int = 2700
  from public.bitacora b join public.usuarios u on u.id = b.usuario_id
  where u.correo = 'ana@farmacia.mx' and b.accion = 'productos.update' and b.entidad_id = (select id::text from public.productos where codigo_barras = '7509999000017')
  order by b.id desc limit 1
), 'bitácora guarda el precio de antes y el de después');

\echo '--- Receta obligatoria'
select pruebas.cumple((select bool_and(requiere_receta) from public.productos where clasificacion <> 'libre'), 'antibióticos y controlados quedaron con receta obligatoria');
select pruebas.cumple((select not requiere_receta from public.productos where nombre = 'Paracetamol 500 mg'), 'venta libre sigue sin receta');

select pruebas.como('ana@farmacia.mx');
set role authenticated;
-- Ana tiene su caja abierta desde la sección de productos.
select pruebas.error_con($$select public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where nombre = 'Amoxicilina 500 mg'), 'cantidad', 1)), 'efectivo')$$,
  'captura médico, cédula y fecha', 'antibiótico sin receta');
select pruebas.error_con($$select public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where nombre = 'Amoxicilina 500 mg'), 'cantidad', 1)), 'efectivo', null, '', jsonb_build_object('medico', 'Dr. Luis Gómez', 'fecha', public.hoy_local()))$$,
  'captura médico, cédula y fecha', 'receta sin cédula');
select pruebas.error_con($$select public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where nombre = 'Amoxicilina 500 mg'), 'cantidad', 1)), 'efectivo', null, '', jsonb_build_object('medico', 'Dr. Luis Gómez', 'cedula', '12345678', 'fecha', public.hoy_local() + 1))$$,
  'no puede ser futura', 'receta con fecha futura');
select pruebas.error_con($$select public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where nombre = 'Amoxicilina 500 mg'), 'cantidad', 1)), 'efectivo', null, '', '"texto"'::jsonb)$$,
  'captura médico, cédula y fecha', 'receta que no es un objeto');

select pruebas.cumple((
  select (public.registrar_venta(
    jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where nombre = 'Amoxicilina 500 mg'), 'cantidad', 1)),
    'efectivo', null, '', jsonb_build_object('medico', '  Dr. Luis Gómez ', 'cedula', ' ab12345 ', 'fecha', public.hoy_local(), 'folio', 'R-100')
  ) ->> 'receta_id') is not null), 'antibiótico con receta se cobra');
select pruebas.cumple((
  select tipo = 'antibiotico' and medico = 'Dr. Luis Gómez' and cedula = 'AB12345' and folio_receta = 'R-100' and not retenida
  from public.recetas order by creado_en desc limit 1), 'receta guardada como antibiótico, limpia y con folio');
select pruebas.cumple((
  select count(*) = 1 from public.venta_partidas vp join public.recetas r on r.id = vp.receta_id where r.medico = 'Dr. Luis Gómez'),
  'la partida queda ligada a su receta');

select pruebas.error_con($$select public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where nombre = 'Clonazepam 2 mg'), 'cantidad', 1)), 'efectivo', null, '', jsonb_build_object('medico', 'Dra. Paz Ríos', 'cedula', '7654321', 'fecha', public.hoy_local()))$$,
  'retener la receta original', 'controlado sin retener la receta');
select pruebas.cumple((
  select (public.registrar_venta(
    jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where nombre = 'Clonazepam 2 mg'), 'cantidad', 1)),
    'efectivo', null, '', jsonb_build_object('medico', 'Dra. Paz Ríos', 'cedula', '7654321', 'fecha', public.hoy_local(), 'retenida', true)
  ) ->> 'receta_id') is not null), 'controlado con receta retenida se cobra');
select pruebas.cumple((select tipo = 'controlado' and retenida from public.recetas order by creado_en desc limit 1), 'receta del controlado queda como retenida');

-- La casilla "Requiere receta médica" en un producto de venta libre.
update public.productos set requiere_receta = true where nombre = 'Ibuprofeno 400 mg';
select pruebas.error_con($$select public.registrar_venta(jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where nombre = 'Ibuprofeno 400 mg'), 'cantidad', 1)), 'tarjeta')$$,
  'captura médico, cédula y fecha', 'producto con la casilla de receta, sin receta');
select pruebas.cumple((
  select (public.registrar_venta(
    jsonb_build_array(
      jsonb_build_object('producto_id', (select id from public.productos where nombre = 'Paracetamol 500 mg'), 'cantidad', 1),
      jsonb_build_object('producto_id', (select id from public.productos where nombre = 'Ibuprofeno 400 mg'), 'cantidad', 1)),
    'tarjeta', null, '', jsonb_build_object('medico', 'Dr. Luis Gómez', 'cedula', '12345678', 'fecha', public.hoy_local() - 3)
  ) ->> 'receta_id') is not null), 'carrito mixto con receta simple se cobra');
select pruebas.cumple((select tipo = 'simple' from public.recetas order by creado_en desc limit 1), 'la receta es de tipo simple');
select pruebas.cumple((
  select count(*) filter (where vp.receta_id is null) = 1 and count(*) filter (where vp.receta_id is not null) = 1
  from public.venta_partidas vp where vp.venta_id = (select id from public.ventas order by folio desc limit 1)),
  'solo el producto con receta queda ligado a ella');
select pruebas.cumple((
  select (public.registrar_venta(
    jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where nombre = 'Paracetamol 500 mg'), 'cantidad', 1)),
    'tarjeta', null, '', jsonb_build_object('medico', 'Dr. Luis Gómez', 'cedula', '12345678', 'fecha', public.hoy_local())
  ) ->> 'receta_id') is null), 'venta sin productos con receta no guarda receta');

insert into public.productos (nombre, precio, clasificacion, requiere_receta) values ('Cefalexina de prueba', 9000, 'antibiotico', false);
select pruebas.cumple((select requiere_receta from public.productos where nombre = 'Cefalexina de prueba'), 'un antibiótico siempre requiere receta aunque se mande falso');
update public.productos set requiere_receta = false where nombre = 'Cefalexina de prueba';
select pruebas.cumple((select requiere_receta from public.productos where nombre = 'Cefalexina de prueba'), 'y no se le puede quitar');
select public.guardar_permisos_empleado(array['ventas.vender', 'inventario.ver', 'productos.precios']);
reset role;

select pruebas.como('carlos.ruiz@farmacia.mx');
set role authenticated;
select pruebas.error_con($$update public.productos set requiere_receta = false where nombre = 'Ibuprofeno 400 mg'$$,
  'No tienes permiso para editar productos', 'quitar la receta con permiso de precios pero no de edición');
select pruebas.cumple((select count(*) = 1 from public.productos where nombre = 'Ibuprofeno 400 mg' and requiere_receta), 'el empleado ve la casilla de receta');
reset role;
