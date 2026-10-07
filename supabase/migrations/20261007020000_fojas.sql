-- Portal CE: fojas de expediente (v1, link a Drive). Aplicada el 07/10/2026.
-- Diseño, riesgos, sembrado del contador y prueba de concurrencia: supabase/propuestas/fojas.md y fojas.sql.
alter table public.expedientes
  add column estado text check (estado in ('Planificado', 'En Espera', 'Trabajando', 'Terminado')),
  add column tipo text check (tipo in ('Comisión', 'Autorización', 'Nota', 'Resolución', 'Permanente', 'Otro')),
  add column proxima_revision date,
  add column ee_gde text check (char_length(ee_gde) <= 60),
  add column carpeta_url text check (carpeta_url is null or (carpeta_url ~ '^https://(drive|docs)\.google\.com/' and char_length(carpeta_url) <= 2000));
create table public.fojas (
  id uuid primary key default gen_random_uuid(),
  expediente text not null references public.expedientes(ad) on update cascade on delete restrict,
  numero integer not null check (numero >= 0),
  descripcion text not null check (char_length(descripcion) between 1 and 200),
  tipo text not null check (tipo in ('comunicacion', 'constancia', 'informacion', 'otro')),
  url text check (url is null or (url ~ '^https://(drive|docs)\.google\.com/' and char_length(url) <= 2000)),
  estado text not null default 'reservada' check (estado in ('reservada', 'vigente', 'anulada')),
  reemplaza_a integer,
  autor text not null default '' check (char_length(autor) <= 20),
  creado_por uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  confirmada_en timestamptz,
  anulada_por uuid references auth.users(id),
  anulada_en timestamptz,
  motivo_anulacion text check (char_length(motivo_anulacion) <= 300),
  unique (expediente, numero),                                   -- última barrera contra números repetidos
  foreign key (expediente, reemplaza_a) references public.fojas (expediente, numero),
  check (reemplaza_a is null or reemplaza_a < numero),
  check (estado <> 'vigente' or url is not null),               -- una foja vigente siempre tiene link
  check ((estado = 'anulada') = (anulada_en is not null))       -- anulada <=> con fecha de anulación
);
create index fojas_expediente_idx on public.fojas (expediente, numero);
create index fojas_creado_por_idx on public.fojas (creado_por);
create trigger auditar after insert or update or delete on public.fojas for each row execute function private.auditar();
alter table public.fojas enable row level security;
create policy fojas_read on public.fojas for select to authenticated using ((select private.current_rol()) is not null);
revoke all on public.fojas from anon, authenticated;
grant select on public.fojas to authenticated;
grant select, insert, update on public.fojas to service_role;   -- sin delete: tampoco desde el servidor
create table private.foja_contador (
  expediente text primary key references public.expedientes(ad) on update cascade on delete restrict,
  ultimo integer not null check (ultimo >= 0)
);
revoke all on private.foja_contador from public, anon, authenticated;
create or replace function private.reservar_foja(p_expediente text, p_descripcion text, p_tipo text, p_reemplaza_a integer)
returns table (id uuid, numero integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text := private.current_rol();    -- null si no hay sesión con segundo factor (aal2)
  v_n integer;
  v_id uuid;
  v_ini text;
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
  insert into private.foja_contador (expediente, ultimo)
  values (p_expediente, coalesce((select max(f.numero) from public.fojas f where f.expediente = p_expediente), 0))
  on conflict (expediente) do nothing;
  select c.ultimo + 1 into v_n from private.foja_contador c where c.expediente = p_expediente for update;
  update private.foja_contador c set ultimo = v_n where c.expediente = p_expediente;
  select coalesce(m.iniciales, '') into v_ini from public.members m where m.id = (select auth.uid());
  insert into public.fojas (expediente, numero, descripcion, tipo, reemplaza_a, autor, creado_por, estado)
  values (p_expediente, v_n, btrim(p_descripcion), p_tipo, p_reemplaza_a, coalesce(v_ini, ''), (select auth.uid()), 'reservada')
  returning fojas.id into v_id;
  return query select v_id, v_n;
end
$$;
create or replace function private.confirmar_foja(p_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_rol text := private.current_rol();
begin
  if v_rol is null or v_rol not in ('edicion', 'admin') then
    raise exception 'Tu rol no permite cargar fojas' using errcode = '42501';
  end if;
  if p_url is null or p_url !~ '^https://(drive|docs)\.google\.com/' or char_length(p_url) > 2000 then
    raise exception 'El link tiene que ser https de Google Drive' using errcode = '23514';
  end if;
  update public.fojas f set url = p_url, estado = 'vigente', confirmada_en = now()
   where f.id = p_id and f.estado = 'reservada';
  if not found then raise exception 'No hay una reserva pendiente con ese número' using errcode = 'P0001'; end if;
end
$$;
create or replace function private.cancelar_reserva_foja(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_rol text := private.current_rol();
begin
  if v_rol is null or v_rol not in ('edicion', 'admin') then
    raise exception 'Tu rol no permite esta acción' using errcode = '42501';
  end if;
  update public.fojas f set estado = 'anulada', anulada_por = (select auth.uid()), anulada_en = now(), motivo_anulacion = 'reserva cancelada'
   where f.id = p_id and f.estado = 'reservada' and (f.creado_por = (select auth.uid()) or v_rol = 'admin');
  if not found then raise exception 'No hay una reserva tuya pendiente con ese número' using errcode = 'P0001'; end if;
end
$$;
create or replace function private.anular_foja(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_rol() is distinct from 'admin' then        -- current_rol ya exige aal2
    raise exception 'Solo un admin puede anular fojas' using errcode = '42501';
  end if;
  if p_motivo is null or char_length(btrim(p_motivo)) = 0 then
    raise exception 'Para anular hace falta el motivo' using errcode = '23502';
  end if;
  update public.fojas f set estado = 'anulada', anulada_por = (select auth.uid()), anulada_en = now(), motivo_anulacion = left(btrim(p_motivo), 300)
   where f.id = p_id and f.estado in ('vigente', 'reservada');
  if not found then raise exception 'La foja no existe o ya está anulada' using errcode = 'P0001'; end if;
end
$$;
revoke execute on function private.reservar_foja(text, text, text, integer), private.confirmar_foja(uuid, text),
  private.cancelar_reserva_foja(uuid), private.anular_foja(uuid, text) from public, anon;
grant execute on function private.reservar_foja(text, text, text, integer), private.confirmar_foja(uuid, text),
  private.cancelar_reserva_foja(uuid), private.anular_foja(uuid, text) to authenticated;
create or replace function public.reservar_foja(p_expediente text, p_descripcion text, p_tipo text, p_reemplaza_a integer default null)
returns table (id uuid, numero integer) language sql security invoker set search_path = ''
as $$ select * from private.reservar_foja(p_expediente, p_descripcion, p_tipo, p_reemplaza_a) $$;
create or replace function public.confirmar_foja(p_id uuid, p_url text)
returns void language sql security invoker set search_path = '' as $$ select private.confirmar_foja(p_id, p_url) $$;
create or replace function public.cancelar_reserva_foja(p_id uuid)
returns void language sql security invoker set search_path = '' as $$ select private.cancelar_reserva_foja(p_id) $$;
create or replace function public.anular_foja(p_id uuid, p_motivo text)
returns void language sql security invoker set search_path = '' as $$ select private.anular_foja(p_id, p_motivo) $$;
revoke execute on function public.reservar_foja(text, text, text, integer), public.confirmar_foja(uuid, text),
  public.cancelar_reserva_foja(uuid), public.anular_foja(uuid, text) from public, anon;
grant execute on function public.reservar_foja(text, text, text, integer), public.confirmar_foja(uuid, text),
  public.cancelar_reserva_foja(uuid), public.anular_foja(uuid, text) to authenticated;
