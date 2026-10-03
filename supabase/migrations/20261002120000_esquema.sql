-- Esquema del sistema de farmacia para Supabase.
--
-- Mismo modelo que db/01-esquema.sql, adaptado a Supabase:
--   · Supabase Auth guarda correo y contraseña. public.usuarios guarda los
--     datos de la cuenta (nombre, rol, estado) con el mismo id de auth.users.
--   · Sesiones y bloqueo por intentos los maneja Supabase Auth.
--   · Row Level Security en todas las tablas: cada consulta corre con los
--     permisos de quien inició sesión. anon (sin sesión) no ve nada.
--   · Ventas, caja, entradas y permisos solo se escriben con funciones
--     (RPC) que validan permisos y calculan precios y totales en la base.
--
-- Cárgalo en Supabase → SQL Editor, o con `supabase db push`.

-- Búsqueda por nombre. Supabase instala extensiones en el esquema "extensions".
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

create function public.poner_actualizado_en() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create function public.solo_agregar() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Los registros de % no se modifican ni se borran', tg_table_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Negocio
-- ---------------------------------------------------------------------------

-- Una sola fila. El nombre comercial y el logo están en config/marca.ts.
create table public.negocio (
  id                    smallint primary key default 1 check (id = 1),
  razon_social          text not null default '',
  rfc                   text not null default '',
  direccion             text not null default '',
  telefono              text not null default '',
  pie_ticket            text not null default 'Gracias por su compra',
  zona_horaria          text not null default 'America/Mexico_City',
  dias_aviso_caducidad  integer not null default 90 check (dias_aviso_caducidad > 0)
);

create function public.zona_horaria() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select zona_horaria from public.negocio where id = 1), 'America/Mexico_City');
$$;

-- Fecha de hoy en la zona horaria de la farmacia, no la del servidor.
create function public.hoy_local() returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone public.zona_horaria())::date;
$$;

-- ---------------------------------------------------------------------------
-- Usuarios, roles y permisos
-- ---------------------------------------------------------------------------

create table public.roles (
  clave        text primary key,
  nombre       text not null,
  descripcion  text not null default ''
);

create table public.permisos (
  clave        text primary key,
  modulo       text not null,
  nombre       text not null,
  descripcion  text not null default '',
  -- Nunca se da a un rol distinto de admin.
  solo_admin   boolean not null default false
);

create table public.rol_permisos (
  rol      text not null references public.roles (clave) on delete cascade,
  permiso  text not null references public.permisos (clave) on delete cascade,
  primary key (rol, permiso)
);

-- Datos de la cuenta. El correo y la contraseña viven en auth.users.
create table public.usuarios (
  id                       uuid primary key references auth.users (id) on delete cascade,
  nombre                   text not null check (btrim(nombre) <> ''),
  correo                   text not null unique,
  rol                      text not null references public.roles (clave),
  activo                   boolean not null default true,
  debe_cambiar_contrasena  boolean not null default true,
  ultimo_acceso            timestamptz,
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now()
);

create trigger usuarios_actualizado_en
  before update on public.usuarios
  for each row execute function public.poner_actualizado_en();

-- Excepciones por persona: concedido = true da un permiso que su rol no
-- tiene; concedido = false se lo quita aunque su rol lo tenga.
create table public.usuario_permisos (
  usuario_id  uuid not null references public.usuarios (id) on delete cascade,
  permiso     text not null references public.permisos (clave) on delete cascade,
  concedido   boolean not null,
  primary key (usuario_id, permiso)
);

-- ¿Quien hace la petición tiene este permiso? Base de todas las reglas RLS.
create function public.tiene_permiso(p_permiso text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.usuarios u
    join public.permisos p on p.clave = p_permiso
    left join public.rol_permisos rp on rp.rol = u.rol and rp.permiso = p.clave
    left join public.usuario_permisos up on up.usuario_id = u.id and up.permiso = p.clave
    where u.id = auth.uid()
      and u.activo
      and (u.rol = 'admin' or (not p.solo_admin and coalesce(up.concedido, rp.permiso is not null)))
  );
$$;

-- ¿Quien hace la petición tiene cuenta activa en la farmacia?
create function public.usuario_activo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and activo);
$$;

create function public.revisar_solo_admin() returns trigger
language plpgsql set search_path = '' as $$
declare
  es_solo_admin boolean;
  rol_destino   text;
begin
  select solo_admin into es_solo_admin from public.permisos where clave = new.permiso;
  if not es_solo_admin then
    return new;
  end if;

  if tg_table_name = 'rol_permisos' then
    rol_destino := new.rol;
  else
    if not new.concedido then
      return new;
    end if;
    select rol into rol_destino from public.usuarios where id = new.usuario_id;
  end if;

  if rol_destino <> 'admin' then
    raise exception 'El permiso % es solo para administradores', new.permiso;
  end if;
  return new;
end;
$$;

create trigger rol_permisos_solo_admin
  before insert or update on public.rol_permisos
  for each row execute function public.revisar_solo_admin();

create trigger usuario_permisos_solo_admin
  before insert or update on public.usuario_permisos
  for each row execute function public.revisar_solo_admin();

