-- Receta obligatoria.
-- Cárgalo en Supabase → SQL Editor después de las migraciones anteriores.
--
--   · productos.requiere_receta: la casilla "Requiere receta médica".
--     Antibióticos y controlados la tienen siempre.
--   · registrar_venta no cobra un producto con receta si no se capturan
--     médico, cédula y fecha; en controlados, además, la receta retenida.
--   · La receta queda en public.recetas, ligada a la venta y a cada
--     partida que la requería.

-- 1. La casilla en el producto -----------------------------------------------

alter table public.productos add column requiere_receta boolean not null default false;

update public.productos set requiere_receta = true where clasificacion <> 'libre';

-- Antibióticos y controlados siempre piden receta, aunque se mande falso.
create function public.normalizar_receta() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.clasificacion <> 'libre' then
    new.requiere_receta := true;
  end if;
  return new;
end;
$$;

create trigger productos_normalizar_receta
  before insert or update on public.productos
  for each row execute function public.normalizar_receta();

alter table public.productos
  add constraint productos_receta_check check (clasificacion = 'libre' or requiere_receta);

-- La columna es visible para la app (los costos siguen ocultos).
grant select (requiere_receta) on public.productos to authenticated;

-- Quitar o poner la receta es "editar producto", no "cambiar precio".
create or replace function public.revisar_cambio_producto() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then
    return new; -- SQL Editor o clave de servicio
  end if;
  if (new.precio, new.costo) is distinct from (old.precio, old.costo)
     and not public.tiene_permiso('productos.precios') then
    raise exception 'No tienes permiso para cambiar precios';
  end if;
  if (new.codigo_barras, new.nombre, new.sustancia, new.presentacion, new.laboratorio, new.categoria_id,
      new.clasificacion, new.requiere_receta, new.iva, new.stock_minimo, new.ubicacion, new.refrigerado, new.activo)
     is distinct from
     (old.codigo_barras, old.nombre, old.sustancia, old.presentacion, old.laboratorio, old.categoria_id,
      old.clasificacion, old.requiere_receta, old.iva, old.stock_minimo, old.ubicacion, old.refrigerado, old.activo)
     and not public.tiene_permiso('productos.editar') then
    raise exception 'No tienes permiso para editar productos';
  end if;
  return new;
end;
$$;

-- 2. Tipos de receta ---------------------------------------------------------

-- "simple": producto marcado con la casilla que no es antibiótico ni controlado.
alter table public.recetas drop constraint recetas_tipo_check;
alter table public.recetas add constraint recetas_tipo_check check (tipo in ('simple', 'antibiotico', 'controlado'));

-- 3. Venta con receta obligatoria --------------------------------------------

drop function public.registrar_venta(jsonb, text, integer, text);

