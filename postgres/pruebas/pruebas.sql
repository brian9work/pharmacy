-- Pruebas de postgres/larafarma.sql: sesiones propias, contraseñas, reglas
-- RLS, venta con receta, caja, reportes y privilegios de la aplicación.
-- Se corren con scripts/probar-postgres.sh sobre un PostgreSQL temporal.
\set QUIET 1
\pset tuples_only on
\pset format unaligned
set client_min_messages = notice;

create schema pruebas;
grant usage on schema pruebas to larafarma_app;

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

-- Inicia sesión y deja el token puesto, como hace la aplicación en cada petición.
create function pruebas.entrar(correo text, contrasena text) returns jsonb language plpgsql as $$
declare
  r jsonb := public.iniciar_sesion(correo, contrasena);
begin
  perform set_config('larafarma.token', coalesce(r ->> 'token', ''), false);
  return r;
end;
$$;

grant execute on all functions in schema pruebas to larafarma_app;

-- Datos de partida, como dueño de la base.
do $$ begin perform public.crear_primer_admin('Ana López', 'Ana@Farmacia.mx', 'temporal-ana-1'); end $$;
insert into categorias (nombre) values ('Antibióticos');
insert into proveedores (nombre) values ('Proveedor Uno');
insert into productos (codigo_barras, nombre, precio, costo) values ('7500000000011', 'Paracetamol', 3500, 2000);
insert into productos (codigo_barras, nombre, precio, costo, clasificacion) values ('7500000000028', 'Amoxicilina', 12000, 7000, 'antibiotico');
insert into productos (codigo_barras, nombre, precio, costo, clasificacion) values ('7500000000035', 'Clonazepam', 21000, 9000, 'controlado');
create role web login in role larafarma_app;

set role web;

\echo '--- Sin sesión'
select pruebas.cumple(public.usuario_actual() is null, 'sin token no hay usuario');
select pruebas.cumple((select count(*) from productos) = 0, 'sin sesión no se ven productos');
select pruebas.cumple((select count(*) from negocio) = 0, 'sin sesión no se ve el negocio');
select pruebas.error_con($$select * from sesiones$$, 'permission denied', 'leer sesiones');
select pruebas.error_con($$select hash_contrasena from usuarios$$, 'permission denied', 'leer hashes de contraseña');
select pruebas.error_con($$select crear_primer_admin('X', 'x@x.mx', 'temporal-xxx')$$, 'permission denied', 'crear otro primer admin');
select pruebas.error_con($$select abrir_turno(100)$$, 'No tienes permiso', 'abrir caja sin sesión');
select pruebas.error_con($$select set_config('larafarma.token', 'inventado', false); select abrir_turno(100)$$, 'No tienes permiso', 'token inventado');

\echo '--- Acceso'
select pruebas.cumple((pruebas.entrar('ana@farmacia.mx', 'mala')) ->> 'error' = 'Correo o contraseña incorrectos', 'contraseña equivocada');
select pruebas.cumple((pruebas.entrar('nadie@farmacia.mx', 'temporal-ana-1')) ->> 'error' = 'Correo o contraseña incorrectos', 'correo inexistente, mismo mensaje');
select pruebas.cumple((pruebas.entrar(' ANA@farmacia.mx ', 'temporal-ana-1')) ->> 'ok' = 'true', 'correo sin importar mayúsculas ni espacios');
select pruebas.cumple((select debe_cambiar_contrasena from usuarios where id = usuario_actual()), 'primera entrada pide cambiar contraseña');
select pruebas.error_con($$select cambiar_contrasena('equivocada', 'nueva-ana-segura')$$, 'actual no es correcta', 'cambiar con la actual equivocada');
select pruebas.error_con($$select cambiar_contrasena('temporal-ana-1', 'corta')$$, 'al menos 8', 'contraseña nueva corta');
do $$ begin perform cambiar_contrasena('temporal-ana-1', 'nueva-ana-segura'); end $$;
select pruebas.cumple(not (select debe_cambiar_contrasena from usuarios where id = usuario_actual()), 'contraseña cambiada');
select pruebas.cumple(public.tiene_permiso('usuarios.gestionar'), 'admin tiene todo');

\echo '--- Alta de usuarios'
do $$ begin perform crear_usuario('Carlos Ruiz', 'carlos@farmacia.mx', 'temporal-carlos', 'empleado'); end $$;
select pruebas.error_con($$select crear_usuario('Otro', 'CARLOS@farmacia.mx', 'temporal-otro', 'empleado')$$, 'Ya existe', 'correo repetido');
select pruebas.error_con($$select crear_usuario('Otro', 'otro@farmacia.mx', 'temporal-otro', 'jefe')$$, 'rol no existe', 'rol inexistente');
select pruebas.cumple(not exists (select 1 from bitacora where antes ? 'hash_contrasena' or despues ? 'hash_contrasena'), 'la bitácora no guarda hashes');

