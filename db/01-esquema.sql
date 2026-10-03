-- Esquema del sistema de farmacia · PostgreSQL 14 o superior.
--
-- Orden de carga (en una base vacía):
--   1. 01-esquema.sql           tablas, reglas y vistas
--   2. 02-datos-iniciales.sql   roles, permisos, negocio y caja
--   3. 03-datos-demo.sql        productos y lotes de ejemplo (opcional)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/01-esquema.sql
--
-- Reglas que la base cumple sola, aunque la aplicación falle:
--   · Dinero en centavos (integer): $35.50 = 3550.
--   · La existencia de un lote solo cambia con un movimiento de inventario,
--     y nunca queda en negativo: si no alcanza, toda la venta se revierte.
--   · No se vende de lotes caducados ni bloqueados.
--   · Movimientos de inventario y de caja, partidas, pagos, recetas y
--     bitácora no se editan ni se borran. Las ventas se cancelan, no se borran.
--   · Una caja abierta por persona y un turno abierto por caja.
--   · El efectivo esperado del corte lo calcula la base, no quien cobra.
--   · Ningún empleado recibe permisos de administrador y siempre queda
--     al menos un administrador activo.

begin;

-- Búsqueda rápida de productos por nombre (viene con PostgreSQL).
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

create function poner_actualizado_en() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create function solo_agregar() returns trigger
language plpgsql as $$
begin
  raise exception 'Los registros de % no se modifican ni se borran', tg_table_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Negocio
-- ---------------------------------------------------------------------------

-- Una sola fila. El nombre comercial y el logo están en config/marca.ts.
create table negocio (
  id                    smallint primary key default 1 check (id = 1),
  razon_social          text not null default '',
  rfc                   text not null default '',
  direccion             text not null default '',
  telefono              text not null default '',
  pie_ticket            text not null default 'Gracias por su compra',
  zona_horaria          text not null default 'America/Mexico_City',
  dias_aviso_caducidad  integer not null default 90 check (dias_aviso_caducidad > 0)
);

-- Fecha de hoy en la zona horaria de la farmacia, no la del servidor.
create function hoy_local() returns date
language sql stable as $$
  select (now() at time zone coalesce((select zona_horaria from negocio where id = 1), 'America/Mexico_City'))::date;
$$;

-- ---------------------------------------------------------------------------
-- Usuarios, roles y permisos
-- ---------------------------------------------------------------------------

create table roles (
  clave        text primary key,
  nombre       text not null,
  descripcion  text not null default ''
);

create table permisos (
  clave        text primary key,
  modulo       text not null,
  nombre       text not null,
  descripcion  text not null default '',
  -- Nunca se da a un rol distinto de admin.
  solo_admin   boolean not null default false
);

create table rol_permisos (
  rol      text not null references roles (clave) on delete cascade,
  permiso  text not null references permisos (clave) on delete cascade,
  primary key (rol, permiso)
);

create table usuarios (
  id                       uuid primary key default gen_random_uuid(),
  nombre                   text not null check (btrim(nombre) <> ''),
  usuario                  text not null unique check (usuario ~ '^[a-z0-9._-]{3,32}$'),
  hash_contrasena          text not null,
  -- PIN corto para cambiar de cajero o autorizar en caja (también con hash).
  hash_pin                 text,
  rol                      text not null references roles (clave),
  activo                   boolean not null default true,
  debe_cambiar_contrasena  boolean not null default true,
  intentos_fallidos        integer not null default 0 check (intentos_fallidos >= 0),
  bloqueado_hasta          timestamptz,
  ultimo_acceso            timestamptz,
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now()
);

create trigger usuarios_actualizado_en
  before update on usuarios
  for each row execute function poner_actualizado_en();

-- Excepciones por persona: concedido = true da un permiso que su rol no
-- tiene; concedido = false se lo quita aunque su rol lo tenga.
create table usuario_permisos (
  usuario_id  uuid not null references usuarios (id) on delete cascade,
  permiso     text not null references permisos (clave) on delete cascade,
  concedido   boolean not null,
  primary key (usuario_id, permiso)
);

create function revisar_solo_admin() returns trigger
language plpgsql as $$
declare
  es_solo_admin boolean;
  rol_destino   text;