-- Cobra una venta. p_partidas: [{"producto_id": "...", "cantidad": 2}, ...]
-- p_receta (si algún producto la pide):
--   {"medico": "...", "cedula": "...", "fecha": "AAAA-MM-DD", "folio": "...", "retenida": true}
-- Precio e IVA salen del catálogo y los lotes se asignan aquí (FEFO).
create function public.registrar_venta(
  p_partidas   jsonb,
  p_metodo     text,
  p_recibido   integer default null,
  p_referencia text default '',
  p_receta     jsonb default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario      uuid := auth.uid();
  v_turno        uuid;
  v_venta        uuid;
  v_folio        bigint;
  v_texto        text;
  v_total        integer;
  v_subtotal     integer;
  v_recibido     integer;
  v_faltan       integer;
  v_tomar        integer;
  v_tipo_receta  text;
  v_receta       uuid;
  v_fecha_receta date;
  v_retenida     boolean := false;
  r              record;
  l              record;
begin
  if not public.tiene_permiso('ventas.vender') then
    raise exception 'No tienes permiso para vender';
  end if;
  if p_metodo is null or p_metodo not in ('efectivo', 'tarjeta', 'transferencia') then
    raise exception 'Forma de pago no válida';
  end if;
  if p_partidas is null or jsonb_typeof(p_partidas) <> 'array' or jsonb_array_length(p_partidas) = 0 then
    raise exception 'La venta no tiene productos';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_partidas) as x(producto_id uuid, cantidad integer)
    where x.producto_id is null or x.cantidad is null or x.cantidad <= 0
  ) then
    raise exception 'Hay una cantidad no válida en la venta';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_partidas) as x(producto_id uuid, cantidad integer)
    left join public.productos p on p.id = x.producto_id and p.activo
    where p.id is null
  ) then
    raise exception 'Uno de los productos no existe o está inactivo';
  end if;

  select id into v_turno from public.turnos_caja where usuario_id = v_usuario and cerrado_en is null;
  if v_turno is null then
    raise exception 'Abre tu caja para vender';
  end if;

  -- La receta que pide la venta es la más estricta de sus productos.
  select case
           when bool_or(p.clasificacion = 'controlado') then 'controlado'
           when bool_or(p.clasificacion = 'antibiotico') then 'antibiotico'
           when bool_or(p.requiere_receta) then 'simple'
         end
  into v_tipo_receta
  from (select distinct y.producto_id from jsonb_to_recordset(p_partidas) as y(producto_id uuid, cantidad integer)) x
  join public.productos p on p.id = x.producto_id;

  if v_tipo_receta is not null then
    if p_receta is null or jsonb_typeof(p_receta) <> 'object'
       or btrim(coalesce(p_receta ->> 'medico', '')) = ''
       or btrim(coalesce(p_receta ->> 'cedula', '')) = ''
       or coalesce(p_receta ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Esta venta lleva medicamentos con receta: captura médico, cédula y fecha de la receta';
    end if;
    if length(p_receta ->> 'medico') > 120 or length(p_receta ->> 'cedula') > 20 or length(coalesce(p_receta ->> 'folio', '')) > 40 then
      raise exception 'Algún dato de la receta es demasiado largo';
    end if;
    v_fecha_receta := (p_receta ->> 'fecha')::date;
    if v_fecha_receta > public.hoy_local() then
      raise exception 'La fecha de la receta no puede ser futura';
    end if;
    v_retenida := coalesce(p_receta -> 'retenida' = 'true'::jsonb, false);
    if v_tipo_receta = 'controlado' and not v_retenida then
      raise exception 'Los medicamentos controlados requieren retener la receta original';
    end if;
  end if;

  select
    sum(p.precio * x.cantidad)::integer,
    sum(round((p.precio * x.cantidad) / (1 + p.iva / 100.0)))::integer
  into v_total, v_subtotal
  from (
    select y.producto_id, sum(y.cantidad)::integer as cantidad
    from jsonb_to_recordset(p_partidas) as y(producto_id uuid, cantidad integer)
    group by y.producto_id
  ) x
  join public.productos p on p.id = x.producto_id;

  if v_total <= 0 then
    raise exception 'El total de la venta es 0';
  end if;

  if p_metodo = 'efectivo' then
    v_recibido := coalesce(p_recibido, v_total);
    if v_recibido < v_total then
      raise exception 'El efectivo recibido no alcanza';
    end if;
  end if;

  insert into public.ventas (turno_id, usuario_id, subtotal, iva, total)
  values (v_turno, v_usuario, v_subtotal, v_total - v_subtotal, v_total)
  returning id, folio into v_venta, v_folio;

  v_texto := 'V-' || lpad(v_folio::text, 6, '0');

  if v_tipo_receta is not null then
    insert into public.recetas (venta_id, tipo, medico, cedula, fecha_receta, folio_receta, retenida, registrada_por)
    values (
      v_venta,
      v_tipo_receta,
      btrim(p_receta ->> 'medico'),
      upper(btrim(p_receta ->> 'cedula')),
      v_fecha_receta,
      btrim(coalesce(p_receta ->> 'folio', '')),
      v_retenida,
      v_usuario
    )
    returning id into v_receta;
  end if;

  for r in
    select x.producto_id, x.cantidad, p.nombre, p.precio, p.iva, p.requiere_receta
    from (
      select y.producto_id, sum(y.cantidad)::integer as cantidad
      from jsonb_to_recordset(p_partidas) as y(producto_id uuid, cantidad integer)
      group by y.producto_id
    ) x
    join public.productos p on p.id = x.producto_id
    order by x.producto_id
  loop
    v_faltan := r.cantidad;
    for l in
      select lt.id, lt.cantidad
      from public.lotes lt
      where lt.producto_id = r.producto_id
        and lt.estado = 'disponible'
        and lt.cantidad > 0
        and lt.caducidad >= public.hoy_local()
      order by lt.caducidad, lt.creado_en
      for update
    loop
      exit when v_faltan = 0;
      v_tomar := least(l.cantidad, v_faltan);
      insert into public.venta_partidas (venta_id, producto_id, lote_id, cantidad, precio, iva, importe, receta_id)
      values (v_venta, r.producto_id, l.id, v_tomar, r.precio, r.iva, r.precio * v_tomar, case when r.requiere_receta then v_receta end);
      insert into public.movimientos_inventario (lote_id, producto_id, tipo, cantidad, usuario_id, referencia, venta_id)
      values (l.id, r.producto_id, 'venta', -v_tomar, v_usuario, v_texto, v_venta);
      v_faltan := v_faltan - v_tomar;
    end loop;

    if v_faltan > 0 then
      raise exception 'No hay suficientes piezas de % (faltan %)', r.nombre, v_faltan;
    end if;
  end loop;

  insert into public.venta_pagos (venta_id, metodo, monto, recibido, referencia)
  values (v_venta, p_metodo, v_total, case when p_metodo = 'efectivo' then v_recibido end, coalesce(p_referencia, ''));

  insert into public.movimientos_caja (turno_id, tipo, metodo, monto, concepto, venta_id, usuario_id)
  values (v_turno, 'venta', p_metodo, v_total, 'Venta ' || v_texto, v_venta, v_usuario);

  return jsonb_build_object(
    'venta_id', v_venta,
    'folio', v_texto,
    'total', v_total,
    'cambio', case when p_metodo = 'efectivo' then v_recibido - v_total end,
    'receta_id', v_receta
  );
end;
$$;

revoke execute on function public.registrar_venta(jsonb, text, integer, text, jsonb) from public, anon;
grant execute on function public.registrar_venta(jsonb, text, integer, text, jsonb) to authenticated;

-- Que la API de Supabase vea la columna y la función nuevas de inmediato.
notify pgrst, 'reload schema';
