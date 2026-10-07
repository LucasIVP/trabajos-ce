-- Portal CE: no se reserva una foja en un expediente cuya numeración no fue inicializada (aplicada el 07/10/2026).
-- Evita que un expediente con fojas ya existentes en Drive arranque en F001. El contador se inicializa con la
-- última foja de Drive (plantilla en supabase/propuestas/fojas.md) o se toma solo del máximo de fojas importadas.
create or replace function private.reservar_foja(p_expediente text, p_descripcion text, p_tipo text, p_reemplaza_a integer)
returns table (id uuid, numero integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_rol text := private.current_rol();
  v_n integer; v_id uuid; v_ini text; v_max integer;
begin
  if v_rol is null or v_rol not in ('edicion', 'admin') then
    raise exception 'Tu rol no permite cargar fojas' using errcode = '42501';
  end if;
  if not exists (select 1 from public.expedientes e where e.ad = p_expediente) then
    raise exception 'El expediente no existe' using errcode = '23503';
  end if;
  if p_descripcion is null or char_length(btrim(p_descripcion)) = 0 then
    raise exception 'Falta la descripción' using errcode = '23502';
  end if;
  if p_reemplaza_a is not null and not exists (
    select 1 from public.fojas f where f.expediente = p_expediente and f.numero = p_reemplaza_a and f.estado = 'vigente') then
    raise exception 'La foja a reemplazar no existe o no está vigente' using errcode = 'P0001';
  end if;
  if not exists (select 1 from private.foja_contador c where c.expediente = p_expediente) then
    select max(f.numero) into v_max from public.fojas f where f.expediente = p_expediente;
    if v_max is null then
      raise exception 'La numeración de fojas de este expediente todavía no está inicializada. Pedile a quien administra que la cargue con la última foja que hay en Drive.' using errcode = 'P0001';
    end if;
    insert into private.foja_contador (expediente, ultimo) values (p_expediente, v_max) on conflict (expediente) do nothing;
  end if;
  -- Bloqueo por expediente: reservas simultáneas del mismo expediente esperan acá, una detrás de otra.
  select c.ultimo + 1 into v_n from private.foja_contador c where c.expediente = p_expediente for update;
  update private.foja_contador c set ultimo = v_n where c.expediente = p_expediente;
  select coalesce(m.iniciales, '') into v_ini from public.members m where m.id = (select auth.uid());
  insert into public.fojas (expediente, numero, descripcion, tipo, reemplaza_a, autor, creado_por, estado)
  values (p_expediente, v_n, btrim(p_descripcion), p_tipo, p_reemplaza_a, coalesce(v_ini, ''), (select auth.uid()), 'reservada')
  returning fojas.id into v_id;
  return query select v_id, v_n;
end
$$;