begin
  select solo_admin into es_solo_admin from permisos where clave = new.permiso;
  if not es_solo_admin then
    return new;
  end if;

  if tg_table_name = 'rol_permisos' then
    rol_destino := new.rol;
  else
    if not new.concedido then
      return new;
    end if;
    select rol into rol_destino from usuarios where id = new.usuario_id;
  end if;

  if rol_destino <> 'admin' then
    raise exception 'El permiso % es solo para administradores', new.permiso;
  end if;
  return new;
end;
$$;

create trigger rol_permisos_solo_admin
  before insert or update on rol_permisos
  for each row execute function revisar_solo_admin();

create trigger usuario_permisos_solo_admin
  before insert or update on usuario_permisos
  for each row execute function revisar_solo_admin();

create function conservar_un_admin() returns trigger
language plpgsql as $$
begin
  if old.rol = 'admin' and old.activo
     and (tg_op = 'DELETE' or new.rol <> 'admin' or not new.activo)
     and not exists (select 1 from usuarios where rol = 'admin' and activo and id <> old.id) then
    raise exception 'Debe quedar al menos un administrador activo';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger usuarios_conservar_un_admin
  before update or delete on usuarios
  for each row execute function conservar_un_admin();

create table sesiones (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references usuarios (id) on delete cascade,
  -- Solo el hash (SHA-256) del token; el token viaja en una cookie httpOnly.
  hash_token        text not null unique,
  creada_en         timestamptz not null default now(),
  expira_en         timestamptz not null,
  ultima_actividad  timestamptz not null default now(),
  revocada_en       timestamptz,
  ip                inet,
  agente            text
);

create index sesiones_activas on sesiones (usuario_id) where revocada_en is null;

-- Quién hizo qué: inicios de sesión, cancelaciones, ajustes, cambios de permisos…
create table bitacora (
  id          bigint generated always as identity primary key,
  usuario_id  uuid references usuarios (id),
  accion      text not null,
  entidad     text,
  entidad_id  text,
  antes       jsonb,
  despues     jsonb,
  ip          inet,
  creado_en   timestamptz not null default now()
);

create index bitacora_fecha on bitacora (creado_en desc);

create trigger bitacora_solo_agregar
  before update or delete on bitacora
  for each row execute function solo_agregar();

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

create table categorias (
  id      integer generated always as identity primary key,
  nombre  text not null unique
);

