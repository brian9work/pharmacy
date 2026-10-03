-- Primer administrador. Hazlo una sola vez, después de las migraciones.
--
-- 1. Supabase → Authentication → Users → Add user → Create new user.
--    Escribe tu correo y una contraseña larga y marca "Auto Confirm User".
-- 2. Cambia abajo el correo y tu nombre, y ejecútalo en SQL Editor.
--
-- Los demás usuarios se crean desde la pantalla Usuarios del sistema.

insert into public.usuarios (id, nombre, correo, rol, debe_cambiar_contrasena)
select id, 'Tu nombre', email, 'admin', false
from auth.users
where email = 'tu-correo@ejemplo.com';