\echo '--- Venta con receta'
select pruebas.cumple((registrar_entrada((select id from proveedores), 'F-1', hoy_local(), jsonb_build_array(
  jsonb_build_object('producto_id', (select id from productos where nombre = 'Paracetamol'), 'lote', 'p1', 'caducidad', '2030-01-01', 'cantidad', 10, 'costo', 2000),
  jsonb_build_object('producto_id', (select id from productos where nombre = 'Amoxicilina'), 'lote', 'a1', 'caducidad', '2030-01-01', 'cantidad', 5, 'costo', 7000),
  jsonb_build_object('producto_id', (select id from productos where nombre = 'Clonazepam'), 'lote', 'c1', 'caducidad', '2030-01-01', 'cantidad', 5, 'costo', 9000))) ->> 'piezas')::int = 20, 'entrada de mercancía');
do $$ begin perform abrir_turno(50000); end $$;
select pruebas.error_con(format($$select registrar_venta('[{"producto_id": "%s", "cantidad": 1}]', 'efectivo')$$,
  (select id from productos where nombre = 'Amoxicilina')), 'captura médico', 'antibiótico sin receta');
select pruebas.error_con(format($$select registrar_venta('[{"producto_id": "%s", "cantidad": 1}]', 'efectivo', null, '', '{"medico": "Dr. X", "cedula": "1", "fecha": "2026-01-01"}')$$,
  (select id from productos where nombre = 'Clonazepam')), 'retener', 'controlado sin retener');
select pruebas.cumple((registrar_venta(
  jsonb_build_array(
    jsonb_build_object('producto_id', (select id from productos where nombre = 'Paracetamol'), 'cantidad', 2),
    jsonb_build_object('producto_id', (select id from productos where nombre = 'Amoxicilina'), 'cantidad', 1)),
  'efectivo', 20000, '', '{"medico": "Dra. Ruiz", "cedula": "ab123", "fecha": "2026-01-01"}') ->> 'cambio')::int = 1000, 'venta con receta y cambio');
select pruebas.cumple((select cedula from recetas) = 'AB123', 'receta guardada con cédula en mayúsculas');
select pruebas.error_con($$insert into ventas (turno_id, usuario_id, subtotal, iva, total) select id, usuario_id, 1, 0, 1 from turnos_caja$$, 'row-level security', 'insertar venta directo');
select pruebas.cumple((reporte_ventas(hoy_local(), hoy_local()) -> 'resumen' ->> 'ventas')::int = 19000, 'reporte del día');
select pruebas.cumple((select count(*) from exportar_ventas(hoy_local(), hoy_local())) = 1, 'exportación CSV');
select pruebas.cumple((cerrar_turno(69000) ->> 'diferencia')::int = 0, 'corte que cuadra');

\echo '--- Empleado'
do $$ begin perform pruebas.entrar('carlos@farmacia.mx', 'temporal-carlos'); end $$;
select pruebas.cumple(public.tiene_permiso('ventas.vender') and not public.tiene_permiso('reportes.ver'), 'empleado con sus permisos');
select pruebas.cumple((select count(*) from usuarios) = 1, 'empleado solo ve su cuenta');
select pruebas.cumple((select count(*) from bitacora) = 0, 'empleado no ve la bitácora');
select pruebas.error_con($$select * from costos_productos()$$, 'No tienes permiso', 'empleado lee costos');
select pruebas.error_con($$select costo from productos$$, 'permission denied', 'empleado lee la columna costo');
select pruebas.error_con($$select reporte_ventas(hoy_local(), hoy_local())$$, 'No tienes permiso', 'empleado ve reportes');
select pruebas.error_con($$select crear_usuario('Yo', 'yo@farmacia.mx', 'temporal-yo-1', 'admin')$$, 'No tienes permiso', 'empleado crea un admin');
with x as (update usuarios set rol = 'admin' returning 1)
select pruebas.cumple((select count(*) from x) = 0, 'empleado no se hace admin');

