-- Datos iniciales obligatorios. Cargar después de 01-esquema.sql.
--
-- Las claves de permisos son las mismas que config/permisos.ts: si agregas
-- o cambias un permiso allá, cámbialo también aquí.

begin;

insert into negocio (id) values (1);

insert into cajas (nombre) values ('Caja 1');

insert into roles (clave, nombre, descripcion) values
  ('admin',    'Administrador', 'Tiene todos los permisos, siempre.'),
  ('empleado', 'Empleado',      'Solo los permisos que le asigne el administrador.');

insert into permisos (clave, modulo, nombre, descripcion, solo_admin) values
  ('ventas.vender',         'ventas',        'Vender',                         'Usar el punto de venta y cobrar.', false),
  ('ventas.descuento',      'ventas',        'Aplicar descuentos',             'Bajar el precio de un producto durante la venta.', false),
  ('ventas.cancelar',       'ventas',        'Cancelar ventas',                'Anular un ticket ya cobrado.', false),
  ('ventas.devolucion',     'ventas',        'Registrar devoluciones',         'Recibir producto de vuelta y regresar el dinero.', false),
  ('ventas.historial',      'ventas',        'Ver todas las ventas',           'Consultar las ventas de todos los cajeros.', false),
  ('caja.abrir',            'caja',          'Abrir su caja',                  'Empezar el turno con un fondo inicial.', false),
  ('caja.cerrar',           'caja',          'Cerrar su caja',                 'Contar el efectivo y hacer el corte de su turno.', false),
  ('caja.movimientos',      'caja',          'Retiros y entradas de efectivo', 'Sacar o meter efectivo durante el turno.', false),
  ('caja.ver_todas',        'caja',          'Ver cajas de otros',             'Consultar los cortes de todos los cajeros.', false),
  ('inventario.ver',        'inventario',    'Consultar inventario',           'Ver existencias, lotes y caducidades.', false),
  ('inventario.entrada',    'inventario',    'Recibir mercancía',              'Registrar lo que llega del proveedor, con lote y caducidad.', false),
  ('inventario.ajuste',     'inventario',    'Ajustar existencias',            'Corregir cantidades después de un conteo.', false),
  ('inventario.merma',      'inventario',    'Registrar merma',                'Dar de baja producto caducado, dañado o perdido.', false),
  ('inventario.cuarentena', 'inventario',    'Bloquear lotes',                 'Impedir que se venda un lote, por ejemplo por un retiro sanitario.', false),
  ('inventario.costos',     'inventario',    'Ver costos y márgenes',          'Ver cuánto cuesta cada producto y cuánto deja.', false),
  ('productos.crear',       'productos',     'Dar de alta productos',          'Agregar productos nuevos al catálogo.', false),
  ('productos.editar',      'productos',     'Editar productos',               'Cambiar nombre, presentación o código de barras.', false),
  ('productos.precios',     'productos',     'Cambiar precios',                'Modificar el precio de venta.', false),
  ('reportes.ver',          'reportes',      'Ver reportes',                   'Ventas, utilidad y productos más vendidos.', false),
  ('usuarios.gestionar',    'usuarios',      'Gestionar usuarios',             'Crear, editar y bloquear usuarios.', true),
  ('permisos.gestionar',    'usuarios',      'Gestionar permisos',             'Decidir qué puede hacer el empleado.', true),
  ('configuracion.editar',  'configuracion', 'Editar configuración',           'Datos del negocio, impresora de tickets y cajas.', false);

-- Permisos iniciales del empleado: vender, abrir y cerrar su caja,
-- consultar inventario y recibir mercancía. Agrega o quita filas para cambiarlos.
insert into rol_permisos (rol, permiso) values
  ('empleado', 'ventas.vender'),
  ('empleado', 'caja.abrir'),
  ('empleado', 'caja.cerrar'),
  ('empleado', 'inventario.ver'),
  ('empleado', 'inventario.entrada');

commit;

-- ---------------------------------------------------------------------------
-- Primer administrador
-- ---------------------------------------------------------------------------
-- La aplicación todavía no crea usuarios. Para tener el primero, quita los
-- guiones de este bloque, cambia nombre, usuario y contraseña, y ejecútalo.
-- Usa bcrypt (pgcrypto); al entrar por primera vez se le pedirá cambiarla.
--
-- create extension if not exists pgcrypto;
-- insert into usuarios (nombre, usuario, hash_contrasena, rol)
-- values ('Tu nombre', 'admin', crypt('ESCRIBE_AQUI_UNA_CONTRASENA_LARGA', gen_salt('bf', 12)), 'admin');
