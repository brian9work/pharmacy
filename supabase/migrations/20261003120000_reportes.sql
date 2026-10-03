-- Reportes financieros. Solo con el permiso reportes.ver.
-- Cárgalo en Supabase → SQL Editor después de las migraciones anteriores.
--
-- Definiciones:
--   Ventas         total cobrado con IVA (sin canceladas)
--   Ventas sin IVA  base para calcular utilidad
--   Costo          piezas vendidas × costo del lote del que salieron
--   Utilidad bruta  ventas sin IVA − costo
--   Compras        mercancía recibida en el periodo (costo capturado en la entrada)
--   Mermas         piezas dadas de baja × costo del lote

-- Totales de un rango de instantes. Interna: no se expone a la app.
create function public.resumen_ventas(p_inicio timestamptz, p_fin timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  with periodo as (
    select * from public.ventas where creado_en >= p_inicio and creado_en < p_fin
  ),
  pagadas as (
    select * from periodo where estado = 'pagada'
  ),
  vendido as (
    select coalesce(sum(vp.cantidad * l.costo), 0) as costo, coalesce(sum(vp.cantidad), 0) as piezas
    from public.venta_partidas vp
    join pagadas p on p.id = vp.venta_id
    join public.lotes l on l.id = vp.lote_id
  )
  select jsonb_build_object(
    'ventas',          coalesce((select sum(total) from pagadas), 0),
    'subtotal',        coalesce((select sum(subtotal) from pagadas), 0),
    'iva',             coalesce((select sum(iva) from pagadas), 0),
    'tickets',         (select count(*) from pagadas),
    'piezas',          (select piezas from vendido),
    'costo',           (select costo from vendido),
    'canceladas',      (select count(*) from periodo where estado = 'cancelada'),
    'monto_cancelado', coalesce((select sum(total) from periodo where estado = 'cancelada'), 0)
  );
$$;

-- Reporte de un periodo de días (máximo un año), con el periodo anterior de
-- la misma duración para comparar.
create function public.reporte_ventas(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_zona   text := public.zona_horaria();
  v_dias   integer;
  v_inicio timestamptz;
  v_fin    timestamptz;
begin
  if not public.tiene_permiso('reportes.ver') then
    raise exception 'No tienes permiso para ver reportes';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El periodo no es válido';
  end if;
  v_dias := p_hasta - p_desde + 1;
  if v_dias > 366 then
    raise exception 'El periodo máximo es de un año';
  end if;

  -- Medianoche en la zona de la farmacia, no en la del servidor.
  v_inicio := p_desde::timestamp at time zone v_zona;
  v_fin := (p_hasta + 1)::timestamp at time zone v_zona;

  return jsonb_build_object(
    'resumen', public.resumen_ventas(v_inicio, v_fin),
    'anterior', public.resumen_ventas((p_desde - v_dias)::timestamp at time zone v_zona, v_inicio),

    'por_dia', (
      select coalesce(jsonb_agg(jsonb_build_object('fecha', d.dia, 'ventas', coalesce(x.ventas, 0), 'tickets', coalesce(x.tickets, 0)) order by d.dia), '[]')
      from (select generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day')::date as dia) d
      left join (
        select (v.creado_en at time zone v_zona)::date as dia, sum(v.total) as ventas, count(*) as tickets
        from public.ventas v
        where v.estado = 'pagada' and v.creado_en >= v_inicio and v.creado_en < v_fin
        group by 1
      ) x on x.dia = d.dia
    ),

    'por_hora', (
      select coalesce(jsonb_agg(jsonb_build_object('hora', h.hora, 'ventas', coalesce(x.ventas, 0), 'tickets', coalesce(x.tickets, 0)) order by h.hora), '[]')
      from generate_series(0, 23) as h(hora)
      left join (
        select extract(hour from v.creado_en at time zone v_zona)::integer as hora, sum(v.total) as ventas, count(*) as tickets
        from public.ventas v
        where v.estado = 'pagada' and v.creado_en >= v_inicio and v.creado_en < v_fin
        group by 1
      ) x on x.hora = h.hora
    ),

    'por_metodo', (
      select coalesce(jsonb_agg(jsonb_build_object('metodo', x.metodo, 'monto', x.monto, 'pagos', x.pagos) order by x.monto desc), '[]')
      from (
        select pg.metodo, sum(pg.monto) as monto, count(*) as pagos
        from public.venta_pagos pg
        join public.ventas v on v.id = pg.venta_id
        where v.estado = 'pagada' and v.creado_en >= v_inicio and v.creado_en < v_fin
        group by pg.metodo
      ) x
    ),

    'por_cajero', (
      select coalesce(jsonb_agg(jsonb_build_object('cajero', x.nombre, 'ventas', x.ventas, 'tickets', x.tickets) order by x.ventas desc), '[]')
      from (
        select u.nombre, sum(v.total) as ventas, count(*) as tickets
        from public.ventas v
        join public.usuarios u on u.id = v.usuario_id
        where v.estado = 'pagada' and v.creado_en >= v_inicio and v.creado_en < v_fin
        group by u.id, u.nombre
      ) x
    ),

    'por_categoria', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'categoria', x.categoria, 'importe', x.importe, 'base', x.base, 'costo', x.costo, 'piezas', x.piezas
      ) order by x.importe desc), '[]')
      from (
        select coalesce(c.nombre, 'Sin categoría') as categoria,
               sum(vp.importe) as importe,
               sum(round(vp.importe / (1 + vp.iva / 100.0))) as base,
               sum(vp.cantidad * l.costo) as costo,
               sum(vp.cantidad) as piezas
        from public.venta_partidas vp
        join public.ventas v on v.id = vp.venta_id
        join public.lotes l on l.id = vp.lote_id
        join public.productos p on p.id = vp.producto_id
        left join public.categorias c on c.id = p.categoria_id
        where v.estado = 'pagada' and v.creado_en >= v_inicio and v.creado_en < v_fin
        group by 1
      ) x
    ),

    'productos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'producto', x.nombre, 'importe', x.importe, 'base', x.base, 'costo', x.costo, 'piezas', x.piezas
      ) order by x.importe desc), '[]')
      from (
        select p.nombre,
               sum(vp.importe) as importe,
               sum(round(vp.importe / (1 + vp.iva / 100.0))) as base,
               sum(vp.cantidad * l.costo) as costo,
               sum(vp.cantidad) as piezas
        from public.venta_partidas vp
        join public.ventas v on v.id = vp.venta_id
        join public.lotes l on l.id = vp.lote_id
        join public.productos p on p.id = vp.producto_id
        where v.estado = 'pagada' and v.creado_en >= v_inicio and v.creado_en < v_fin
        group by p.id, p.nombre
        order by sum(vp.importe) desc
        limit 20
      ) x
    ),

    'compras', (
      select jsonb_build_object('recepciones', count(*), 'total', coalesce(sum(r.total), 0))
      from public.recepciones r
      where r.fecha between p_desde and p_hasta
    ),

    'mermas', (
      select jsonb_build_object('piezas', coalesce(sum(-m.cantidad), 0), 'costo', coalesce(sum(-m.cantidad * l.costo), 0))
      from public.movimientos_inventario m
      join public.lotes l on l.id = m.lote_id
      where m.tipo = 'merma' and m.creado_en >= v_inicio and m.creado_en < v_fin
    )
  );
