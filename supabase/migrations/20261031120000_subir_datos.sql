-- Recibir los datos que sube el servidor local de la farmacia ("Subir datos").
-- Cárgalo en Supabase → SQL Editor después de las migraciones anteriores.
--
-- La farmacia vende en su servidor local (PostgreSQL). Aquí, en la nube, el
-- administrador solo consulta ventas, reportes e inventario. El servidor
-- local manda sus datos con estas funciones, usando la clave de servicio:
--
--   mapa_usuarios(p)     correo → id de la cuenta en la nube
--   subir_catalogo(p)    categorías, proveedores, productos y lotes
--   subir_operacion(p)   entradas, turnos de caja, ventas y sus detalles
--
-- Reglas:
--   · Se puede subir las veces que sea: lo que ya está no se duplica.
--   · Catálogo y existencias: manda lo local (el catálogo se empareja por
--     código de barras, nombre o lote; no por id).
--   · Ventas y entradas: solo se agregan. Conservan su folio y su fecha.
--   · Solo la clave de servicio puede ejecutarlas; nadie con sesión normal.

-- 1. Importar sin pasar por las reglas de "venta en vivo" ----------------------
--
-- Una venta histórica no puede cumplir "turno abierto ahora" ni mover el
-- saldo del lote otra vez (el lote ya llega con su existencia actual). Las
-- funciones de este archivo activan `farmacia.importando` solo dentro de su
-- propia transacción; quien no pasa por ellas conserva todas las reglas.

create or replace function public.revisar_turno_venta() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('farmacia.importando', true), '') = 'si' then
    return new;
  end if;
  if not exists (
    select 1 from public.turnos_caja
    where id = new.turno_id and usuario_id = new.usuario_id and cerrado_en is null
  ) then
    raise exception 'La venta necesita un turno de caja abierto de la misma persona';
  end if;
  return new;
end;
$$;

create or replace function public.revisar_turno_abierto() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('farmacia.importando', true), '') = 'si' then
    return new;
  end if;
  if not exists (select 1 from public.turnos_caja where id = new.turno_id and cerrado_en is null) then
    raise exception 'El turno de caja está cerrado';
  end if;
  return new;
end;
$$;

create or replace function public.aplicar_movimiento() returns trigger
language plpgsql set search_path = '' as $$
declare
  lote public.lotes;
begin
  -- Al importar, el lote ya trae su existencia: el movimiento es solo historia.
  if coalesce(current_setting('farmacia.importando', true), '') = 'si' then
    return new;
  end if;

  select * into lote from public.lotes where id = new.lote_id for update;

  if new.tipo = 'venta' then
    if lote.estado = 'cuarentena' then
      raise exception 'El lote % está bloqueado: no se puede vender', lote.numero;
    end if;
    if lote.caducidad < public.hoy_local() then
      raise exception 'El lote % caducó el %: no se puede vender', lote.numero, lote.caducidad;
    end if;
  end if;

  if lote.cantidad + new.cantidad < 0 then
    raise exception 'No hay suficientes piezas en el lote % (hay %, se piden %)', lote.numero, lote.cantidad, -new.cantidad
      using errcode = 'check_violation';
  end if;

  perform set_config('farmacia.moviendo_inventario', 'si', true);
  update public.lotes set cantidad = cantidad + new.cantidad where id = new.lote_id;
  perform set_config('farmacia.moviendo_inventario', '', true);
  return new;
end;
$$;

-- Movimientos sueltos (sin venta ni entrada: inventario inicial, ajustes,
-- retiros) no tienen un registro "padre" que avise si ya se subieron.
-- Aquí se anota el id que tenían en el servidor local para no repetirlos.
create table public.importados (
  tabla      text not null,
  origen_id  bigint not null,
  primary key (tabla, origen_id)
);

alter table public.importados enable row level security;
revoke all on public.importados from anon, authenticated;

-- 2. Cuentas ------------------------------------------------------------------

-- p: ["correo1", "correo2", ...]  →  {"correo1": "uuid", ...} (solo los que existen)
create function public.mapa_usuarios(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(u.correo, u.id), '{}'::jsonb)
  from public.usuarios u
  where u.correo in (select lower(btrim(x)) from jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) as x);
