-- Portal CE: el control "edición solo cambia el estado del documento" frenaba también al servidor
-- (sincronización con la clave secreta, mantenimiento por SQL), porque ahí no hay usuario y current_rol() es null.
-- Ahora aplica solo a pedidos de usuarios del portal (rol de Postgres authenticated); para ellos no cambia nada.
create or replace function private.documentos_solo_estado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and (select private.current_rol()) is distinct from 'admin'
     and (to_jsonb(new) - 'recibido' - 'sintesis') is distinct from (to_jsonb(old) - 'recibido' - 'sintesis') then
    raise exception 'Con rol edición solo se puede cambiar el estado del documento';
  end if;
  return new;
end
$$;
revoke execute on function private.documentos_solo_estado() from public, anon, authenticated;
