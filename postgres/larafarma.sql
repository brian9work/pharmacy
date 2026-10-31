-- LaraFarma · base de datos completa para PostgreSQL 15 o superior.
--
-- Mismo modelo y reglas que supabase/migrations/ (esquema, datos iniciales,
-- reportes y receta obligatoria), sin depender de Supabase:
--   · Las cuentas y contraseñas viven en public.usuarios (hash bcrypt con
--     pgcrypto). Ya no hay auth.users.
--   · Sesiones propias: iniciar_sesion() devuelve un token; la base guarda
--     solo su hash. En cada petición la aplicación hace, dentro de una
--     transacción:
--         select set_config('larafarma.token', '<token>', true);
--     y public.usuario_actual() reemplaza a auth.uid() en todas las reglas.
--   · La aplicación se conecta con un usuario miembro de larafarma_app. Las
--     reglas RLS y los privilegios aplican a ese rol. Quien carga este
--     archivo es el dueño de las tablas y no pasa por RLS.
--
-- Cargar en una base vacía:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f postgres/larafarma.sql
--
-- Después, como dueño de la base (no desde la aplicación):
--   1. Usuario con el que se conecta la aplicación:
--        create role larafarma_web login password '...' in role larafarma_app;
--   2. Primer administrador (debe cambiar la contraseña temporal al entrar):
--        select public.crear_primer_admin('Nombre', 'correo@ejemplo.com', 'contraseña temporal');
--
-- Equivalencias con la versión de Supabase:
--   auth.uid()                       → public.usuario_actual()
--   rol authenticated                → rol larafarma_app
--   Supabase Auth (acceso)           → iniciar_sesion(), cerrar_sesion()
--   registrar_acceso()               → lo hace iniciar_sesion()
--   updateUser + marcar_contrasena…  → cambiar_contrasena()
--   auth.admin.createUser            → crear_usuario()
--   Las demás funciones (registrar_venta, abrir_turno, cerrar_turno,
--   registrar_entrada, guardar_permisos_empleado, costos_productos,
--   reporte_ventas, exportar_ventas) tienen el mismo nombre y parámetros.

begin;

-- Búsqueda por nombre y hash de contraseñas.
-- En su propio esquema, como en Supabase: así los privilegios de public no las tocan.
create schema if not exists extensiones;
create extension if not exists pg_trgm with schema extensiones;
create extension if not exists pgcrypto with schema extensiones;

-- Rol de la aplicación. No inicia sesión: se le dan miembros con login.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'larafarma_app') then
    create role larafarma_app nologin;
  end if;
end;
$$;

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
-- Usuarios, sesiones, roles y permisos
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

-- Cuenta, contraseña y estado. La contraseña solo se guarda como hash bcrypt.
create table public.usuarios (
  id                       uuid primary key default gen_random_uuid(),
  nombre                   text not null check (btrim(nombre) <> ''),
  correo                   text not null unique check (correo = lower(btrim(correo)) and correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  hash_contrasena          text not null,
  rol                      text not null references public.roles (clave),
  activo                   boolean not null default true,
  debe_cambiar_contrasena  boolean not null default true,
  -- Tras 5 intentos fallidos la cuenta espera 15 minutos.
  intentos_fallidos        integer not null default 0 check (intentos_fallidos >= 0),
  bloqueado_hasta          timestamptz,
  ultimo_acceso            timestamptz,
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now()
);

create trigger usuarios_actualizado_en
  before update on public.usuarios
  for each row execute function public.poner_actualizado_en();

-- Solo el hash (SHA-256) del token; el token viaja en una cookie httpOnly.
create table public.sesiones (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.usuarios (id) on delete cascade,
  token_hash   bytea not null unique,
  creada_en    timestamptz not null default now(),
  expira_en    timestamptz not null,
  revocada_en  timestamptz
);

create index sesiones_activas on public.sesiones (usuario_id) where revocada_en is null;

-- Quien hace la petición: el dueño de la sesión cuyo token puso la aplicación
-- con set_config('larafarma.token', ...). Sin token válido devuelve null.
create function public.usuario_actual() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.usuario_id
  from public.sesiones s
  join public.usuarios u on u.id = s.usuario_id and u.activo
  where s.token_hash = sha256(convert_to(nullif(current_setting('larafarma.token', true), ''), 'UTF8'))
    and s.revocada_en is null
    and s.expira_en > now();
$$;

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
    where u.id = public.usuario_actual()
      and u.activo
      and (u.rol = 'admin' or (not p.solo_admin and coalesce(up.concedido, rp.permiso is not null)))
  );
