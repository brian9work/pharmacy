-- Subir datos a la nube: cambio para una base de LaraFarma ya instalada.
-- Si instalas desde cero con postgres/larafarma.sql, esto ya viene incluido.
--
-- Ejecútalo como dueño de la base (postgres), una sola vez, y haz un respaldo antes:
--   sudo -u postgres pg_dump larafarmadb > ~/respaldo-$(date +%F).sql
--   sudo -u postgres psql -d larafarmadb -v ON_ERROR_STOP=1 < postgres/actualizaciones/20261031_subir_datos.sql

begin;

-- ---------------------------------------------------------------------------
-- Subir datos a la nube (Supabase)
--
-- El botón "Subir datos" de Configuración manda a la nube lo que aún no está
-- allá, para que el administrador consulte ventas, reportes e inventario
-- desde cualquier lugar. Aquí se arma lo que se sube y se lleva la cuenta de
-- cuándo se subió por última vez. Solo con el permiso configuracion.editar.
-- ---------------------------------------------------------------------------

create table public.sincronizaciones (
  id           bigint generated always as identity primary key,
  iniciada_en  timestamptz not null default now(),
  -- Solo se mandan los registros creados después de este instante.
  desde        timestamptz not null,
  terminada_en timestamptz,
  ok           boolean,
  -- true si no quedó nada pendiente (cuentas que faltan en la nube, conflictos).
  completa     boolean,
  resumen      jsonb,
  error        text,
  usuario_id   uuid references public.usuarios (id)
);

alter table public.sincronizaciones enable row level security;

create policy "configuración ve las subidas" on public.sincronizaciones for select to larafarma_app
  using ((select public.tiene_permiso('configuracion.editar')));

-- Empieza una subida. Dos a la vez no se permiten. El punto de partida es el
-- inicio de la última que salió bien y completa, con 10 minutos de colchón por
-- si una venta tardó en guardarse. Si una subida dejó algo pendiente (por
-- ejemplo una cuenta que falta en la nube), el punto no avanza y la siguiente
-- lo vuelve a intentar: subir de más no duplica nada.
create function public.iniciar_sincronizacion() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id    bigint;
  v_desde timestamptz;
begin
  if not public.tiene_permiso('configuracion.editar') then
    raise exception 'No tienes permiso para subir datos';
  end if;

  lock table public.sincronizaciones in exclusive mode;

  if exists (select 1 from public.sincronizaciones where terminada_en is null and iniciada_en > now() - interval '15 minutes') then
    raise exception 'Ya hay una subida en curso. Espera a que termine.';
  end if;
  -- Una que quedó colgada (se cortó la luz, se reinició el servidor) se da por fallida.
  update public.sincronizaciones set terminada_en = now(), ok = false, error = 'Se interrumpió' where terminada_en is null;

  select coalesce(max(iniciada_en) - interval '10 minutes', 'epoch'::timestamptz) into v_desde
  from public.sincronizaciones where ok and completa;

  insert into public.sincronizaciones (desde, usuario_id) values (v_desde, public.usuario_actual()) returning id into v_id;
  return jsonb_build_object('id', v_id, 'desde', v_desde);
end;
$$;

-- Todo lo necesario para subir. Catálogo, existencias y cuentas van completos
-- (la nube necesita saber a qué producto o lote se refiere cada venta);
-- entradas, turnos de caja y ventas, solo los nuevos desde `p_desde`.
-- Incluye costos: por eso solo se ejecuta con el permiso de configuración.
create function public.datos_para_subir(p_desde timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ventas uuid[];
  v_recs   uuid[];
  v_turnos uuid[];
begin
  if not public.tiene_permiso('configuracion.editar') then
    raise exception 'No tienes permiso para subir datos';
  end if;

  select coalesce(array_agg(id), '{}') into v_ventas from public.ventas where creado_en > p_desde;
  select coalesce(array_agg(id), '{}') into v_recs from public.recepciones where creado_en > p_desde;
  select coalesce(array_agg(t.id), '{}') into v_turnos
  from public.turnos_caja t
  where t.cerrado_en is null or t.abierto_en > p_desde or t.cerrado_en > p_desde
     or t.id in (select turno_id from public.ventas where id = any (v_ventas));

  return jsonb_build_object(
    'usuarios', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'correo', u.correo)), '[]') from public.usuarios u),
    'categorias', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.categorias x),
    'proveedores', (select coalesce(jsonb_agg(to_jsonb(x) - 'creado_en'), '[]') from public.proveedores x),
    'productos', (select coalesce(jsonb_agg(to_jsonb(x) - 'busqueda' - 'creado_en' - 'actualizado_en'), '[]') from public.productos x),
    'lotes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.lotes x),
    'recepciones', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.recepciones x where x.id = any (v_recs)),
    'recepcion_partidas', (select coalesce(jsonb_agg(to_jsonb(x) - 'id'), '[]') from public.recepcion_partidas x where x.recepcion_id = any (v_recs)),
    'turnos', (
      select coalesce(jsonb_agg((to_jsonb(t) - 'caja_id' - 'diferencia') || jsonb_build_object('caja', c.nombre)), '[]')
      from public.turnos_caja t join public.cajas c on c.id = t.caja_id
      where t.id = any (v_turnos)
    ),
    'ventas', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.ventas x where x.id = any (v_ventas)),
    'recetas', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.recetas x where x.venta_id = any (v_ventas)),
    'venta_partidas', (select coalesce(jsonb_agg(to_jsonb(x) - 'id'), '[]') from public.venta_partidas x where x.venta_id = any (v_ventas)),
    'venta_pagos', (select coalesce(jsonb_agg(to_jsonb(x) - 'id'), '[]') from public.venta_pagos x where x.venta_id = any (v_ventas)),
    'movimientos_caja', (
      select coalesce(jsonb_agg((to_jsonb(x) - 'id') || jsonb_build_object('origen_id', x.id)), '[]')
      from public.movimientos_caja x
      where x.venta_id = any (v_ventas) or (x.venta_id is null and x.creado_en > p_desde)
    ),
    'movimientos_inventario', (
      select coalesce(jsonb_agg((to_jsonb(x) - 'id') || jsonb_build_object('origen_id', x.id)), '[]')
      from public.movimientos_inventario x
      where x.venta_id = any (v_ventas) or x.recepcion_id = any (v_recs)
         or (x.venta_id is null and x.recepcion_id is null and x.creado_en > p_desde)
    )
  );
end;
$$;

create function public.terminar_sincronizacion(p_id bigint, p_ok boolean, p_resumen jsonb, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.tiene_permiso('configuracion.editar') then
    raise exception 'No tienes permiso para subir datos';
  end if;
  update public.sincronizaciones
  set terminada_en = now(), ok = p_ok, resumen = p_resumen, error = p_error,
      completa = p_ok and coalesce((p_resumen ->> 'completa')::boolean, false)
  where id = p_id and terminada_en is null;
end;
$$;

-- Privilegios
revoke insert, update, delete on public.sincronizaciones from larafarma_app;
grant select on public.sincronizaciones to larafarma_app;
revoke execute on function public.iniciar_sincronizacion(), public.datos_para_subir(timestamptz),
  public.terminar_sincronizacion(bigint, boolean, jsonb, text) from public;
grant execute on function
  public.iniciar_sincronizacion(),
  public.datos_para_subir(timestamptz),
  public.terminar_sincronizacion(bigint, boolean, jsonb, text)
  to larafarma_app;

commit;
