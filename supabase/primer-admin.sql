-- Después de crear tu usuario en Supabase (Authentication, Users, Add user), dale rol de administración.
-- Cambiar el correo por el tuyo. Correr una sola vez.
update public.members set rol = 'admin', nombre = 'TU NOMBRE', iniciales = 'TUS INICIALES'
where email = 'CAMBIAR_POR_TU_CORREO';
-- Verificar: debe devolver tu fila con rol admin.
select id, email, rol from public.members;