create function public.conservar_un_admin() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.rol = 'admin' and old.activo
     and (tg_op = 'DELETE' or new.rol <> 'admin' or not new.activo)
     and not exists (select 1 from public.usuarios where rol = 'admin' and activo and id <> old.id) then
    raise exception 'Debe quedar al menos un administrador activo';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger usuarios_conservar_un_admin
  before update or delete on public.usuarios
  for each row execute function public.conservar_un_admin();

-- Si el correo cambia en Supabase Auth, se copia a la cuenta.
create function public.sincronizar_correo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.usuarios set correo = new.email where id = new.id and correo is distinct from new.email;
  return new;
end;
$$;

create trigger usuarios_sincronizar_correo
  after update of email on auth.users
  for each row execute function public.sincronizar_correo();

-- Quién hizo qué: accesos, cambios de usuarios, permisos, precios, cancelaciones.
create table public.bitacora (
  id          bigint generated always as identity primary key,
  usuario_id  uuid references public.usuarios (id),
  accion      text not null,
  entidad     text,
  entidad_id  text,
  antes       jsonb,
  despues     jsonb,
  creado_en   timestamptz not null default now()
);

create index bitacora_fecha on public.bitacora (creado_en desc);

create trigger bitacora_solo_agregar
  before update or delete on public.bitacora
  for each row execute function public.solo_agregar();