\echo '--- Subir datos a la nube (lo que arma el servidor local)'
select pruebas.error_con($$select iniciar_sincronizacion()$$, 'No tienes permiso', 'empleado inicia una subida');
select pruebas.error_con($$select datos_para_subir('epoch')$$, 'No tienes permiso', 'empleado pide los datos para subir');
do $$ begin perform pruebas.entrar('ana@farmacia.mx', 'nueva-ana-segura'); end $$;
select pruebas.cumple((iniciar_sincronizacion() ->> 'desde')::timestamptz = 'epoch', 'la primera subida empieza desde el principio');
select pruebas.error_con($$select iniciar_sincronizacion()$$, 'subida en curso', 'dos subidas a la vez');
select pruebas.cumple(jsonb_array_length(datos_para_subir('epoch') -> 'ventas') = 1, 'trae la venta');
select pruebas.cumple(jsonb_array_length(datos_para_subir('epoch') -> 'recetas') = 1 and jsonb_array_length(datos_para_subir('epoch') -> 'venta_partidas') = 2, 'con su receta y sus partidas');
select pruebas.cumple((select bool_and(p ? 'costo') from jsonb_array_elements(datos_para_subir('epoch') -> 'productos') p), 'los productos van con su costo');
select pruebas.cumple(not (datos_para_subir('epoch') -> 'usuarios' -> 0 ? 'hash_contrasena'), 'de las cuentas solo van id y correo');
select pruebas.cumple(jsonb_array_length(datos_para_subir('epoch') -> 'turnos') = 1 and (datos_para_subir('epoch') -> 'turnos' -> 0 ->> 'caja') = 'Caja 1', 'el turno va con el nombre de su caja');
select pruebas.cumple(jsonb_array_length(datos_para_subir('epoch') -> 'movimientos_inventario') >= 3, 'con los movimientos de inventario');
select pruebas.cumple(jsonb_array_length(datos_para_subir(now() + interval '1 hour') -> 'ventas') = 0
  and jsonb_array_length(datos_para_subir(now() + interval '1 hour') -> 'productos') = 3, 'ya subido: no hay ventas nuevas, pero el catálogo va completo');
do $$ begin perform terminar_sincronizacion((select max(id) from public.sincronizaciones), true, '{"ventas_nuevas": 1, "completa": false}', null); end $$;
select iniciar_sincronizacion() is not null as listo \gset
select pruebas.cumple((select desde = 'epoch' from public.sincronizaciones order by id desc limit 1), 'una subida que dejó algo pendiente no mueve el punto de partida');
do $$ begin perform terminar_sincronizacion((select max(id) from public.sincronizaciones), true, '{"ventas_nuevas": 1, "completa": true}', null); end $$;
select pruebas.cumple((select ok from public.sincronizaciones order by id desc limit 1), 'la subida queda registrada como buena');
select pruebas.cumple((iniciar_sincronizacion() ->> 'desde')::timestamptz > now() - interval '15 minutes', 'la siguiente empieza donde terminó la anterior (con colchón)');
do $$ begin perform terminar_sincronizacion((select max(id) from public.sincronizaciones), false, null, 'sin internet'); end $$;
select iniciar_sincronizacion() is not null as listo \gset
select pruebas.cumple((select desde from public.sincronizaciones order by id desc limit 1) = (select desde from public.sincronizaciones order by id desc offset 1 limit 1),
  'una subida fallida no mueve el punto de partida');
select pruebas.error_con($$insert into public.sincronizaciones (desde) values (now())$$, 'permission denied', 'la app no escribe en sincronizaciones directo');
select pruebas.cumple((select count(*) from public.sincronizaciones) = 4, 'el administrador ve el historial de subidas');
do $$ begin perform pruebas.entrar('carlos@farmacia.mx', 'temporal-carlos'); end $$;
select pruebas.cumple((select count(*) from public.sincronizaciones) = 0, 'el empleado no ve el historial de subidas');

\echo '--- Bloqueo'
do $$ begin perform pruebas.entrar('ana@farmacia.mx', 'nueva-ana-segura'); end $$;
with x as (update usuarios set activo = false where correo = 'carlos@farmacia.mx' returning 1)
select pruebas.cumple((select count(*) from x) = 1, 'admin bloquea la cuenta');
select pruebas.cumple((pruebas.entrar('carlos@farmacia.mx', 'temporal-carlos')) ->> 'error' = 'Tu cuenta no está activa', 'cuenta bloqueada no entra');
select pruebas.cumple(public.usuario_actual() is null, 'sin sesión tras el bloqueo');
do $$ begin perform pruebas.entrar('ana@farmacia.mx', 'nueva-ana-segura'); end $$;
select pruebas.error_con($$update usuarios set activo = false where id = usuario_actual()$$, 'al menos un administrador', 'bloquear al último admin');

\echo '--- Cerrar sesión e intentos'
do $$ begin perform cerrar_sesion(); end $$;
select pruebas.cumple(public.usuario_actual() is null, 'cerrar sesión invalida el token');
do $$ begin perform pruebas.entrar('ana@farmacia.mx', 'mala') from generate_series(1, 5); end $$;
select pruebas.cumple((pruebas.entrar('ana@farmacia.mx', 'nueva-ana-segura')) ->> 'error' like 'Demasiados intentos%', 'espera tras 5 intentos fallidos');
