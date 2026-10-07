-- =====================================================================================
-- PROPUESTA (NO APLICAR SIN REVISIÓN DE LUCAS): fojas de expediente, v1 con link a Drive
-- =====================================================================================
-- Esta carpeta (supabase/propuestas/) NO es supabase/migrations/: nada la aplica solo.
-- Para aplicarla: revisar, ajustar, copiarla como migración nueva y correrla en una transacción.
-- Requisitos que ya existen en la base: private.current_rol() (exige aal2), private.auditar(),
-- tabla public.expedientes (ad text PK). Ver la nota fojas.md (decisiones y riesgos).
--
-- Modelo: el NÚMERO de foja lo asigna SIEMPRE el servidor. Flujo de alta en dos pasos:
--   1) reservar_foja  -> el servidor bloquea el contador del expediente, asigna máximo + 1 y crea la foja
--                        en estado 'reservada' (sin link). Devuelve id y número.
--   2) confirmar_foja -> con el link https de Drive, la foja pasa a 'vigente'.
--   Una reserva abandonada se cancela (queda 'anulada'): el número NUNCA se reutiliza ni se borra,
--   para que la numeración siga continua.
-- Nada se borra: no hay política ni permiso de DELETE sobre fojas para la página.

begin;

-- -------------------------------------------------------------------------------------
-- 0. Datos nuevos del expediente (los muestra la pantalla; hoy dicen "Sin dato")
-- -------------------------------------------------------------------------------------
alter table public.expedientes
  add column estado text check (estado in ('Planificado', 'En Espera', 'Trabajando', 'Terminado')),
  add column tipo text check (tipo in ('Comisión', 'Autorización', 'Nota', 'Resolución', 'Permanente', 'Otro')),
  add column proxima_revision date,
  add column ee_gde text check (char_length(ee_gde) <= 60),
  add column carpeta_url text check (carpeta_url is null or (carpeta_url ~ '^https://(drive|docs)\.google\.com/' and char_length(carpeta_url) <= 2000));
-- RIESGO: los valores de estado y tipo copian los de Notion. Si Notion agrega uno, la carga falla
-- hasta ampliar el check (preferible a guardar valores sueltos).
-- La edición de expedientes ya es solo admin (política expedientes_update existente).

-- -------------------------------------------------------------------------------------
-- 1. Tabla de fojas
-- -------------------------------------------------------------------------------------
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

-- Auditoría: toda alta, confirmación y anulación queda en public.auditoria (trigger ya existente).
create trigger auditar after insert or update or delete on public.fojas for each row execute function private.auditar();

-- RLS: cualquier miembro con rol (y segundo factor) lee; NADIE escribe directo desde la API.
-- Las escrituras pasan solo por las funciones de abajo (security definer, con sus propios controles).
alter table public.fojas enable row level security;
create policy fojas_read on public.fojas for select to authenticated using ((select private.current_rol()) is not null);
revoke all on public.fojas from anon, authenticated;
grant select on public.fojas to authenticated;
grant select, insert, update on public.fojas to service_role;   -- sin delete: tampoco desde el servidor

-- -------------------------------------------------------------------------------------
-- 2. Contador por expediente (privado). La fila del contador es el "candado" del expediente.
-- -------------------------------------------------------------------------------------
create table private.foja_contador (
  expediente text primary key references public.expedientes(ad) on update cascade on delete restrict,
  ultimo integer not null check (ultimo >= 0)
);
revoke all on private.foja_contador from public, anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 3. Funciones (lógica en private, security definer; en public, envoltorios invoker para la API)
-- -------------------------------------------------------------------------------------
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

  -- Crea el contador si falta, arrancando desde la foja más alta ya registrada (o 0).
  insert into private.foja_contador (expediente, ultimo)
  values (p_expediente, coalesce((select max(f.numero) from public.fojas f where f.expediente = p_expediente), 0))
  on conflict (expediente) do nothing;

  -- BLOQUEO por expediente: dos reservas simultáneas del mismo expediente esperan en esta línea, una
  -- detrás de la otra, hasta que la primera termina su transacción. Expedientes distintos no se bloquean.
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
  -- Validación en el servidor: solo https y solo dominios de Google Drive / Docs.
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
  -- Solo quien reservó, o un admin, puede cancelar una reserva.
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
  -- Anular solo cambia el estado y registra quién, cuándo y por qué. El número se conserva.
  update public.fojas f set estado = 'anulada', anulada_por = (select auth.uid()), anulada_en = now(), motivo_anulacion = left(btrim(p_motivo), 300)
   where f.id = p_id and f.estado in ('vigente', 'reservada');
  if not found then raise exception 'La foja no existe o ya está anulada' using errcode = 'P0001'; end if;
