-- Productos, lotes y proveedores de ejemplo (opcional, solo para probar).
-- Cárgalo después de las migraciones, en Supabase → SQL Editor.
-- Las existencias entran como "inventario_inicial", igual que al migrar
-- desde otro sistema. Para empezar en limpio, no lo cargues.


insert into public.categorias (nombre) values
  ('Analgésicos'), ('Antibióticos'), ('Antialérgicos'), ('Gastrointestinal'), ('Diabetes'),
  ('Cardiovascular'), ('Controlados'), ('Hidratación'), ('Respiratorio'), ('Higiene'),
  ('Dermocosmética'), ('Material de curación'), ('Bebés');

insert into public.proveedores (nombre) values
  ('Distribuidora Norte'),
  ('Farma Mayoreo del Centro'),
  ('Suministros Médicos del Bajío');

insert into public.productos (codigo_barras, nombre, sustancia, presentacion, laboratorio, categoria_id, clasificacion, precio, costo, iva, stock_minimo, ubicacion, refrigerado)
select v.codigo, v.nombre, v.sustancia, v.presentacion, v.laboratorio, c.id, v.clasificacion, v.precio, v.costo, v.iva, v.minimo, v.ubicacion, v.refrigerado
from (values
  ('7501000000011', 'Paracetamol 500 mg',          'Paracetamol',             'Caja con 20 tabletas',   'Genéricos Unidos',       'Analgésicos',          'libre',       3500,  1800,  0, 20, 'A-01',              false),
  ('7501000000028', 'Ibuprofeno 400 mg',           'Ibuprofeno',              'Caja con 10 tabletas',   'Genéricos Unidos',       'Analgésicos',          'libre',       4800,  2300,  0, 15, 'A-02',              false),
  ('7501000000035', 'Amoxicilina 500 mg',          'Amoxicilina',             'Caja con 12 cápsulas',   'Laboratorios del Valle', 'Antibióticos',         'antibiotico', 8900,  4200,  0, 10, 'B-01',              false),
  ('7501000000042', 'Azitromicina 500 mg',         'Azitromicina',            'Caja con 3 tabletas',    'Laboratorios del Valle', 'Antibióticos',         'antibiotico', 14500, 7100,  0,  6, 'B-02',              false),
  ('7501000000059', 'Loratadina 10 mg',            'Loratadina',              'Caja con 10 tabletas',   'Genéricos Unidos',       'Antialérgicos',        'libre',       4200,  1900,  0, 10, 'A-05',              false),
  ('7501000000066', 'Omeprazol 20 mg',             'Omeprazol',               'Caja con 14 cápsulas',   'Farma Andina',           'Gastrointestinal',     'libre',       5500,  2400,  0, 12, 'A-06',              false),
  ('7501000000073', 'Metformina 850 mg',           'Metformina',              'Caja con 30 tabletas',   'Farma Andina',           'Diabetes',             'libre',       6800,  3000,  0, 10, 'C-01',              false),
  ('7501000000080', 'Losartán 50 mg',              'Losartán potásico',       'Caja con 30 tabletas',   'Laboratorios del Valle', 'Cardiovascular',       'libre',       9200,  4100,  0,  8, 'C-02',              false),
  ('7501000000097', 'Clonazepam 2 mg',             'Clonazepam',              'Caja con 30 tabletas',   'Neuro Pharma',           'Controlados',          'controlado',  21000, 9800,  0,  4, 'Vitrina V-01',      false),
  ('7501000000103', 'Insulina glargina 100 UI/ml', 'Insulina glargina',       'Pluma de 3 ml',          'Bio Salud',              'Diabetes',             'libre',       89000, 61000, 0,  3, 'Refrigerador R-01', true),
  ('7501000000110', 'Suero oral 500 ml',           'Electrolitos orales',     'Botella de 500 ml',      'Hidra Lab',              'Hidratación',          'libre',       2500,  1100,  0, 24, 'D-01',              false),
  ('7501000000127', 'Salbutamol 100 mcg',          'Salbutamol',              'Inhalador de 200 dosis', 'Respira Lab',            'Respiratorio',         'libre',       13500, 6200,  0,  5, 'C-04',              false),
  ('7501000000134', 'Gel antibacterial 250 ml',    'Alcohol etílico al 70 %', 'Botella de 250 ml',      'Higiene Plus',           'Higiene',              'libre',       4500,  2000, 16, 10, 'E-01',              false),
  ('7501000000141', 'Protector solar FPS 50',      'Filtros UV',              'Tubo de 120 ml',         'Dermacare',              'Dermocosmética',       'libre',       28900, 15500, 16, 4, 'E-03',              false),
  ('7501000000158', 'Cubrebocas KN95',             'No aplica',               'Caja con 10 piezas',     'Protege',                'Material de curación', 'libre',       12000, 5500, 16,  5, 'E-05',              false),
  ('7501000000165', 'Pañales etapa 3',             'No aplica',               'Paquete con 40 piezas',  'Bebé Suave',             'Bebés',                'libre',       25900, 18000, 16, 6, 'F-01',              false)
) as v(codigo, nombre, sustancia, presentacion, laboratorio, categoria, clasificacion, precio, costo, iva, minimo, ubicacion, refrigerado)
join public.categorias c on c.nombre = v.categoria;