$$;

-- ¿Quien hace la petición tiene cuenta activa en la farmacia?
create function public.usuario_activo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usuarios where id = public.usuario_actual() and activo);
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

-- Al bloquear una cuenta se cierran todas sus sesiones.
create function public.cerrar_sesiones_al_bloquear() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.sesiones set revocada_en = now() where usuario_id = new.id and revocada_en is null;
  return null;
end;
$$;

create trigger usuarios_cerrar_sesiones
  after update of activo on public.usuarios
  for each row when (old.activo and not new.activo)
  execute function public.cerrar_sesiones_al_bloquear();

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
declare
  -- El hash nunca llega a la bitácora. Fechas de acceso y contadores de
  -- intentos tampoco cuentan como cambio.
  v_omitir  text[] := array['hash_contrasena', 'intentos_fallidos', 'bloqueado_hasta', 'ultimo_acceso', 'actualizado_en'];
  v_antes   jsonb;
  v_despues jsonb;
begin
  if tg_op <> 'INSERT' then
    v_antes := to_jsonb(old) - v_omitir;
  end if;
  if tg_op <> 'DELETE' then
    v_despues := to_jsonb(new) - v_omitir;
  end if;
  if tg_op = 'UPDATE' and v_antes = v_despues then
    return null;
  end if;

  insert into public.bitacora (usuario_id, accion, entidad, entidad_id, antes, despues)
  values (
    public.usuario_actual(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(v_despues ->> 'id', v_antes ->> 'id', v_despues ->> 'permiso', v_antes ->> 'permiso'),
    v_antes,
    v_despues
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
  id               uuid primary key default gen_random_uuid(),
  codigo_barras    text unique check (codigo_barras ~ '^[0-9A-Za-z-]{4,32}$'),
  nombre           text not null check (btrim(nombre) <> ''),
  sustancia        text not null default '',
  presentacion     text not null default '',
  laboratorio      text not null default '',
  categoria_id     integer references public.categorias (id),
  -- libre: sin receta · antibiotico: receta obligatoria · controlado: receta retenida
  clasificacion    text not null default 'libre' check (clasificacion in ('libre', 'antibiotico', 'controlado')),
  -- La casilla "Requiere receta médica". Antibióticos y controlados la tienen siempre.
  requiere_receta  boolean not null default false,
  -- Precio de venta con IVA incluido, en centavos.
  precio           integer not null check (precio >= 0),
  -- Solo visible con el permiso inventario.costos (ver costos_productos()).
  costo            integer not null default 0 check (costo >= 0),
  iva              smallint not null default 0 check (iva in (0, 16)),
  stock_minimo     integer not null default 0 check (stock_minimo >= 0),
  ubicacion        text not null default '',
  refrigerado      boolean not null default false,
  activo           boolean not null default true,
  -- Texto en minúsculas y sin acentos para buscar "amoxicilina" o "losartan".
  busqueda         text generated always as (
    translate(lower(nombre || ' ' || sustancia || ' ' || laboratorio), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')
  ) stored,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  constraint productos_receta_check check (clasificacion = 'libre' or requiere_receta)
);

create index productos_busqueda on public.productos using gin (busqueda extensiones.gin_trgm_ops);

create trigger productos_actualizado_en
  before update on public.productos
  for each row execute function public.poner_actualizado_en();

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

-- Precio y costo piden productos.precios; el resto de los datos (receta
-- incluida), productos.editar.
create function public.revisar_cambio_producto() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.usuario_actual() is null then
    return new; -- psql como dueño de la base
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

-- simple: producto con la casilla que no es antibiótico ni controlado.
create table public.recetas (
  id              uuid primary key default gen_random_uuid(),
  venta_id        uuid not null references public.ventas (id),
  tipo            text not null constraint recetas_tipo_check check (tipo in ('simple', 'antibiotico', 'controlado')),
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
-- Cuentas y sesiones (reemplazan a Supabase Auth)
-- ---------------------------------------------------------------------------

-- Valida la contraseña nueva. bcrypt solo usa los primeros 72 bytes.
create function public.revisar_contrasena(p_contrasena text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_contrasena is null or length(p_contrasena) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres';
  end if;
  if octet_length(p_contrasena) > 72 then
    raise exception 'La contraseña es demasiado larga';
  end if;
end;
$$;

-- Inicia sesión. No lanza error al fallar (así se guarda el intento) y
-- devuelve {"ok": false, "error": "..."}. Con éxito devuelve el token, que
-- la aplicación guarda en una cookie httpOnly; la base solo guarda su hash.
create function public.iniciar_sesion(p_correo text, p_contrasena text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u        public.usuarios;
  v_token  text;
  v_valida boolean;
begin
  select * into u from public.usuarios where correo = lower(btrim(coalesce(p_correo, ''))) for update;

  if not found then
    -- Mismo trabajo que con una cuenta real: el tiempo no revela qué correos existen.
    perform extensiones.crypt(coalesce(p_contrasena, ''), extensiones.gen_salt('bf', 10));
    return jsonb_build_object('ok', false, 'error', 'Correo o contraseña incorrectos');
  end if;

  if u.bloqueado_hasta > now() then
    return jsonb_build_object('ok', false, 'error', 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo');
  end if;

  v_valida := u.hash_contrasena = extensiones.crypt(coalesce(p_contrasena, ''), u.hash_contrasena);

  if not v_valida then
    update public.usuarios
    set intentos_fallidos = case when intentos_fallidos + 1 >= 5 then 0 else intentos_fallidos + 1 end,
        bloqueado_hasta = case when intentos_fallidos + 1 >= 5 then now() + interval '15 minutes' end
    where id = u.id;
    insert into public.bitacora (usuario_id, accion, entidad, entidad_id)
    values (u.id, 'sesion.fallida', 'usuarios', u.id::text);
    return jsonb_build_object('ok', false, 'error', 'Correo o contraseña incorrectos');
  end if;

  if not u.activo then
    return jsonb_build_object('ok', false, 'error', 'Tu cuenta no está activa');
  end if;

  v_token := encode(extensiones.gen_random_bytes(32), 'hex');
  insert into public.sesiones (usuario_id, token_hash, expira_en)
  values (u.id, sha256(convert_to(v_token, 'UTF8')), now() + interval '12 hours');

  update public.usuarios
  set intentos_fallidos = 0, bloqueado_hasta = null, ultimo_acceso = now()
  where id = u.id;
  insert into public.bitacora (usuario_id, accion, entidad, entidad_id)
  values (u.id, 'sesion.iniciar', 'usuarios', u.id::text);

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'usuario_id', u.id,
    'debe_cambiar_contrasena', u.debe_cambiar_contrasena
  );
end;
$$;

-- Cierra la sesión del token actual.
create function public.cerrar_sesion() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.sesiones
  set revocada_en = now()
  where token_hash = sha256(convert_to(nullif(current_setting('larafarma.token', true), ''), 'UTF8'))
    and revocada_en is null;
end;
$$;

-- Cambia la contraseña propia (también la temporal de la primera entrada).
-- Cierra las demás sesiones de la persona.
create function public.cambiar_contrasena(p_actual text, p_nueva text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := public.usuario_actual();
  v_hash    text;
begin
  if v_usuario is null then
    raise exception 'Inicia sesión para cambiar tu contraseña';
  end if;
  select hash_contrasena into v_hash from public.usuarios where id = v_usuario;
  if v_hash <> extensiones.crypt(coalesce(p_actual, ''), v_hash) then
    raise exception 'La contraseña actual no es correcta';
  end if;
  perform public.revisar_contrasena(p_nueva);
  if p_nueva = p_actual then
    raise exception 'La contraseña nueva debe ser distinta de la actual';
  end if;

  update public.usuarios
  set hash_contrasena = extensiones.crypt(p_nueva, extensiones.gen_salt('bf', 10)),
      debe_cambiar_contrasena = false
  where id = v_usuario;

  update public.sesiones
  set revocada_en = now()
  where usuario_id = v_usuario
    and revocada_en is null
    and token_hash <> sha256(convert_to(current_setting('larafarma.token', true), 'UTF8'));

  insert into public.bitacora (usuario_id, accion, entidad, entidad_id)
  values (v_usuario, 'contrasena.cambiar', 'usuarios', v_usuario::text);
end;
$$;

-- Alta de una cuenta con contraseña temporal. Pide usuarios.gestionar.
create function public.crear_usuario(p_nombre text, p_correo text, p_contrasena text, p_rol text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.tiene_permiso('usuarios.gestionar') then
    raise exception 'No tienes permiso para crear usuarios';
  end if;
  if not exists (select 1 from public.roles where clave = p_rol) then
    raise exception 'El rol no existe';
  end if;
  if exists (select 1 from public.usuarios where correo = lower(btrim(coalesce(p_correo, '')))) then
    raise exception 'Ya existe una cuenta con ese correo';
  end if;
  perform public.revisar_contrasena(p_contrasena);

  insert into public.usuarios (nombre, correo, hash_contrasena, rol)
  values (btrim(p_nombre), lower(btrim(p_correo)), extensiones.crypt(p_contrasena, extensiones.gen_salt('bf', 10)), p_rol)
  returning id into v_id;
  return v_id;
end;
$$;

-- Pone una contraseña temporal a otra cuenta y cierra sus sesiones.
create function public.restablecer_contrasena(p_usuario uuid, p_temporal text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.tiene_permiso('usuarios.gestionar') then
    raise exception 'No tienes permiso para gestionar usuarios';
  end if;
  perform public.revisar_contrasena(p_temporal);

  update public.usuarios
  set hash_contrasena = extensiones.crypt(p_temporal, extensiones.gen_salt('bf', 10)),
      debe_cambiar_contrasena = true,
      intentos_fallidos = 0,
      bloqueado_hasta = null
  where id = p_usuario;
  if not found then
    raise exception 'La cuenta no existe';
  end if;

  update public.sesiones set revocada_en = now() where usuario_id = p_usuario and revocada_en is null;

  insert into public.bitacora (usuario_id, accion, entidad, entidad_id)
  values (public.usuario_actual(), 'contrasena.restablecer', 'usuarios', p_usuario::text);
end;
$$;

-- Primer administrador. Solo funciona con la tabla de usuarios vacía y solo
-- la ejecuta el dueño de la base (la aplicación no tiene permiso).
create function public.crear_primer_admin(p_nombre text, p_correo text, p_contrasena text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.usuarios) then
    raise exception 'Ya hay usuarios: crea los demás desde la pantalla Usuarios';
  end if;
  perform public.revisar_contrasena(p_contrasena);

  insert into public.usuarios (nombre, correo, hash_contrasena, rol)
  values (btrim(p_nombre), lower(btrim(p_correo)), extensiones.crypt(p_contrasena, extensiones.gen_salt('bf', 10)), 'admin')
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Operaciones. Única forma de escribir ventas, caja, entradas y permisos.
-- Cada una revisa permisos y calcula en la base lo que no debe venir del cliente.
-- ---------------------------------------------------------------------------

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
  v_usuario uuid := public.usuario_actual();
  v_caja    smallint;
  v_turno   uuid;
begin
  if not public.tiene_permiso('caja.abrir') then
    raise exception 'No tienes permiso para abrir caja';
  end if;
  if p_fondo is null or p_fondo < 0 then
    raise exception 'El fondo inicial no es válido';
  end if;
  if exists (select 1 from public.turnos_caja where usuario_id = v_usuario and cerrado_en is null) then
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
  values (v_caja, v_usuario, p_fondo)
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
  where t.usuario_id = public.usuario_actual() and t.cerrado_en is null
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
  v_usuario      uuid := public.usuario_actual();
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
  v_usuario   uuid := public.usuario_actual();
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
  values (p_proveedor, btrim(p_factura), p_fecha, v_usuario)
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
    values (v_lote, r.producto_id, 'entrada', r.cantidad, v_usuario, 'Factura ' || btrim(p_factura), v_recepcion);

    v_total := v_total + r.cantidad * r.costo;
    v_piezas := v_piezas + r.cantidad;
  end loop;

  update public.recepciones set total = v_total where id = v_recepcion;

  return jsonb_build_object('recepcion_id', v_recepcion, 'piezas', v_piezas, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reportes financieros. Solo con el permiso reportes.ver.
--
--   Ventas          total cobrado con IVA (sin canceladas)
--   Ventas sin IVA  base para calcular utilidad
--   Costo           piezas vendidas × costo del lote del que salieron
--   Utilidad bruta  ventas sin IVA − costo
--   Compras         mercancía recibida en el periodo (costo capturado en la entrada)
--   Mermas          piezas dadas de baja × costo del lote
-- ---------------------------------------------------------------------------

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
alter table public.sesiones               enable row level security;
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

-- sesiones no tiene reglas: solo la tocan las funciones de cuentas.

-- Lectura general para cualquier cuenta activa.
create policy "cuentas activas leen" on public.negocio for select to larafarma_app using ((select public.usuario_activo()));
create policy "cuentas activas leen" on public.roles for select to larafarma_app using ((select public.usuario_activo()));
create policy "cuentas activas leen" on public.permisos for select to larafarma_app using ((select public.usuario_activo()));
create policy "cuentas activas leen" on public.rol_permisos for select to larafarma_app using ((select public.usuario_activo()));
create policy "cuentas activas leen" on public.cajas for select to larafarma_app using ((select public.usuario_activo()));

create policy "configuración edita negocio" on public.negocio for update to larafarma_app
  using ((select public.tiene_permiso('configuracion.editar')))
  with check ((select public.tiene_permiso('configuracion.editar')));
create policy "configuración administra cajas" on public.cajas for all to larafarma_app
  using ((select public.tiene_permiso('configuracion.editar')))
  with check ((select public.tiene_permiso('configuracion.editar')));

-- Usuarios: cada quien ve su cuenta; quien gestiona usuarios ve y edita todas.
-- Las altas son con crear_usuario().
create policy "ver su cuenta o gestionar" on public.usuarios for select to larafarma_app
  using (id = (select public.usuario_actual()) or (select public.tiene_permiso('usuarios.gestionar')));
create policy "gestionar usuarios edita" on public.usuarios for update to larafarma_app
  using ((select public.tiene_permiso('usuarios.gestionar')))
  with check ((select public.tiene_permiso('usuarios.gestionar')));

create policy "ver sus excepciones o gestionar" on public.usuario_permisos for select to larafarma_app
  using (usuario_id = (select public.usuario_actual()) or (select public.tiene_permiso('permisos.gestionar')));
create policy "gestionar permisos edita excepciones" on public.usuario_permisos for all to larafarma_app
  using ((select public.tiene_permiso('permisos.gestionar')))
  with check ((select public.tiene_permiso('permisos.gestionar')));

create policy "gestionar usuarios lee bitácora" on public.bitacora for select to larafarma_app
  using ((select public.tiene_permiso('usuarios.gestionar')));

-- Catálogo
create policy "inventario o venta leen" on public.categorias for select to larafarma_app
  using ((select public.usuario_activo()));
create policy "alta de productos administra categorías" on public.categorias for all to larafarma_app
  using ((select public.tiene_permiso('productos.crear')))
  with check ((select public.tiene_permiso('productos.crear')));

create policy "inventario o venta leen" on public.productos for select to larafarma_app
  using (
    (select public.tiene_permiso('inventario.ver'))
    or (select public.tiene_permiso('ventas.vender'))
    or (select public.tiene_permiso('inventario.entrada'))
  );
create policy "alta de productos" on public.productos for insert to larafarma_app
  with check ((select public.tiene_permiso('productos.crear')));
create policy "editar productos o precios" on public.productos for update to larafarma_app
  using ((select public.tiene_permiso('productos.editar')) or (select public.tiene_permiso('productos.precios')))
  with check ((select public.tiene_permiso('productos.editar')) or (select public.tiene_permiso('productos.precios')));

create policy "inventario lee proveedores" on public.proveedores for select to larafarma_app
  using ((select public.tiene_permiso('inventario.ver')) or (select public.tiene_permiso('inventario.entrada')));
create policy "alta de productos administra proveedores" on public.proveedores for all to larafarma_app
  using ((select public.tiene_permiso('productos.crear')))
  with check ((select public.tiene_permiso('productos.crear')));

-- Inventario: lectura con permiso; escritura solo por funciones.
create policy "inventario o venta leen" on public.lotes for select to larafarma_app
  using ((select public.tiene_permiso('inventario.ver')) or (select public.tiene_permiso('ventas.vender')));
create policy "inventario lee" on public.movimientos_inventario for select to larafarma_app
  using ((select public.tiene_permiso('inventario.ver')));
create policy "inventario lee" on public.recepciones for select to larafarma_app
  using ((select public.tiene_permiso('inventario.ver')));
create policy "costos leen" on public.recepcion_partidas for select to larafarma_app
  using ((select public.tiene_permiso('inventario.costos')));

-- Caja y ventas: cada quien lo suyo; supervisores, todo. Escritura solo por funciones.
create policy "su turno o supervisar" on public.turnos_caja for select to larafarma_app
  using (usuario_id = (select public.usuario_actual()) or (select public.tiene_permiso('caja.ver_todas')));
create policy "su turno o supervisar" on public.movimientos_caja for select to larafarma_app
  using (usuario_id = (select public.usuario_actual()) or (select public.tiene_permiso('caja.ver_todas')));
create policy "sus ventas o historial" on public.ventas for select to larafarma_app
  using (usuario_id = (select public.usuario_actual()) or (select public.tiene_permiso('ventas.historial')));
create policy "ventas visibles" on public.venta_partidas for select to larafarma_app
  using (exists (select 1 from public.ventas v where v.id = venta_id));
create policy "ventas visibles" on public.venta_pagos for select to larafarma_app
  using (exists (select 1 from public.ventas v where v.id = venta_id));
create policy "ventas visibles" on public.recetas for select to larafarma_app
  using (exists (select 1 from public.ventas v where v.id = venta_id));

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

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------

revoke all on schema public from public;
grant usage on schema public, extensiones to larafarma_app;

-- Las reglas RLS deciden qué filas; estos privilegios, qué operaciones.
grant select, insert, update, delete on all tables in schema public to larafarma_app;
grant usage on all sequences in schema public to larafarma_app;

-- Sesiones: solo por funciones.
revoke all on public.sesiones from larafarma_app;

-- Subidas a la nube: se leen con las reglas; se escriben solo con funciones.
revoke insert, update, delete on public.sincronizaciones from larafarma_app;

-- Usuarios: el hash nunca sale de la base; altas y contraseñas por funciones.
revoke select, insert, update, delete on public.usuarios from larafarma_app;
grant select (id, nombre, correo, rol, activo, debe_cambiar_contrasena, intentos_fallidos, bloqueado_hasta,
              ultimo_acceso, creado_en, actualizado_en)
  on public.usuarios to larafarma_app;
grant update (nombre, correo, rol, activo) on public.usuarios to larafarma_app;

-- Costos ocultos: se leen con costos_productos() o con inventario.costos.
revoke select on public.productos from larafarma_app;
grant select (id, codigo_barras, nombre, sustancia, presentacion, laboratorio, categoria_id, clasificacion,
              requiere_receta, precio, iva, stock_minimo, ubicacion, refrigerado, activo, busqueda, creado_en, actualizado_en)
  on public.productos to larafarma_app;
revoke select on public.lotes from larafarma_app;
grant select (id, producto_id, numero, caducidad, cantidad, estado, motivo_cuarentena, creado_en)
  on public.lotes to larafarma_app;

-- Funciones: solo las que usa la aplicación.
revoke execute on all functions in schema public from public;
grant execute on function
  public.zona_horaria(),
  public.hoy_local(),
  public.usuario_actual(),
  public.tiene_permiso(text),
  public.usuario_activo(),
  public.iniciar_sesion(text, text),
  public.cerrar_sesion(),
  public.cambiar_contrasena(text, text),
  public.crear_usuario(text, text, text, text),
  public.restablecer_contrasena(uuid, text),
  public.costos_productos(),
  public.guardar_permisos_empleado(text[]),
  public.abrir_turno(integer),
  public.cerrar_turno(integer, jsonb),
  public.registrar_venta(jsonb, text, integer, text, jsonb),
  public.registrar_entrada(uuid, text, date, jsonb),
  public.reporte_ventas(date, date),
  public.exportar_ventas(date, date),
  public.iniciar_sincronizacion(),
  public.datos_para_subir(timestamptz),
  public.terminar_sincronizacion(bigint, boolean, jsonb, text)
  to larafarma_app;

-- Las funciones nuevas no quedan abiertas por omisión.
alter default privileges in schema public revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Datos iniciales obligatorios: negocio, caja, roles y permisos.
-- Mismas claves que config/permisos.ts.
-- ---------------------------------------------------------------------------

insert into public.negocio (id) values (1);

insert into public.cajas (nombre) values ('Caja 1');

insert into public.roles (clave, nombre, descripcion) values
  ('admin',    'Administrador', 'Tiene todos los permisos, siempre.'),
  ('empleado', 'Empleado',      'Solo los permisos que le asigne el administrador.');

insert into public.permisos (clave, modulo, nombre, descripcion, solo_admin) values
  ('ventas.vender',         'ventas',        'Vender',                         'Usar el punto de venta y cobrar.', false),
  ('ventas.descuento',      'ventas',        'Aplicar descuentos',             'Bajar el precio de un producto durante la venta.', false),
  ('ventas.cancelar',       'ventas',        'Cancelar ventas',                'Anular un ticket ya cobrado.', false),
  ('ventas.devolucion',     'ventas',        'Registrar devoluciones',         'Recibir producto de vuelta y regresar el dinero.', false),
  ('ventas.historial',      'ventas',        'Ver todas las ventas',           'Consultar las ventas de todos los cajeros.', false),
  ('caja.abrir',            'caja',          'Abrir su caja',                  'Empezar el turno con un fondo inicial.', false),
  ('caja.cerrar',           'caja',          'Cerrar su caja',                 'Contar el efectivo y hacer el corte de su turno.', false),
  ('caja.movimientos',      'caja',          'Retiros y entradas de efectivo', 'Sacar o meter efectivo durante el turno.', false),
  ('caja.ver_todas',        'caja',          'Ver cajas de otros',             'Consultar los cortes de todos los cajeros y ver el efectivo esperado.', false),
  ('inventario.ver',        'inventario',    'Consultar inventario',           'Ver existencias, lotes y caducidades.', false),
  ('inventario.entrada',    'inventario',    'Recibir mercancía',              'Registrar lo que llega del proveedor, con lote y caducidad.', false),
  ('inventario.ajuste',     'inventario',    'Ajustar existencias',            'Corregir cantidades después de un conteo.', false),
  ('inventario.merma',      'inventario',    'Registrar merma',                'Dar de baja producto caducado, dañado o perdido.', false),
  ('inventario.cuarentena', 'inventario',    'Bloquear lotes',                 'Impedir que se venda un lote, por ejemplo por un retiro sanitario.', false),
  ('inventario.costos',     'inventario',    'Ver costos y márgenes',          'Ver cuánto cuesta cada producto y cuánto deja.', false),
  ('productos.crear',       'productos',     'Dar de alta productos',          'Agregar productos, categorías y proveedores.', false),
  ('productos.editar',      'productos',     'Editar productos',               'Cambiar nombre, presentación o código de barras.', false),
  ('productos.precios',     'productos',     'Cambiar precios',                'Modificar el precio de venta.', false),
  ('reportes.ver',          'reportes',      'Ver reportes',                   'Ventas, utilidad y productos más vendidos.', false),
  ('usuarios.gestionar',    'usuarios',      'Gestionar usuarios',             'Crear, editar y bloquear usuarios.', true),
  ('permisos.gestionar',    'usuarios',      'Gestionar permisos',             'Decidir qué puede hacer el empleado.', true),
  ('configuracion.editar',  'configuracion', 'Editar configuración',           'Datos del negocio, impresora de tickets y cajas.', false);

-- Permisos iniciales del empleado. Después se cambian desde la pantalla Permisos.
insert into public.rol_permisos (rol, permiso) values
  ('empleado', 'ventas.vender'),
  ('empleado', 'caja.abrir'),
  ('empleado', 'caja.cerrar'),
  ('empleado', 'inventario.ver'),
  ('empleado', 'inventario.entrada');

commit;