create function public.auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- No registra cambios que solo tocan la fecha de acceso o de edición.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'actualizado_en' - 'ultimo_acceso') = (to_jsonb(old) - 'actualizado_en' - 'ultimo_acceso') then
    return null;
  end if;

  insert into public.bitacora (usuario_id, accion, entidad, entidad_id, antes, despues)
  values (
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id', to_jsonb(new) ->> 'permiso', to_jsonb(old) ->> 'permiso'),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger usuarios_auditar after insert or update or delete on public.usuarios
  for each row execute function public.auditar();
create trigger rol_permisos_auditar after insert or delete on public.rol_permisos
  for each row execute function public.auditar();
create trigger usuario_permisos_auditar after insert or update or delete on public.usuario_permisos
  for each row execute function public.auditar();
create trigger negocio_auditar after update on public.negocio
  for each row execute function public.auditar();

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

create table public.categorias (
  id      integer generated always as identity primary key,
  nombre  text not null unique
);

create table public.productos (
  id             uuid primary key default gen_random_uuid(),
  codigo_barras  text unique check (codigo_barras ~ '^[0-9A-Za-z-]{4,32}$'),
  nombre         text not null check (btrim(nombre) <> ''),
  sustancia      text not null default '',
  presentacion   text not null default '',
  laboratorio    text not null default '',
  categoria_id   integer references public.categorias (id),
  -- libre: sin receta · antibiotico: receta obligatoria · controlado: receta retenida
  clasificacion  text not null default 'libre' check (clasificacion in ('libre', 'antibiotico', 'controlado')),
  -- Precio de venta con IVA incluido, en centavos.
  precio         integer not null check (precio >= 0),
  -- Solo visible con el permiso inventario.costos (ver costos_productos()).
  costo          integer not null default 0 check (costo >= 0),
  iva            smallint not null default 0 check (iva in (0, 16)),
  stock_minimo   integer not null default 0 check (stock_minimo >= 0),
  ubicacion      text not null default '',
  refrigerado    boolean not null default false,
  activo         boolean not null default true,
  -- Texto en minúsculas y sin acentos para buscar "amoxicilina" o "losartan".
  busqueda       text generated always as (
    translate(lower(nombre || ' ' || sustancia || ' ' || laboratorio), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')
  ) stored,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index productos_busqueda on public.productos using gin (busqueda extensions.gin_trgm_ops);

create trigger productos_actualizado_en
  before update on public.productos
  for each row execute function public.poner_actualizado_en();

-- Precio y costo piden productos.precios; el resto de los datos, productos.editar.
create function public.revisar_cambio_producto() returns trigger
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
      new.clasificacion, new.iva, new.stock_minimo, new.ubicacion, new.refrigerado, new.activo)
     is distinct from
     (old.codigo_barras, old.nombre, old.sustancia, old.presentacion, old.laboratorio, old.categoria_id,
      old.clasificacion, old.iva, old.stock_minimo, old.ubicacion, old.refrigerado, old.activo)
     and not public.tiene_permiso('productos.editar') then
    raise exception 'No tienes permiso para editar productos';
  end if;
  return new;
end;
$$;

create trigger productos_revisar_cambio
  before update on public.productos
  for each row execute function public.revisar_cambio_producto();

create trigger productos_auditar after insert or update on public.productos
  for each row execute function public.auditar();

create table public.proveedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  rfc        text not null default '',
  telefono   text not null default '',
  correo     text not null default '',
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Lotes y recepción de mercancía
-- ---------------------------------------------------------------------------

create table public.lotes (
  id                 uuid primary key default gen_random_uuid(),
  producto_id        uuid not null references public.productos (id),
  numero             text not null check (btrim(numero) <> ''),
  caducidad          date not null,
  -- Saldo del lote. Solo lo cambia un movimiento de inventario.
  cantidad           integer not null default 0 check (cantidad >= 0),
  costo              integer not null default 0 check (costo >= 0),
  estado             text not null default 'disponible' check (estado in ('disponible', 'cuarentena')),
  motivo_cuarentena  text,
  creado_en          timestamptz not null default now(),
  unique (producto_id, numero, caducidad),
  unique (id, producto_id),
  check (estado = 'disponible' or motivo_cuarentena is not null)
);

-- Primero lo que caduca antes (FEFO).
create index lotes_fefo on public.lotes (producto_id, caducidad) where cantidad > 0;

create function public.proteger_saldo_lote() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('farmacia.moviendo_inventario', true), '') <> 'si' then
    if tg_op = 'INSERT' and new.cantidad <> 0 then
      raise exception 'Un lote nuevo empieza en 0: dale existencias con un movimiento de inventario';
    elsif tg_op = 'UPDATE' and new.cantidad <> old.cantidad then
      raise exception 'La cantidad de un lote solo cambia con un movimiento de inventario';
    end if;
  end if;
  return new;
end;
$$;

create trigger lotes_proteger_saldo
  before insert or update on public.lotes
  for each row execute function public.proteger_saldo_lote();

create table public.recepciones (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null references public.proveedores (id),
  factura       text not null check (btrim(factura) <> ''),
  fecha         date not null,
  usuario_id    uuid not null references public.usuarios (id),
  total         integer not null default 0 check (total >= 0),
  notas         text not null default '',
  creado_en     timestamptz not null default now(),
  unique (proveedor_id, factura)
);

create table public.recepcion_partidas (
  id            bigint generated always as identity primary key,
  recepcion_id  uuid not null references public.recepciones (id),
  lote_id       uuid not null references public.lotes (id),
  cantidad      integer not null check (cantidad > 0),
  costo         integer not null check (costo >= 0)
);

create trigger recepcion_partidas_solo_agregar
  before update or delete on public.recepcion_partidas
  for each row execute function public.solo_agregar();

-- ---------------------------------------------------------------------------
-- Cajas y turnos
-- ---------------------------------------------------------------------------

create table public.cajas (
  id      smallint generated always as identity primary key,
  nombre  text not null unique,
  activa  boolean not null default true
);

create table public.turnos_caja (
  id                 uuid primary key default gen_random_uuid(),
  caja_id            smallint not null references public.cajas (id),
  usuario_id         uuid not null references public.usuarios (id),
  abierto_en         timestamptz not null default now(),
  fondo_inicial      integer not null check (fondo_inicial >= 0),
  cerrado_en         timestamptz,
  -- Lo llena cerrar_turno(): fondo + todo el efectivo del turno.
  efectivo_esperado  integer,
  efectivo_contado   integer check (efectivo_contado >= 0),
  diferencia         integer generated always as (efectivo_contado - efectivo_esperado) stored,
  -- Conteo por denominación en centavos: {"100000": 2, "2000": 5, "50": 3}
  conteo             jsonb,
  check ((cerrado_en is null) = (efectivo_contado is null)),
  check ((cerrado_en is null) = (efectivo_esperado is null))
);

create unique index turnos_un_abierto_por_caja on public.turnos_caja (caja_id) where cerrado_en is null;
create unique index turnos_un_abierto_por_usuario on public.turnos_caja (usuario_id) where cerrado_en is null;

create function public.proteger_turno() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los turnos de caja no se borran';
  end if;
  if old.cerrado_en is not null then
    raise exception 'Un turno cerrado no se modifica';
  end if;
  return new;
end;
$$;

create trigger turnos_proteger
  before update or delete on public.turnos_caja
  for each row execute function public.proteger_turno();

-- ---------------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------------

create table public.ventas (
  id                  uuid primary key default gen_random_uuid(),
  -- Se muestra como V-000001.
  folio               bigint generated always as identity unique,
  turno_id            uuid not null references public.turnos_caja (id),
  usuario_id          uuid not null references public.usuarios (id),
  creado_en           timestamptz not null default now(),
  subtotal            integer not null check (subtotal >= 0),
  iva                 integer not null check (iva >= 0),
  total               integer not null check (total = subtotal + iva),
  estado              text not null default 'pagada' check (estado in ('pagada', 'cancelada')),
  cancelada_en        timestamptz,
  cancelada_por       uuid references public.usuarios (id),
  motivo_cancelacion  text,
  check ((estado = 'cancelada') = (cancelada_en is not null)),
  check (estado = 'pagada' or (cancelada_por is not null and motivo_cancelacion is not null))
);

create index ventas_fecha on public.ventas (creado_en desc);
create index ventas_turno on public.ventas (turno_id);
create index ventas_usuario on public.ventas (usuario_id);

create function public.revisar_turno_venta() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.turnos_caja
    where id = new.turno_id and usuario_id = new.usuario_id and cerrado_en is null
  ) then
    raise exception 'La venta necesita un turno de caja abierto de la misma persona';
  end if;
  return new;
end;
$$;

create trigger ventas_revisar_turno
  before insert on public.ventas
  for each row execute function public.revisar_turno_venta();

create function public.proteger_venta() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las ventas no se borran: se cancelan';
  end if;
  if old.estado = 'cancelada' then
    raise exception 'La venta ya está cancelada';
  end if;
  if (new.folio, new.turno_id, new.usuario_id, new.creado_en, new.subtotal, new.iva, new.total)
     is distinct from (old.folio, old.turno_id, old.usuario_id, old.creado_en, old.subtotal, old.iva, old.total) then
    raise exception 'Una venta cobrada no se modifica: cancélala y registra otra';
  end if;
  return new;