create table productos (
  id             uuid primary key default gen_random_uuid(),
  codigo_barras  text unique check (codigo_barras ~ '^[0-9A-Za-z-]{4,32}$'),
  nombre         text not null check (btrim(nombre) <> ''),
  sustancia      text not null default '',
  presentacion   text not null default '',
  laboratorio    text not null default '',
  categoria_id   integer references categorias (id),
  -- libre: sin receta · antibiotico: receta obligatoria · controlado: receta retenida
  clasificacion  text not null default 'libre' check (clasificacion in ('libre', 'antibiotico', 'controlado')),
  -- Precio de venta con IVA incluido.
  precio         integer not null check (precio >= 0),
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

create index productos_busqueda on productos using gin (busqueda gin_trgm_ops);

create trigger productos_actualizado_en
  before update on productos
  for each row execute function poner_actualizado_en();

create table proveedores (
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

create table lotes (
  id                 uuid primary key default gen_random_uuid(),
  producto_id        uuid not null references productos (id),
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
create index lotes_fefo on lotes (producto_id, caducidad) where cantidad > 0;

create function proteger_saldo_lote() returns trigger
language plpgsql as $$
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
  before insert or update on lotes
  for each row execute function proteger_saldo_lote();

create table recepciones (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null references proveedores (id),
  factura       text not null check (btrim(factura) <> ''),
  fecha         date not null,
  usuario_id    uuid not null references usuarios (id),
  total         integer not null default 0 check (total >= 0),
  notas         text not null default '',
  creado_en     timestamptz not null default now(),
  unique (proveedor_id, factura)
);

create table recepcion_partidas (
  id            bigint generated always as identity primary key,
  recepcion_id  uuid not null references recepciones (id),
  lote_id       uuid not null references lotes (id),
  cantidad      integer not null check (cantidad > 0),
  costo         integer not null check (costo >= 0)
);

create trigger recepcion_partidas_solo_agregar
  before update or delete on recepcion_partidas
  for each row execute function solo_agregar();

-- ---------------------------------------------------------------------------
-- Cajas y turnos
-- ---------------------------------------------------------------------------

create table cajas (
  id      smallint generated always as identity primary key,
  nombre  text not null unique,
  activa  boolean not null default true
);

create table turnos_caja (
  id                 uuid primary key default gen_random_uuid(),
  caja_id            smallint not null references cajas (id),
  usuario_id         uuid not null references usuarios (id),
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

create unique index turnos_un_abierto_por_caja on turnos_caja (caja_id) where cerrado_en is null;
create unique index turnos_un_abierto_por_usuario on turnos_caja (usuario_id) where cerrado_en is null;

create function proteger_turno() returns trigger
language plpgsql as $$
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
  before update or delete on turnos_caja
  for each row execute function proteger_turno();

-- ---------------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------------

create table ventas (
  id                  uuid primary key default gen_random_uuid(),
  -- Se muestra como V-000001.
  folio               bigint generated always as identity unique,
  turno_id            uuid not null references turnos_caja (id),
  usuario_id          uuid not null references usuarios (id),
  creado_en           timestamptz not null default now(),
  subtotal            integer not null check (subtotal >= 0),
  iva                 integer not null check (iva >= 0),
  total               integer not null check (total = subtotal + iva),
  estado              text not null default 'pagada' check (estado in ('pagada', 'cancelada')),
  cancelada_en        timestamptz,
  cancelada_por       uuid references usuarios (id),
  motivo_cancelacion  text,
  check ((estado = 'cancelada') = (cancelada_en is not null)),
  check (estado = 'pagada' or (cancelada_por is not null and motivo_cancelacion is not null))
);

create index ventas_fecha on ventas (creado_en desc);
create index ventas_turno on ventas (turno_id);

create function revisar_turno_venta() returns trigger
language plpgsql as $$
begin
  if not exists (
    select 1 from turnos_caja
    where id = new.turno_id and usuario_id = new.usuario_id and cerrado_en is null
  ) then
    raise exception 'La venta necesita un turno de caja abierto de la misma persona';
  end if;
  return new;
end;
$$;

create trigger ventas_revisar_turno
  before insert on ventas
  for each row execute function revisar_turno_venta();

create function proteger_venta() returns trigger
language plpgsql as $$
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
  before update or delete on ventas
  for each row execute function proteger_venta();

create table recetas (
  id              uuid primary key default gen_random_uuid(),
  venta_id        uuid not null references ventas (id),
  tipo            text not null check (tipo in ('antibiotico', 'controlado')),
  medico          text not null check (btrim(medico) <> ''),
  cedula          text not null check (btrim(cedula) <> ''),
  fecha_receta    date not null,
  folio_receta    text not null default '',
  retenida        boolean not null default false,
  registrada_por  uuid not null references usuarios (id),
  creado_en       timestamptz not null default now(),
  check (tipo <> 'controlado' or retenida)
);

create trigger recetas_solo_agregar
  before update or delete on recetas
  for each row execute function solo_agregar();

-- Un renglón por lote: si una venta toma piezas de dos lotes, son dos renglones.
create table venta_partidas (
  id           bigint generated always as identity primary key,
  venta_id     uuid not null references ventas (id),
  producto_id  uuid not null,
  lote_id      uuid not null,
  cantidad     integer not null check (cantidad > 0),
  -- Precio unitario cobrado, con IVA.
  precio       integer not null check (precio >= 0),
  iva          smallint not null check (iva in (0, 16)),
  descuento    integer not null default 0 check (descuento >= 0),
  importe      integer not null check (importe >= 0 and importe = precio * cantidad - descuento),
  receta_id    uuid references recetas (id),
  foreign key (lote_id, producto_id) references lotes (id, producto_id)
);

create index venta_partidas_venta on venta_partidas (venta_id);

create trigger venta_partidas_solo_agregar
  before update or delete on venta_partidas
  for each row execute function solo_agregar();

create table venta_pagos (
  id          bigint generated always as identity primary key,
  venta_id    uuid not null references ventas (id),
  metodo      text not null check (metodo in ('efectivo', 'tarjeta', 'transferencia')),
  monto       integer not null check (monto > 0),
  -- Solo efectivo: lo que dio el cliente. Cambio = recibido - monto.
  recibido    integer check (recibido >= monto),
  -- Autorización de tarjeta o clave de rastreo de la transferencia.
  referencia  text not null default '',
  check (metodo = 'efectivo' or recibido is null)
);

create index venta_pagos_venta on venta_pagos (venta_id);

create trigger venta_pagos_solo_agregar
  before update or delete on venta_pagos
  for each row execute function solo_agregar();

-- ---------------------------------------------------------------------------
-- Movimientos de caja
-- ---------------------------------------------------------------------------

create table movimientos_caja (
  id              bigint generated always as identity primary key,
  turno_id        uuid not null references turnos_caja (id),
  tipo            text not null check (tipo in ('venta', 'entrada', 'cancelacion', 'devolucion', 'retiro')),
  metodo          text not null check (metodo in ('efectivo', 'tarjeta', 'transferencia')),
  -- Positivo entra a la caja, negativo sale.
  monto           integer not null check (monto <> 0),
  concepto        text not null check (btrim(concepto) <> ''),
  venta_id        uuid references ventas (id),
  usuario_id      uuid not null references usuarios (id),
  autorizado_por  uuid references usuarios (id),
  creado_en       timestamptz not null default now(),
  check (
    (tipo in ('venta', 'entrada') and monto > 0)
    or (tipo in ('cancelacion', 'devolucion', 'retiro') and monto < 0)
  ),
  check (tipo not in ('venta', 'cancelacion', 'devolucion') or venta_id is not null)
);

create index movimientos_caja_turno on movimientos_caja (turno_id);

create function revisar_turno_abierto() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from turnos_caja where id = new.turno_id and cerrado_en is null) then
    raise exception 'El turno de caja está cerrado';
  end if;
  return new;
end;
$$;

create trigger movimientos_caja_turno_abierto
  before insert on movimientos_caja
  for each row execute function revisar_turno_abierto();

create trigger movimientos_caja_solo_agregar
  before update or delete on movimientos_caja
  for each row execute function solo_agregar();

-- Cierra el turno. El efectivo esperado sale de los movimientos, no del cajero.
create function cerrar_turno(p_turno uuid, p_contado integer, p_conteo jsonb default null)
returns turnos_caja
language plpgsql as $$
declare
  turno turnos_caja;
begin
  update turnos_caja t
  set cerrado_en = now(),
      efectivo_contado = p_contado,
      conteo = p_conteo,
      efectivo_esperado = t.fondo_inicial + coalesce((
        select sum(m.monto) from movimientos_caja m
        where m.turno_id = t.id and m.metodo = 'efectivo'
      ), 0)
  where t.id = p_turno and t.cerrado_en is null
  returning * into turno;

  if not found then
    raise exception 'El turno no existe o ya está cerrado';
  end if;
  return turno;
end;
$$;

-- ---------------------------------------------------------------------------
-- Movimientos de inventario (kardex)
-- ---------------------------------------------------------------------------

create table movimientos_inventario (
  id            bigint generated always as identity primary key,
  lote_id       uuid not null,
  producto_id   uuid not null,
  tipo          text not null check (tipo in (
                  'inventario_inicial', 'entrada', 'venta', 'devolucion', 'cancelacion', 'ajuste', 'merma'
                )),
  -- Positivo entra, negativo sale.
  cantidad      integer not null check (cantidad <> 0),
  -- Solo la carga inicial puede venir sin usuario.
  usuario_id    uuid references usuarios (id),
  referencia    text not null default '',
  motivo        text,
  recepcion_id  uuid references recepciones (id),
  venta_id      uuid references ventas (id),
  creado_en     timestamptz not null default now(),
  foreign key (lote_id, producto_id) references lotes (id, producto_id),
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

create index movimientos_inventario_producto on movimientos_inventario (producto_id, creado_en desc);
create index movimientos_inventario_lote on movimientos_inventario (lote_id);

create function aplicar_movimiento() returns trigger
language plpgsql as $$
declare
  lote lotes;
begin
  select * into lote from lotes where id = new.lote_id for update;

  if new.tipo = 'venta' then
    if lote.estado = 'cuarentena' then
      raise exception 'El lote % está bloqueado: no se puede vender', lote.numero;
    end if;
    if lote.caducidad < hoy_local() then
      raise exception 'El lote % caducó el %: no se puede vender', lote.numero, lote.caducidad;
    end if;
  end if;

  if lote.cantidad + new.cantidad < 0 then
    raise exception 'No hay suficientes piezas en el lote % (hay %, se piden %)', lote.numero, lote.cantidad, -new.cantidad
      using errcode = 'check_violation';
  end if;

  perform set_config('farmacia.moviendo_inventario', 'si', true);
  update lotes set cantidad = cantidad + new.cantidad where id = new.lote_id;
  perform set_config('farmacia.moviendo_inventario', '', true);
  return new;
end;
$$;

create trigger movimientos_inventario_aplicar
  after insert on movimientos_inventario
  for each row execute function aplicar_movimiento();

create trigger movimientos_inventario_solo_agregar
  before update or delete on movimientos_inventario
  for each row execute function solo_agregar();

-- ---------------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------------

-- Lo que cada usuario activo puede hacer, ya con rol y excepciones aplicados.
create view permisos_efectivos as
select u.id as usuario_id, p.clave as permiso
from usuarios u
cross join permisos p
left join rol_permisos rp on rp.rol = u.rol and rp.permiso = p.clave
left join usuario_permisos up on up.usuario_id = u.id and up.permiso = p.clave
where u.activo
  and (
    u.rol = 'admin'
    or (not p.solo_admin and coalesce(up.concedido, rp.permiso is not null))
  );

-- Existencia por producto. "vendible" excluye lotes caducados y bloqueados.
create view existencias as
select
  p.id as producto_id,
  coalesce(sum(l.cantidad) filter (where l.estado = 'disponible' and l.caducidad >= hoy_local()), 0)::integer as vendible,
  coalesce(sum(l.cantidad), 0)::integer as total,
  min(l.caducidad) filter (where l.cantidad > 0 and l.estado = 'disponible' and l.caducidad >= hoy_local()) as proxima_caducidad,
  coalesce(sum(l.cantidad) filter (where l.estado = 'disponible' and l.caducidad >= hoy_local()), 0) < p.stock_minimo as por_surtir
from productos p
left join lotes l on l.producto_id = p.id
where p.activo
group by p.id;

-- Lotes con piezas que ya caducaron o caducan dentro del aviso del negocio.
create view lotes_por_caducar as
select
  l.*,
  p.nombre as producto,
  l.caducidad - hoy_local() as dias
from lotes l
join productos p on p.id = l.producto_id
where l.cantidad > 0
  and l.caducidad <= hoy_local() + coalesce((select dias_aviso_caducidad from negocio where id = 1), 90);

create view kardex as
select
  m.id,
  m.creado_en,
  m.producto_id,
  p.nombre as producto,
  m.lote_id,
  l.numero as lote,
  m.tipo,
  m.cantidad,
  m.usuario_id,
  u.nombre as usuario,
  m.referencia,
  m.motivo
from movimientos_inventario m
join productos p on p.id = m.producto_id
join lotes l on l.id = m.lote_id
left join usuarios u on u.id = m.usuario_id;

-- Resumen en vivo de cada turno, para la pantalla de caja.
create view resumen_turnos as
select
  t.id,
  t.caja_id,
  c.nombre as caja,
  t.usuario_id,
  u.nombre as usuario,
  t.abierto_en,
  t.cerrado_en,
  t.fondo_inicial,
  coalesce(sum(m.monto) filter (where m.tipo = 'venta' and m.metodo = 'efectivo'), 0)::integer as ventas_efectivo,
  coalesce(sum(m.monto) filter (where m.tipo = 'venta' and m.metodo = 'tarjeta'), 0)::integer as ventas_tarjeta,
  coalesce(sum(m.monto) filter (where m.tipo = 'venta' and m.metodo = 'transferencia'), 0)::integer as ventas_transferencia,
  coalesce(sum(m.monto) filter (where m.tipo = 'retiro'), 0)::integer as retiros,
  (t.fondo_inicial + coalesce(sum(m.monto) filter (where m.metodo = 'efectivo'), 0))::integer as efectivo_esperado,
  t.efectivo_contado,
  t.diferencia
from turnos_caja t
join cajas c on c.id = t.caja_id
join usuarios u on u.id = t.usuario_id
left join movimientos_caja m on m.turno_id = t.id
group by t.id, c.nombre, u.nombre;

commit;

-- ---------------------------------------------------------------------------
-- Recomendado: usuario de base de datos solo para la aplicación.
-- Ejecútalo como dueño de la base, cambiando la contraseña.
-- ---------------------------------------------------------------------------
-- create role farmacia_app login password 'CAMBIA_ESTA_CONTRASENA';
-- grant usage on schema public to farmacia_app;
-- grant select, insert, update on all tables in schema public to farmacia_app;
-- grant delete on sesiones, usuario_permisos, rol_permisos to farmacia_app;
-- grant usage on all sequences in schema public to farmacia_app;