$$;

-- 3. Catálogo y existencias ---------------------------------------------------

-- p: {"categorias": [...], "proveedores": [...], "productos": [...], "lotes": [...]}
-- Cada lista es opcional. Las referencias (categoria_id, producto_id) ya vienen
-- con los ids de la nube: se suben en orden y cada respuesta trae el mapa
-- "id local → id en la nube" de lo que se procesó.
create function public.subir_catalogo(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r             record;
  v_id          uuid;
  v_int         integer;
  m_cat         jsonb := '{}';
  m_prov        jsonb := '{}';
  m_prod        jsonb := '{}';
  m_lote        jsonb := '{}';
  n_cat         integer := 0;
  n_prov        integer := 0;
  n_prod_nuevos integer := 0;
  n_prod_cambios integer := 0;
  n_lote_nuevos integer := 0;
  n_lote_cambios integer := 0;
begin
  -- Los lotes llegan con su existencia actual; no es un movimiento.
  perform set_config('farmacia.moviendo_inventario', 'si', true);

  for r in select * from jsonb_to_recordset(coalesce(p -> 'categorias', '[]')) as x(id integer, nombre text) loop
    v_int := null;
    select c.id into v_int from public.categorias c where c.nombre = r.nombre;
    if v_int is null then
      insert into public.categorias (nombre) values (r.nombre) returning id into v_int;
      n_cat := n_cat + 1;
    end if;
    m_cat := m_cat || jsonb_build_object(r.id::text, v_int);
  end loop;

  for r in
    select * from jsonb_to_recordset(coalesce(p -> 'proveedores', '[]'))
      as x(id uuid, nombre text, rfc text, telefono text, correo text, activo boolean)
  loop
    v_id := null;
    select pr.id into v_id from public.proveedores pr where pr.nombre = r.nombre;
    if v_id is null then
      insert into public.proveedores (id, nombre, rfc, telefono, correo, activo)
      values (r.id, r.nombre, coalesce(r.rfc, ''), coalesce(r.telefono, ''), coalesce(r.correo, ''), coalesce(r.activo, true))
      on conflict (id) do update set nombre = excluded.nombre, rfc = excluded.rfc, telefono = excluded.telefono,
        correo = excluded.correo, activo = excluded.activo
      returning id into v_id;
      n_prov := n_prov + 1;
    else
      update public.proveedores
      set rfc = coalesce(r.rfc, ''), telefono = coalesce(r.telefono, ''), correo = coalesce(r.correo, ''), activo = coalesce(r.activo, true)
      where id = v_id
        and (rfc, telefono, correo, activo) is distinct from (coalesce(r.rfc, ''), coalesce(r.telefono, ''), coalesce(r.correo, ''), coalesce(r.activo, true));
    end if;
    m_prov := m_prov || jsonb_build_object(r.id::text, v_id);
  end loop;

  for r in
    select * from jsonb_to_recordset(coalesce(p -> 'productos', '[]'))
      as x(id uuid, codigo_barras text, nombre text, sustancia text, presentacion text, laboratorio text,
           categoria_id integer, clasificacion text, requiere_receta boolean, precio integer, costo integer,
           iva smallint, stock_minimo integer, ubicacion text, refrigerado boolean, activo boolean)
  loop
    v_id := null;
    -- El mismo producto en local y en la nube se reconoce por su código de barras.
    if r.codigo_barras is not null then
      select pd.id into v_id from public.productos pd where pd.codigo_barras = r.codigo_barras;
    end if;
    if v_id is null then
      select pd.id into v_id from public.productos pd where pd.id = r.id;
    end if;

    if v_id is null then
      insert into public.productos (id, codigo_barras, nombre, sustancia, presentacion, laboratorio, categoria_id, clasificacion,
                                    requiere_receta, precio, costo, iva, stock_minimo, ubicacion, refrigerado, activo)
      values (r.id, r.codigo_barras, r.nombre, coalesce(r.sustancia, ''), coalesce(r.presentacion, ''), coalesce(r.laboratorio, ''),
              r.categoria_id, r.clasificacion, coalesce(r.requiere_receta, false), r.precio, coalesce(r.costo, 0), r.iva,
              coalesce(r.stock_minimo, 0), coalesce(r.ubicacion, ''), coalesce(r.refrigerado, false), coalesce(r.activo, true));
      v_id := r.id;
      n_prod_nuevos := n_prod_nuevos + 1;
    else
      update public.productos
      set codigo_barras = r.codigo_barras, nombre = r.nombre, sustancia = coalesce(r.sustancia, ''),
          presentacion = coalesce(r.presentacion, ''), laboratorio = coalesce(r.laboratorio, ''), categoria_id = r.categoria_id,
          clasificacion = r.clasificacion, requiere_receta = coalesce(r.requiere_receta, false), precio = r.precio,
          costo = coalesce(r.costo, 0), iva = r.iva, stock_minimo = coalesce(r.stock_minimo, 0), ubicacion = coalesce(r.ubicacion, ''),
          refrigerado = coalesce(r.refrigerado, false), activo = coalesce(r.activo, true)
      where id = v_id
        and (codigo_barras, nombre, sustancia, presentacion, laboratorio, categoria_id, clasificacion, requiere_receta, precio, costo,
             iva, stock_minimo, ubicacion, refrigerado, activo)
            is distinct from
            (r.codigo_barras, r.nombre, coalesce(r.sustancia, ''), coalesce(r.presentacion, ''), coalesce(r.laboratorio, ''), r.categoria_id,
             r.clasificacion, coalesce(r.requiere_receta, false), r.precio, coalesce(r.costo, 0), r.iva, coalesce(r.stock_minimo, 0),
             coalesce(r.ubicacion, ''), coalesce(r.refrigerado, false), coalesce(r.activo, true));
      if found then
        n_prod_cambios := n_prod_cambios + 1;
      end if;
    end if;
    m_prod := m_prod || jsonb_build_object(r.id::text, v_id);
  end loop;

  for r in
    select * from jsonb_to_recordset(coalesce(p -> 'lotes', '[]'))
      as x(id uuid, producto_id uuid, numero text, caducidad date, cantidad integer, costo integer, estado text,
           motivo_cuarentena text, creado_en timestamptz)
  loop
    v_id := null;
    select l.id into v_id from public.lotes l
    where l.producto_id = r.producto_id and l.numero = r.numero and l.caducidad = r.caducidad;

    if v_id is null then
      insert into public.lotes (id, producto_id, numero, caducidad, cantidad, costo, estado, motivo_cuarentena, creado_en)
      values (r.id, r.producto_id, r.numero, r.caducidad, r.cantidad, coalesce(r.costo, 0), r.estado, r.motivo_cuarentena,
              coalesce(r.creado_en, now()));
      v_id := r.id;
      n_lote_nuevos := n_lote_nuevos + 1;
    else
      -- La existencia buena es la del servidor local: ahí se vende.
      update public.lotes
      set cantidad = r.cantidad, costo = coalesce(r.costo, 0), estado = r.estado, motivo_cuarentena = r.motivo_cuarentena
      where id = v_id
        and (cantidad, costo, estado, motivo_cuarentena)
            is distinct from (r.cantidad, coalesce(r.costo, 0), r.estado, r.motivo_cuarentena);
      if found then
        n_lote_cambios := n_lote_cambios + 1;
      end if;
    end if;
    m_lote := m_lote || jsonb_build_object(r.id::text, v_id);
  end loop;

  return jsonb_build_object(
    'categorias', m_cat,
    'proveedores', m_prov,
    'productos', m_prod,
    'lotes', m_lote,
    'conteo', jsonb_build_object(
      'categorias_nuevas', n_cat,
      'proveedores_nuevos', n_prov,
      'productos_nuevos', n_prod_nuevos,
      'productos_actualizados', n_prod_cambios,
      'lotes_nuevos', n_lote_nuevos,
      'lotes_actualizados', n_lote_cambios
    )
  );
end;
$$;

-- 4. Operación: entradas, turnos de caja y ventas ------------------------------

-- p: {"recepciones", "recepcion_partidas", "turnos", "ventas", "recetas", "venta_partidas",
--     "venta_pagos", "movimientos_caja", "movimientos_inventario"}  (todas opcionales)
-- Ya con los ids de la nube en usuarios, proveedores, productos y lotes.
-- Una venta o entrada que ya está no se toca ni repite sus detalles.
create function public.subir_operacion(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r              record;
  v_caja         smallint;
  v_recs         uuid[] := '{}';
  v_ventas       uuid[] := '{}';
  v_turno        public.turnos_caja;
  n_rec          integer := 0;
  n_rec_ya       integer := 0;
  n_rec_conf     integer := 0;
  n_turnos       integer := 0;
  n_turnos_cerr  integer := 0;
  n_turnos_conf  integer := 0;
  n_ventas       integer := 0;
  n_ventas_ya    integer := 0;
  n_sin_turno    integer := 0;
  n_folio_conf   integer := 0;
  n_sueltos      integer := 0;
  v_max_folio    bigint;
begin
  -- Ver el comentario del inicio del archivo.
  perform set_config('farmacia.importando', 'si', true);
  perform set_config('farmacia.moviendo_inventario', 'si', true);

  -- Entradas de mercancía
  for r in
    select * from jsonb_to_recordset(coalesce(p -> 'recepciones', '[]'))
      as x(id uuid, proveedor_id uuid, factura text, fecha date, usuario_id uuid, total integer, notas text, creado_en timestamptz)
  loop
    if exists (select 1 from public.recepciones where id = r.id) then
      n_rec_ya := n_rec_ya + 1;
    elsif exists (select 1 from public.recepciones where proveedor_id = r.proveedor_id and factura = r.factura) then
      n_rec_conf := n_rec_conf + 1;
    else
      insert into public.recepciones (id, proveedor_id, factura, fecha, usuario_id, total, notas, creado_en)
      values (r.id, r.proveedor_id, r.factura, r.fecha, r.usuario_id, coalesce(r.total, 0), coalesce(r.notas, ''), coalesce(r.creado_en, now()));
      v_recs := v_recs || r.id;
      n_rec := n_rec + 1;
    end if;
  end loop;

  insert into public.recepcion_partidas (recepcion_id, lote_id, cantidad, costo)
  select x.recepcion_id, x.lote_id, x.cantidad, x.costo
  from jsonb_to_recordset(coalesce(p -> 'recepcion_partidas', '[]')) as x(recepcion_id uuid, lote_id uuid, cantidad integer, costo integer)
  where x.recepcion_id = any (v_recs);

  insert into public.movimientos_inventario (lote_id, producto_id, tipo, cantidad, usuario_id, referencia, motivo, recepcion_id, venta_id, creado_en)
  select x.lote_id, x.producto_id, x.tipo, x.cantidad, x.usuario_id, coalesce(x.referencia, ''), x.motivo, x.recepcion_id, x.venta_id,
         coalesce(x.creado_en, now())
  from jsonb_to_recordset(coalesce(p -> 'movimientos_inventario', '[]'))
    as x(lote_id uuid, producto_id uuid, tipo text, cantidad integer, usuario_id uuid, referencia text, motivo text,
         recepcion_id uuid, venta_id uuid, creado_en timestamptz)
  where x.recepcion_id = any (v_recs);

  -- Turnos de caja: se agregan y, si ya estaban abiertos y ahora están cerrados, se cierran.
  for r in
    select * from jsonb_to_recordset(coalesce(p -> 'turnos', '[]'))
      as x(id uuid, caja text, usuario_id uuid, abierto_en timestamptz, fondo_inicial integer, cerrado_en timestamptz,
           efectivo_esperado integer, efectivo_contado integer, conteo jsonb)
  loop
    select * into v_turno from public.turnos_caja where id = r.id;
    if found then
      if v_turno.cerrado_en is null and r.cerrado_en is not null then
        update public.turnos_caja
        set cerrado_en = r.cerrado_en, efectivo_esperado = r.efectivo_esperado, efectivo_contado = r.efectivo_contado, conteo = r.conteo
        where id = r.id;
        n_turnos_cerr := n_turnos_cerr + 1;
      end if;
    else
      select c.id into v_caja from public.cajas c where c.nombre = r.caja;
      if v_caja is null then
        insert into public.cajas (nombre) values (r.caja) returning id into v_caja;
      end if;
      begin
        insert into public.turnos_caja (id, caja_id, usuario_id, abierto_en, fondo_inicial, cerrado_en, efectivo_esperado, efectivo_contado, conteo)
        values (r.id, v_caja, r.usuario_id, r.abierto_en, r.fondo_inicial, r.cerrado_en, r.efectivo_esperado, r.efectivo_contado, r.conteo);
        n_turnos := n_turnos + 1;
      exception when unique_violation then
        -- La nube ya tiene un turno abierto en esa caja o de esa persona.
        n_turnos_conf := n_turnos_conf + 1;
      end;
    end if;
  end loop;

  -- Ventas
  for r in
    select * from jsonb_to_recordset(coalesce(p -> 'ventas', '[]'))
      as x(id uuid, folio bigint, turno_id uuid, usuario_id uuid, creado_en timestamptz, subtotal integer, iva integer, total integer,
           estado text, cancelada_en timestamptz, cancelada_por uuid, motivo_cancelacion text)
  loop
    if exists (select 1 from public.ventas where id = r.id) then
      n_ventas_ya := n_ventas_ya + 1;
    elsif not exists (select 1 from public.turnos_caja where id = r.turno_id) then
      n_sin_turno := n_sin_turno + 1;
    elsif exists (select 1 from public.ventas where folio = r.folio) then
      n_folio_conf := n_folio_conf + 1;
    else
      insert into public.ventas (id, folio, turno_id, usuario_id, creado_en, subtotal, iva, total, estado, cancelada_en, cancelada_por, motivo_cancelacion)
      overriding system value
      values (r.id, r.folio, r.turno_id, r.usuario_id, r.creado_en, r.subtotal, r.iva, r.total, r.estado, r.cancelada_en, r.cancelada_por, r.motivo_cancelacion);
      v_ventas := v_ventas || r.id;
      n_ventas := n_ventas + 1;
    end if;
  end loop;

  insert into public.recetas (id, venta_id, tipo, medico, cedula, fecha_receta, folio_receta, retenida, registrada_por, creado_en)
  select x.id, x.venta_id, x.tipo, x.medico, x.cedula, x.fecha_receta, coalesce(x.folio_receta, ''), coalesce(x.retenida, false),
         x.registrada_por, coalesce(x.creado_en, now())
  from jsonb_to_recordset(coalesce(p -> 'recetas', '[]'))
    as x(id uuid, venta_id uuid, tipo text, medico text, cedula text, fecha_receta date, folio_receta text, retenida boolean,
         registrada_por uuid, creado_en timestamptz)
  where x.venta_id = any (v_ventas);

  insert into public.venta_partidas (venta_id, producto_id, lote_id, cantidad, precio, iva, descuento, importe, receta_id)
  select x.venta_id, x.producto_id, x.lote_id, x.cantidad, x.precio, x.iva, coalesce(x.descuento, 0), x.importe, x.receta_id
  from jsonb_to_recordset(coalesce(p -> 'venta_partidas', '[]'))
    as x(venta_id uuid, producto_id uuid, lote_id uuid, cantidad integer, precio integer, iva smallint, descuento integer, importe integer, receta_id uuid)
  where x.venta_id = any (v_ventas);

  insert into public.venta_pagos (venta_id, metodo, monto, recibido, referencia)
  select x.venta_id, x.metodo, x.monto, x.recibido, coalesce(x.referencia, '')
  from jsonb_to_recordset(coalesce(p -> 'venta_pagos', '[]')) as x(venta_id uuid, metodo text, monto integer, recibido integer, referencia text)
  where x.venta_id = any (v_ventas);

  insert into public.movimientos_caja (turno_id, tipo, metodo, monto, concepto, venta_id, usuario_id, autorizado_por, creado_en)
  select x.turno_id, x.tipo, x.metodo, x.monto, x.concepto, x.venta_id, x.usuario_id, x.autorizado_por, coalesce(x.creado_en, now())
  from jsonb_to_recordset(coalesce(p -> 'movimientos_caja', '[]'))
    as x(turno_id uuid, tipo text, metodo text, monto integer, concepto text, venta_id uuid, usuario_id uuid, autorizado_por uuid, creado_en timestamptz)
  where x.venta_id = any (v_ventas);

  insert into public.movimientos_inventario (lote_id, producto_id, tipo, cantidad, usuario_id, referencia, motivo, recepcion_id, venta_id, creado_en)
  select x.lote_id, x.producto_id, x.tipo, x.cantidad, x.usuario_id, coalesce(x.referencia, ''), x.motivo, x.recepcion_id, x.venta_id,
         coalesce(x.creado_en, now())
  from jsonb_to_recordset(coalesce(p -> 'movimientos_inventario', '[]'))
    as x(lote_id uuid, producto_id uuid, tipo text, cantidad integer, usuario_id uuid, referencia text, motivo text,
         recepcion_id uuid, venta_id uuid, creado_en timestamptz)
  where x.venta_id = any (v_ventas);

  -- Movimientos sueltos de inventario (inventario inicial, ajustes, mermas)
  for r in
    select * from jsonb_to_recordset(coalesce(p -> 'movimientos_inventario', '[]'))
      as x(origen_id bigint, lote_id uuid, producto_id uuid, tipo text, cantidad integer, usuario_id uuid, referencia text, motivo text,
           recepcion_id uuid, venta_id uuid, creado_en timestamptz)
    where x.recepcion_id is null and x.venta_id is null
  loop
    insert into public.importados (tabla, origen_id) values ('movimientos_inventario', r.origen_id) on conflict do nothing;
    if found then
      insert into public.movimientos_inventario (lote_id, producto_id, tipo, cantidad, usuario_id, referencia, motivo, creado_en)
      values (r.lote_id, r.producto_id, r.tipo, r.cantidad, r.usuario_id, coalesce(r.referencia, ''), r.motivo, coalesce(r.creado_en, now()));
      n_sueltos := n_sueltos + 1;
    end if;
  end loop;

  -- Movimientos sueltos de caja (retiros, entradas de efectivo)
  for r in
    select * from jsonb_to_recordset(coalesce(p -> 'movimientos_caja', '[]'))
      as x(origen_id bigint, turno_id uuid, tipo text, metodo text, monto integer, concepto text, venta_id uuid, usuario_id uuid,
           autorizado_por uuid, creado_en timestamptz)
    where x.venta_id is null
  loop
    insert into public.importados (tabla, origen_id) values ('movimientos_caja', r.origen_id) on conflict do nothing;
    if found then
      insert into public.movimientos_caja (turno_id, tipo, metodo, monto, concepto, usuario_id, autorizado_por, creado_en)
      values (r.turno_id, r.tipo, r.metodo, r.monto, r.concepto, r.usuario_id, r.autorizado_por, coalesce(r.creado_en, now()));
      n_sueltos := n_sueltos + 1;
    end if;
  end loop;

  -- El siguiente folio que dé la nube sigue después del último subido.
  select max(folio) into v_max_folio from public.ventas;
  if v_max_folio is not null then
    perform setval(pg_get_serial_sequence('public.ventas', 'folio'), v_max_folio);
  end if;

  return jsonb_build_object(
    'entradas_nuevas', n_rec,
    'entradas_ya_estaban', n_rec_ya,
    'entradas_en_conflicto', n_rec_conf,
    'turnos_nuevos', n_turnos,
    'turnos_cerrados', n_turnos_cerr,
    'turnos_en_conflicto', n_turnos_conf,
    'ventas_nuevas', n_ventas,
    'ventas_ya_estaban', n_ventas_ya,
    'ventas_sin_turno', n_sin_turno,
    'ventas_folio_repetido', n_folio_conf,
    'movimientos_sueltos', n_sueltos
  );
end;
$$;

-- 5. Solo la clave de servicio --------------------------------------------------

revoke execute on function public.mapa_usuarios(jsonb) from public, anon, authenticated;
revoke execute on function public.subir_catalogo(jsonb) from public, anon, authenticated;
revoke execute on function public.subir_operacion(jsonb) from public, anon, authenticated;
grant execute on function public.mapa_usuarios(jsonb), public.subir_catalogo(jsonb), public.subir_operacion(jsonb) to service_role;

-- Que la API de Supabase vea las funciones nuevas de inmediato.
notify pgrst, 'reload schema';