end;
$$;

create trigger ventas_proteger
  before update or delete on public.ventas
  for each row execute function public.proteger_venta();

create trigger ventas_auditar after update on public.ventas
  for each row execute function public.auditar();

create table public.recetas (
  id              uuid primary key default gen_random_uuid(),
  venta_id        uuid not null references public.ventas (id),
  tipo            text not null check (tipo in ('antibiotico', 'controlado')),
  medico          text not null check (btrim(medico) <> ''),
  cedula          text not null check (btrim(cedula) <> ''),
  fecha_receta    date not null,
  folio_receta    text not null default '',
  retenida        boolean not null default false,
  registrada_por  uuid not null references public.usuarios (id),
  creado_en       timestamptz not null default now(),
  check (tipo <> 'controlado' or retenida)
);

create trigger recetas_solo_agregar
  before update or delete on public.recetas
  for each row execute function public.solo_agregar();

-- Un renglón por lote: si una venta toma piezas de dos lotes, son dos renglones.
create table public.venta_partidas (
  id           bigint generated always as identity primary key,
  venta_id     uuid not null references public.ventas (id),
  producto_id  uuid not null,
  lote_id      uuid not null,
  cantidad     integer not null check (cantidad > 0),
  -- Precio unitario cobrado, con IVA.
  precio       integer not null check (precio >= 0),
  iva          smallint not null check (iva in (0, 16)),
  descuento    integer not null default 0 check (descuento >= 0),
  importe      integer not null check (importe >= 0 and importe = precio * cantidad - descuento),
  receta_id    uuid references public.recetas (id),
  foreign key (lote_id, producto_id) references public.lotes (id, producto_id)
);

create index venta_partidas_venta on public.venta_partidas (venta_id);

create trigger venta_partidas_solo_agregar
  before update or delete on public.venta_partidas
  for each row execute function public.solo_agregar();

create table public.venta_pagos (
  id          bigint generated always as identity primary key,
  venta_id    uuid not null references public.ventas (id),
  metodo      text not null check (metodo in ('efectivo', 'tarjeta', 'transferencia')),
  monto       integer not null check (monto > 0),
  -- Solo efectivo: lo que dio el cliente. Cambio = recibido - monto.
  recibido    integer check (recibido >= monto),
  -- Autorización de tarjeta o clave de rastreo de la transferencia.
  referencia  text not null default '',
  check (metodo = 'efectivo' or recibido is null)
);

create index venta_pagos_venta on public.venta_pagos (venta_id);

create trigger venta_pagos_solo_agregar
  before update or delete on public.venta_pagos
  for each row execute function public.solo_agregar();

-- ---------------------------------------------------------------------------
-- Movimientos de caja
-- ---------------------------------------------------------------------------

create table public.movimientos_caja (
  id              bigint generated always as identity primary key,
  turno_id        uuid not null references public.turnos_caja (id),
  tipo            text not null check (tipo in ('venta', 'entrada', 'cancelacion', 'devolucion', 'retiro')),
  metodo          text not null check (metodo in ('efectivo', 'tarjeta', 'transferencia')),
  -- Positivo entra a la caja, negativo sale.
  monto           integer not null check (monto <> 0),
  concepto        text not null check (btrim(concepto) <> ''),
  venta_id        uuid references public.ventas (id),
  usuario_id      uuid not null references public.usuarios (id),
  autorizado_por  uuid references public.usuarios (id),
  creado_en       timestamptz not null default now(),
  check (
    (tipo in ('venta', 'entrada') and monto > 0)
    or (tipo in ('cancelacion', 'devolucion', 'retiro') and monto < 0)
  ),
  check (tipo not in ('venta', 'cancelacion', 'devolucion') or venta_id is not null)
);

create index movimientos_caja_turno on public.movimientos_caja (turno_id);

create function public.revisar_turno_abierto() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.turnos_caja where id = new.turno_id and cerrado_en is null) then
    raise exception 'El turno de caja está cerrado';
  end if;
  return new;
end;
$$;

create trigger movimientos_caja_turno_abierto
  before insert on public.movimientos_caja
  for each row execute function public.revisar_turno_abierto();

create trigger movimientos_caja_solo_agregar
  before update or delete on public.movimientos_caja
  for each row execute function public.solo_agregar();

-- ---------------------------------------------------------------------------
-- Movimientos de inventario (kardex)
-- ---------------------------------------------------------------------------

create table public.movimientos_inventario (
  id            bigint generated always as identity primary key,
  lote_id       uuid not null,
  producto_id   uuid not null,
  tipo          text not null check (tipo in (
                  'inventario_inicial', 'entrada', 'venta', 'devolucion', 'cancelacion', 'ajuste', 'merma'
                )),
  -- Positivo entra, negativo sale.
  cantidad      integer not null check (cantidad <> 0),
  -- Solo la carga inicial puede venir sin usuario.
  usuario_id    uuid references public.usuarios (id),
  referencia    text not null default '',
  motivo        text,
  recepcion_id  uuid references public.recepciones (id),
  venta_id      uuid references public.ventas (id),
  creado_en     timestamptz not null default now(),
  foreign key (lote_id, producto_id) references public.lotes (id, producto_id),
  check (usuario_id is not null or tipo = 'inventario_inicial'),
  check (
    (tipo in ('inventario_inicial', 'entrada', 'devolucion', 'cancelacion') and cantidad > 0)
    or (tipo in ('venta', 'merma') and cantidad < 0)
    or tipo = 'ajuste'
  ),
  check (tipo not in ('ajuste', 'merma') or btrim(coalesce(motivo, '')) <> ''),
  check (tipo <> 'entrada' or recepcion_id is not null),
  check (tipo not in ('venta', 'cancelacion', 'devolucion') or venta_id is not null)
);