-- Los lotes nacen en 0 y reciben sus piezas con un movimiento.
create temporary table lotes_demo (codigo text, numero text, caducidad date, costo integer, cantidad integer, estado text, motivo text) ;

insert into lotes_demo values
  ('7501000000011', 'PA2611', '2026-11-15',  1750,  8, 'disponible', null),
  ('7501000000011', 'PA2708', '2027-08-31',  1800, 40, 'disponible', null),
  ('7501000000028', 'IB2803', '2028-03-31',  2300, 12, 'disponible', null),
  ('7501000000035', 'AM2609', '2026-09-20',  4100,  3, 'disponible', null),
  ('7501000000035', 'AM2705', '2027-05-31',  4200, 22, 'disponible', null),
  ('7501000000042', 'AZ2712', '2027-12-31',  7100,  4, 'disponible', null),
  ('7501000000059', 'LO2612', '2026-12-10',  1900, 15, 'disponible', null),
  ('7501000000059', 'LO2801', '2028-01-31',  1900, 20, 'disponible', null),
  ('7501000000066', 'OM2709', '2027-09-30',  2400, 30, 'disponible', null),
  ('7501000000073', 'ME2804', '2028-04-30',  3000, 18, 'disponible', null),
  ('7501000000097', 'CL2706', '2027-06-30',  9800,  9, 'disponible', null),
  ('7501000000103', 'IN2703', '2027-03-15', 61000,  5, 'disponible', null),
  ('7501000000110', 'SU2610', '2026-10-25',  1100, 30, 'disponible', null),
  ('7501000000110', 'SU2706', '2027-06-30',  1100, 24, 'disponible', null),
  ('7501000000127', 'SA2702', '2027-02-28',  6200,  6, 'cuarentena', 'Retiro preventivo del fabricante'),
  ('7501000000127', 'SA2711', '2027-11-30',  6200,  7, 'disponible', null),
  ('7501000000134', 'GE2902', '2029-02-28',  2000, 25, 'disponible', null),
  ('7501000000141', 'PS2805', '2028-05-31', 15500,  6, 'disponible', null),
  ('7501000000158', 'KN3001', '2030-01-31',  5500,  2, 'disponible', null),
  ('7501000000165', 'PN2912', '2029-12-31', 18000, 10, 'disponible', null);

insert into public.lotes (producto_id, numero, caducidad, costo, estado, motivo_cuarentena)
select p.id, d.numero, d.caducidad, d.costo, d.estado, d.motivo
from lotes_demo d
join public.productos p on p.codigo_barras = d.codigo;

insert into public.movimientos_inventario (lote_id, producto_id, tipo, cantidad, referencia)
select l.id, l.producto_id, 'inventario_inicial', d.cantidad, 'Carga inicial de ejemplo'
from lotes_demo d
join public.productos p on p.codigo_barras = d.codigo
join public.lotes l on l.producto_id = p.id and l.numero = d.numero;

drop table lotes_demo;