end;
$$;

-- Ventas del periodo, una fila por ticket, para exportar a Excel o al contador.
create function public.exportar_ventas(p_desde date, p_hasta date)
returns table (
  folio    bigint,
  fecha    date,
  hora     text,
  cajero   text,
  metodo   text,
  piezas   integer,
  subtotal integer,
  iva      integer,
  total    integer,
  costo    integer,
  estado   text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_zona text := public.zona_horaria();
begin
  if not public.tiene_permiso('reportes.ver') then
    raise exception 'No tienes permiso para ver reportes';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 365 then
    raise exception 'El periodo no es válido (máximo un año)';
  end if;

  return query
  select
    v.folio,
    (v.creado_en at time zone v_zona)::date,
    to_char(v.creado_en at time zone v_zona, 'HH24:MI'),
    u.nombre,
    (select string_agg(distinct pg.metodo, ' + ') from public.venta_pagos pg where pg.venta_id = v.id),
    (select coalesce(sum(vp.cantidad), 0)::integer from public.venta_partidas vp where vp.venta_id = v.id),
    v.subtotal,
    v.iva,
    v.total,
    (select coalesce(sum(vp.cantidad * l.costo), 0)::integer
       from public.venta_partidas vp join public.lotes l on l.id = vp.lote_id
      where vp.venta_id = v.id),
    v.estado
  from public.ventas v
  join public.usuarios u on u.id = v.usuario_id
  where v.creado_en >= p_desde::timestamp at time zone v_zona
    and v.creado_en < (p_hasta + 1)::timestamp at time zone v_zona
  order by v.folio;
end;
$$;

-- resumen_ventas se salta RLS: nadie la llama directo.
revoke execute on function public.resumen_ventas(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.reporte_ventas(date, date) from public, anon;
revoke execute on function public.exportar_ventas(date, date) from public, anon;
grant execute on function public.reporte_ventas(date, date), public.exportar_ventas(date, date) to authenticated;