create index movimientos_inventario_producto on public.movimientos_inventario (producto_id, creado_en desc);
create index movimientos_inventario_lote on public.movimientos_inventario (lote_id);

create function public.aplicar_movimiento() returns trigger
language plpgsql set search_path = '' as $$
declare
  lote public.lotes;
begin
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

create trigger movimientos_inventario_aplicar
  after insert on public.movimientos_inventario
  for each row execute function public.aplicar_movimiento();

create trigger movimientos_inventario_solo_agregar
  before update or delete on public.movimientos_inventario
  for each row execute function public.solo_agregar();

-- ---------------------------------------------------------------------------
-- Operaciones (RPC). Única forma de escribir ventas, caja, entradas y permisos.
-- Cada una revisa permisos y calcula en la base lo que no debe venir del cliente.
-- ---------------------------------------------------------------------------

-- Al iniciar sesión: guarda la fecha de acceso y lo anota en la bitácora.
create function public.registrar_acceso() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.usuario_activo() then
    raise exception 'Tu cuenta no está activa';
  end if;
  update public.usuarios set ultimo_acceso = now() where id = auth.uid();
  insert into public.bitacora (usuario_id, accion, entidad, entidad_id)
  values (auth.uid(), 'sesion.iniciar', 'usuarios', auth.uid()::text);
end;
$$;

create function public.marcar_contrasena_cambiada() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.usuarios set debe_cambiar_contrasena = false where id = auth.uid() and activo;
  insert into public.bitacora (usuario_id, accion, entidad, entidad_id)
  values (auth.uid(), 'contrasena.cambiar', 'usuarios', auth.uid()::text);
end;
$$;

