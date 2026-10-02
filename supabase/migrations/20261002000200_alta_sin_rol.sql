-- Portal CE: las cuentas nuevas entran sin rol (no ven nada) hasta que un admin les asigna uno.
-- Si el registro abierto se activara por error, una cuenta desconocida no podría leer datos.
-- private.handle_new_user() no cambia: inserta solo id y email, así que la fila nace con rol null,
-- private.current_rol() devuelve null y todas las reglas de lectura piden rol no nulo.

alter table public.members alter column rol drop default;
alter table public.members alter column rol drop not null;