end
$$;

revoke execute on function private.reservar_foja(text, text, text, integer), private.confirmar_foja(uuid, text),
  private.cancelar_reserva_foja(uuid), private.anular_foja(uuid, text) from public, anon;
grant execute on function private.reservar_foja(text, text, text, integer), private.confirmar_foja(uuid, text),
  private.cancelar_reserva_foja(uuid), private.anular_foja(uuid, text) to authenticated;

-- Envoltorios en public (la API solo expone public). SECURITY INVOKER: no agregan privilegios;
-- los controles están adentro de las funciones privadas. Nombres y parámetros = los que llama la página.
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

commit;

-- =====================================================================================
-- 4. SEMBRAR EL CONTADOR desde la foja más alta que ya existe en Drive (para no reiniciar en F001)
-- =====================================================================================
-- Se corre UNA vez por expediente, en el SQL Editor (rol postgres), DESPUÉS de aplicar lo de arriba.
-- El número sale de mirar la carpeta del expediente en Drive (Etapa A del documento de referencia:
-- "#[AD] - F[número] - ..."). greatest() evita bajar un contador que ya avanzó.
-- Ejemplo con un AD FICTICIO: la foja más alta en Drive es F055 -> la próxima reserva será F056.
--
--   insert into private.foja_contador (expediente, ultimo) values ('901/26', 55)
--   on conflict (expediente) do update set ultimo = greatest(private.foja_contador.ultimo, excluded.ultimo);
--
-- Si en la Etapa A se importan las fojas viejas a public.fojas (como 'vigente', con su número y link),
-- el contador se toma solo del máximo importado la primera vez que se reserva (coalesce de arriba);
-- en ese caso el sembrado manual no hace falta. La importación también va por SQL Editor / servidor,
-- nunca desde la página.

-- =====================================================================================
-- 5. PRUEBA DE CONCURRENCIA (dos altas simultáneas) — en una copia o en una transacción que se descarta
-- =====================================================================================
-- Hacen falta DOS conexiones abiertas a la vez (dos ventanas de psql, o dos pestañas de un cliente
-- que mantenga la transacción abierta; el SQL Editor de Supabase NO sirve porque confirma cada corrida).
-- Usar un AD ficticio creado para la prueba y una cuenta de prueba con rol edicion.
--
-- Ventana A:
--   begin;
--   select set_config('request.jwt.claims', '{"sub":"<uuid-cuenta-prueba>","role":"authenticated","aal":"aal2"}', true);
--   set local role authenticated;
--   select * from public.reservar_foja('999/99', 'Prueba A', 'otro');   -- devuelve, por ejemplo, número 1
--   -- (NO cerrar todavía)
-- Ventana B (mientras A sigue abierta):
--   begin;
--   select set_config('request.jwt.claims', '{"sub":"<uuid-cuenta-prueba>","role":"authenticated","aal":"aal2"}', true);
--   set local role authenticated;
--   select * from public.reservar_foja('999/99', 'Prueba B', 'otro');   -- QUEDA ESPERANDO (bloqueo del contador)
-- Ventana A:  commit;      -> B se destraba y devuelve número 2 (nunca 1)
-- Ventana B:  commit;
-- Verificación (sin huecos ni repetidos):
--   select numero, count(*) from public.fojas where expediente = '999/99' group by numero having count(*) > 1;  -- 0 filas
--   select max(numero) - min(numero) + 1 = count(*) as continua from public.fojas where expediente = '999/99'; -- true
-- Variante: si A hace ROLLBACK en vez de commit, B obtiene el número 1 (el contador también se revierte).
-- Prueba de carga desde afuera (opcional): N llamadas en paralelo a /rest/v1/rpc/reservar_foja con
-- Promise.all y dos sesiones distintas; esperar números 1..N sin repetidos.
-- Limpieza: las fojas de prueba no se pueden borrar desde la página; borrar el AD ficticio exige
-- quitar sus fojas como postgres en el SQL Editor (por eso conviene probar en una copia o en una
-- transacción que termine en ROLLBACK).