-- Costos: solo con inventario.costos.
create function public.costos_productos()
returns table (producto_id uuid, costo integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tiene_permiso('inventario.costos') then
    raise exception 'No tienes permiso para ver costos';
  end if;
  return query select p.id, p.costo from public.productos p;
end;
$$;

create function public.guardar_permisos_empleado(p_permisos text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.tiene_permiso('permisos.gestionar') then
    raise exception 'No tienes permiso para cambiar permisos';
  end if;
  delete from public.rol_permisos where rol = 'empleado' and permiso <> all (coalesce(p_permisos, '{}'));
  insert into public.rol_permisos (rol, permiso)
  select 'empleado', x from unnest(coalesce(p_permisos, '{}')) as x
  on conflict do nothing;
end;
$$;

create function public.abrir_turno(p_fondo integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_caja  smallint;
  v_turno uuid;
begin
  if not public.tiene_permiso('caja.abrir') then
    raise exception 'No tienes permiso para abrir caja';
  end if;
  if p_fondo is null or p_fondo < 0 then
    raise exception 'El fondo inicial no es válido';
  end if;
  if exists (select 1 from public.turnos_caja where usuario_id = auth.uid() and cerrado_en is null) then
    raise exception 'Ya tienes una caja abierta';
  end if;

  select c.id into v_caja
  from public.cajas c
  where c.activa
    and not exists (select 1 from public.turnos_caja t where t.caja_id = c.id and t.cerrado_en is null)
  order by c.id
  limit 1
  for update;

  if v_caja is null then
    raise exception 'No hay cajas libres';
  end if;

  insert into public.turnos_caja (caja_id, usuario_id, fondo_inicial)
  values (v_caja, auth.uid(), p_fondo)
  returning id into v_turno;
  return v_turno;
end;
$$;

-- Cierra la caja de quien llama. El efectivo esperado sale de los movimientos.
create function public.cerrar_turno(p_contado integer, p_conteo jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  turno public.turnos_caja;
begin
  if not public.tiene_permiso('caja.cerrar') then
    raise exception 'No tienes permiso para cerrar caja';
  end if;
  if p_contado is null or p_contado < 0 then
    raise exception 'El efectivo contado no es válido';
  end if;

  update public.turnos_caja t
  set cerrado_en = now(),
      efectivo_contado = p_contado,
      conteo = p_conteo,
      efectivo_esperado = t.fondo_inicial + coalesce((
        select sum(m.monto) from public.movimientos_caja m
        where m.turno_id = t.id and m.metodo = 'efectivo'
      ), 0)
  where t.usuario_id = auth.uid() and t.cerrado_en is null
  returning * into turno;

  if not found then
    raise exception 'No tienes una caja abierta';
  end if;
  return jsonb_build_object(
    'contado', turno.efectivo_contado,
    'esperado', turno.efectivo_esperado,
    'diferencia', turno.diferencia
  );
end;
$$;

-- Cobra una venta. p_partidas: [{"producto_id": "...", "cantidad": 2}, ...]
-- Precio e IVA salen del catálogo y los lotes se asignan aquí (FEFO).
create function public.registrar_venta(
  p_partidas   jsonb,
  p_metodo     text,
  p_recibido   integer default null,
  p_referencia text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario  uuid := auth.uid();
  v_turno    uuid;
  v_venta    uuid;
  v_folio    bigint;
  v_texto    text;
  v_total    integer;
  v_subtotal integer;
  v_recibido integer;
  v_faltan   integer;
  v_tomar    integer;
  r          record;
  l          record;
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

  for r in
    select x.producto_id, x.cantidad, p.nombre, p.precio, p.iva
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
      insert into public.venta_partidas (venta_id, producto_id, lote_id, cantidad, precio, iva, importe)
      values (v_venta, r.producto_id, l.id, v_tomar, r.precio, r.iva, r.precio * v_tomar);
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
    'cambio', case when p_metodo = 'efectivo' then v_recibido - v_total end
  );
end;
$$;

-- Registra mercancía recibida.
-- p_partidas: [{"producto_id": "...", "lote": "AB12", "caducidad": "2027-05-31", "cantidad": 10, "costo": 4200}, ...]
create function public.registrar_entrada(
  p_proveedor uuid,
  p_factura   text,
  p_fecha     date,
  p_partidas  jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_recepcion uuid;
  v_lote      uuid;
  v_total     integer := 0;
  v_piezas    integer := 0;
  r           record;
begin
  if not public.tiene_permiso('inventario.entrada') then
    raise exception 'No tienes permiso para recibir mercancía';
  end if;
  if p_partidas is null or jsonb_typeof(p_partidas) <> 'array' or jsonb_array_length(p_partidas) = 0 then
    raise exception 'La entrada no tiene productos';
  end if;
  if btrim(coalesce(p_factura, '')) = '' then
    raise exception 'Escribe la factura o remisión';
  end if;
  if p_fecha is null or p_fecha > public.hoy_local() then
    raise exception 'La fecha de recepción no puede ser futura';
  end if;
  if not exists (select 1 from public.proveedores where id = p_proveedor and activo) then
    raise exception 'El proveedor no existe o está inactivo';
  end if;
  if exists (select 1 from public.recepciones where proveedor_id = p_proveedor and factura = btrim(p_factura)) then
    raise exception 'Esa factura de ese proveedor ya se registró';
  end if;

  insert into public.recepciones (proveedor_id, factura, fecha, usuario_id)
  values (p_proveedor, btrim(p_factura), p_fecha, auth.uid())
  returning id into v_recepcion;

  for r in
    select * from jsonb_to_recordset(p_partidas)
      as x(producto_id uuid, lote text, caducidad date, cantidad integer, costo integer)
  loop
    if r.cantidad is null or r.cantidad <= 0 then
      raise exception 'Hay una cantidad no válida';
    end if;
    if r.costo is null or r.costo < 0 then
      raise exception 'Hay un costo no válido';
    end if;
    if btrim(coalesce(r.lote, '')) = '' or r.caducidad is null then
      raise exception 'Cada producto necesita lote y caducidad';
    end if;
    if r.caducidad < public.hoy_local() then
      raise exception 'El lote % ya caducó: no lo recibas', r.lote;
    end if;
    if not exists (select 1 from public.productos where id = r.producto_id and activo) then
      raise exception 'Uno de los productos no existe o está inactivo';
    end if;

    insert into public.lotes (producto_id, numero, caducidad, costo)
    values (r.producto_id, upper(btrim(r.lote)), r.caducidad, r.costo)
    on conflict (producto_id, numero, caducidad) do update set costo = excluded.costo
    returning id into v_lote;

    insert into public.recepcion_partidas (recepcion_id, lote_id, cantidad, costo)
    values (v_recepcion, v_lote, r.cantidad, r.costo);

    insert into public.movimientos_inventario (lote_id, producto_id, tipo, cantidad, usuario_id, referencia, recepcion_id)
    values (v_lote, r.producto_id, 'entrada', r.cantidad, auth.uid(), 'Factura ' || btrim(p_factura), v_recepcion);

    v_total := v_total + r.cantidad * r.costo;
    v_piezas := v_piezas + r.cantidad;
  end loop;

  update public.recepciones set total = v_total where id = v_recepcion;

  return jsonb_build_object('recepcion_id', v_recepcion, 'piezas', v_piezas, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- Vistas (security_invoker: respetan las reglas RLS de quien consulta)
-- ---------------------------------------------------------------------------

create view public.permisos_efectivos with (security_invoker = true) as
select u.id as usuario_id, p.clave as permiso
from public.usuarios u
cross join public.permisos p
left join public.rol_permisos rp on rp.rol = u.rol and rp.permiso = p.clave
left join public.usuario_permisos up on up.usuario_id = u.id and up.permiso = p.clave
where u.activo
  and (u.rol = 'admin' or (not p.solo_admin and coalesce(up.concedido, rp.permiso is not null)));

create view public.existencias with (security_invoker = true) as
select
  p.id as producto_id,
  coalesce(sum(l.cantidad) filter (where l.estado = 'disponible' and l.caducidad >= public.hoy_local()), 0)::integer as vendible,
  coalesce(sum(l.cantidad), 0)::integer as total,
  min(l.caducidad) filter (where l.cantidad > 0 and l.estado = 'disponible' and l.caducidad >= public.hoy_local()) as proxima_caducidad
from public.productos p
left join public.lotes l on l.producto_id = p.id
where p.activo
group by p.id;

create view public.lotes_por_caducar with (security_invoker = true) as
select
  l.id, l.producto_id, p.nombre as producto, l.numero, l.caducidad, l.cantidad, l.estado,
  l.caducidad - public.hoy_local() as dias
from public.lotes l
join public.productos p on p.id = l.producto_id
where l.cantidad > 0
  and l.caducidad <= public.hoy_local() + coalesce((select n.dias_aviso_caducidad from public.negocio n where n.id = 1), 90);

create view public.kardex with (security_invoker = true) as
select
  m.id, m.creado_en, m.producto_id, m.lote_id, l.numero as lote, m.tipo, m.cantidad,
  m.usuario_id, u.nombre as usuario, m.referencia, m.motivo
from public.movimientos_inventario m
join public.lotes l on l.id = m.lote_id
left join public.usuarios u on u.id = m.usuario_id;

create view public.ventas_de_hoy with (security_invoker = true) as
select
  v.id, v.folio, v.creado_en, v.usuario_id, u.nombre as cajero, v.total, v.estado,
  (select string_agg(distinct pg.metodo, ',') from public.venta_pagos pg where pg.venta_id = v.id) as metodo,
  (select coalesce(sum(vp.cantidad), 0) from public.venta_partidas vp where vp.venta_id = v.id)::integer as piezas
from public.ventas v
left join public.usuarios u on u.id = v.usuario_id
where v.creado_en > now() - interval '2 days'
  and (v.creado_en at time zone public.zona_horaria())::date = public.hoy_local();

-- Resumen en vivo de cada turno. Con la caja abierta, el efectivo esperado
-- solo lo ve quien supervisa cajas (corte ciego).
create view public.resumen_turnos with (security_invoker = true) as
select
  t.id, t.caja_id, c.nombre as caja, t.usuario_id, t.abierto_en, t.cerrado_en, t.fondo_inicial,
  coalesce(sum(m.monto) filter (where m.tipo = 'venta' and m.metodo = 'tarjeta'), 0)::integer as ventas_tarjeta,
  coalesce(sum(m.monto) filter (where m.tipo = 'venta' and m.metodo = 'transferencia'), 0)::integer as ventas_transferencia,
  count(m.id) filter (where m.tipo = 'venta')::integer as ventas,
  case when t.cerrado_en is not null or public.tiene_permiso('caja.ver_todas') then
    coalesce(sum(m.monto) filter (where m.tipo = 'venta' and m.metodo = 'efectivo'), 0)::integer
  end as ventas_efectivo,
  case when t.cerrado_en is not null or public.tiene_permiso('caja.ver_todas') then
    coalesce(sum(m.monto) filter (where m.tipo = 'retiro'), 0)::integer
  end as retiros,
  case when t.cerrado_en is not null or public.tiene_permiso('caja.ver_todas') then
    (t.fondo_inicial + coalesce(sum(m.monto) filter (where m.metodo = 'efectivo'), 0))::integer
  end as efectivo_esperado,
  t.efectivo_contado,
  t.diferencia
from public.turnos_caja t
join public.cajas c on c.id = t.caja_id
left join public.movimientos_caja m on m.turno_id = t.id
group by t.id, c.nombre;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.negocio                enable row level security;
alter table public.roles                  enable row level security;
alter table public.permisos               enable row level security;
alter table public.rol_permisos           enable row level security;
alter table public.usuarios               enable row level security;
alter table public.usuario_permisos       enable row level security;
alter table public.bitacora               enable row level security;
alter table public.categorias             enable row level security;
alter table public.productos              enable row level security;
alter table public.proveedores            enable row level security;
alter table public.lotes                  enable row level security;
alter table public.recepciones            enable row level security;
alter table public.recepcion_partidas     enable row level security;
alter table public.cajas                  enable row level security;
alter table public.turnos_caja            enable row level security;
alter table public.ventas                 enable row level security;
alter table public.recetas                enable row level security;
alter table public.venta_partidas         enable row level security;
alter table public.venta_pagos            enable row level security;
alter table public.movimientos_caja       enable row level security;
alter table public.movimientos_inventario enable row level security;

-- Lectura general para cualquier cuenta activa.
create policy "cuentas activas leen" on public.negocio for select to authenticated using ((select public.usuario_activo()));
create policy "cuentas activas leen" on public.roles for select to authenticated using ((select public.usuario_activo()));
create policy "cuentas activas leen" on public.permisos for select to authenticated using ((select public.usuario_activo()));
create policy "cuentas activas leen" on public.rol_permisos for select to authenticated using ((select public.usuario_activo()));
create policy "cuentas activas leen" on public.cajas for select to authenticated using ((select public.usuario_activo()));

create policy "configuración edita negocio" on public.negocio for update to authenticated
  using ((select public.tiene_permiso('configuracion.editar')))
  with check ((select public.tiene_permiso('configuracion.editar')));
create policy "configuración administra cajas" on public.cajas for all to authenticated
  using ((select public.tiene_permiso('configuracion.editar')))
  with check ((select public.tiene_permiso('configuracion.editar')));

-- Usuarios: cada quien ve su cuenta; quien gestiona usuarios ve y edita todas.
create policy "ver su cuenta o gestionar" on public.usuarios for select to authenticated
  using (id = (select auth.uid()) or (select public.tiene_permiso('usuarios.gestionar')));
create policy "gestionar usuarios crea" on public.usuarios for insert to authenticated
  with check ((select public.tiene_permiso('usuarios.gestionar')));
create policy "gestionar usuarios edita" on public.usuarios for update to authenticated
  using ((select public.tiene_permiso('usuarios.gestionar')))
  with check ((select public.tiene_permiso('usuarios.gestionar')));

create policy "ver sus excepciones o gestionar" on public.usuario_permisos for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.tiene_permiso('permisos.gestionar')));
create policy "gestionar permisos edita excepciones" on public.usuario_permisos for all to authenticated
  using ((select public.tiene_permiso('permisos.gestionar')))
  with check ((select public.tiene_permiso('permisos.gestionar')));

create policy "gestionar usuarios lee bitácora" on public.bitacora for select to authenticated
  using ((select public.tiene_permiso('usuarios.gestionar')));

-- Catálogo
create policy "inventario o venta leen" on public.categorias for select to authenticated
  using ((select public.usuario_activo()));
create policy "alta de productos administra categorías" on public.categorias for all to authenticated
  using ((select public.tiene_permiso('productos.crear')))
  with check ((select public.tiene_permiso('productos.crear')));

create policy "inventario o venta leen" on public.productos for select to authenticated
  using (
    (select public.tiene_permiso('inventario.ver'))
    or (select public.tiene_permiso('ventas.vender'))
    or (select public.tiene_permiso('inventario.entrada'))
  );
create policy "alta de productos" on public.productos for insert to authenticated
  with check ((select public.tiene_permiso('productos.crear')));
create policy "editar productos o precios" on public.productos for update to authenticated
  using ((select public.tiene_permiso('productos.editar')) or (select public.tiene_permiso('productos.precios')))
  with check ((select public.tiene_permiso('productos.editar')) or (select public.tiene_permiso('productos.precios')));

create policy "inventario lee proveedores" on public.proveedores for select to authenticated
  using ((select public.tiene_permiso('inventario.ver')) or (select public.tiene_permiso('inventario.entrada')));
create policy "alta de productos administra proveedores" on public.proveedores for all to authenticated
  using ((select public.tiene_permiso('productos.crear')))
  with check ((select public.tiene_permiso('productos.crear')));

-- Inventario: lectura con permiso; escritura solo por RPC.
create policy "inventario o venta leen" on public.lotes for select to authenticated
  using ((select public.tiene_permiso('inventario.ver')) or (select public.tiene_permiso('ventas.vender')));
create policy "inventario lee" on public.movimientos_inventario for select to authenticated
  using ((select public.tiene_permiso('inventario.ver')));
create policy "inventario lee" on public.recepciones for select to authenticated
  using ((select public.tiene_permiso('inventario.ver')));
create policy "costos leen" on public.recepcion_partidas for select to authenticated
  using ((select public.tiene_permiso('inventario.costos')));

-- Caja y ventas: cada quien lo suyo; supervisores, todo. Escritura solo por RPC.
create policy "su turno o supervisar" on public.turnos_caja for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.tiene_permiso('caja.ver_todas')));
create policy "su turno o supervisar" on public.movimientos_caja for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.tiene_permiso('caja.ver_todas')));
create policy "sus ventas o historial" on public.ventas for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.tiene_permiso('ventas.historial')));
create policy "ventas visibles" on public.venta_partidas for select to authenticated
  using (exists (select 1 from public.ventas v where v.id = venta_id));
create policy "ventas visibles" on public.venta_pagos for select to authenticated
  using (exists (select 1 from public.ventas v where v.id = venta_id));
create policy "ventas visibles" on public.recetas for select to authenticated
  using (exists (select 1 from public.ventas v where v.id = venta_id));

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------

-- Sin sesión no hay acceso a nada.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- TRUNCATE, REFERENCES y TRIGGER no pasan por RLS: nadie los necesita desde la app.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Costos ocultos: se leen con costos_productos() o con inventario.costos.
revoke select on public.productos from authenticated;
grant select (id, codigo_barras, nombre, sustancia, presentacion, laboratorio, categoria_id, clasificacion,
              precio, iva, stock_minimo, ubicacion, refrigerado, activo, busqueda, creado_en, actualizado_en)
  on public.productos to authenticated;
revoke select on public.lotes from authenticated;
grant select (id, producto_id, numero, caducidad, cantidad, estado, motivo_cuarentena, creado_en)
  on public.lotes to authenticated;

-- Funciones: solo usuarios con sesión.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.zona_horaria(),
  public.hoy_local(),
  public.tiene_permiso(text),
  public.usuario_activo(),
  public.registrar_acceso(),
  public.marcar_contrasena_cambiada(),
  public.costos_productos(),
  public.guardar_permisos_empleado(text[]),
  public.abrir_turno(integer),
  public.cerrar_turno(integer, jsonb),
  public.registrar_venta(jsonb, text, integer, text),
  public.registrar_entrada(uuid, text, date, jsonb)
  to authenticated;

-- Las funciones nuevas no quedan abiertas por omisión.
alter default privileges in schema public revoke execute on functions from public, anon;
