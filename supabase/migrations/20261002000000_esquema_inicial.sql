-- Portal CE: esquema inicial. Aplicar como migración en el proyecto nuevo de Supabase.

-- 0. Permisos por defecto ---------------------------------------------------
-- Supabase da por defecto permisos a anon, authenticated y service_role sobre toda tabla o función nueva en public.
-- Se cortan para que cada objeto se habilite a mano (SQL de la guía "Securing your API" de Supabase).
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

-- Esquema privado: la API no lo expone. Las funciones security definer van acá, nunca en public.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- 1. Miembros y roles -------------------------------------------------------
create table public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text not null default '',
  iniciales text not null default '',
  rol text not null default 'lectura' check (rol in ('lectura','edicion','admin')),
  created_at timestamptz not null default now()
);

-- Rol del usuario actual. security definer para que las reglas no dependan de leer members.
create or replace function private.current_rol()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.rol from public.members m where m.id = (select auth.uid())
$$;
revoke execute on function private.current_rol() from public, anon;
grant execute on function private.current_rol() to authenticated;

-- Al invitar a alguien, se crea su fila en members con rol lectura (el rol mínimo).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.members (id, email) values (new.id, new.email);
  return new;
end
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- 2. Datos del portal -------------------------------------------------------
create table public.expedientes (
  ad text primary key,            -- ej. 001/26
  nombre text not null
);

create table public.eventos (
  id text primary key,            -- ej. 101
  nombre text not null,
  lugar text not null default '',
  desde date not null,
  hasta date not null,
  ad text references public.expedientes(ad),
  estado text not null default 'Por iniciar',
  check (hasta >= desde)
);
create index eventos_ad_idx on public.eventos (ad);

create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  evento_id text not null references public.eventos(id) on delete cascade,
  punto text not null default '',
  codigo text not null,           -- DOC-NN, INFO-DOC-X
  asunto text not null,
  relevancia text not null default 'media' check (relevancia in ('alta','media','baja')),
  grupo text not null default 'P' check (grupo in ('P','S','I')),
  idioma text not null default '',
  recibido boolean not null default false,
  sintesis boolean not null default false,
  url_doc text,
  url_sintesis text,
  unique (evento_id, codigo)
);

create table public.tareas (
  id uuid primary key default gen_random_uuid(),
  dia date,
  titulo text not null check (char_length(titulo) between 1 and 300),
  ad text references public.expedientes(ad),
  prioridad text not null default 'media' check (prioridad in ('alta','media','baja')),
  estado text not null default 'Pendiente' check (estado in ('Pendiente','En Proceso','Completadas')),
  notion_id text unique,
  creado_por uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index tareas_ad_idx on public.tareas (ad);
create index tareas_dia_idx on public.tareas (dia);
create index tareas_creado_por_idx on public.tareas (creado_por);

create table public.novedades (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  ad text not null references public.expedientes(ad),
  texto text not null check (char_length(texto) between 1 and 2000),
  autor text not null default '',
  qrx boolean not null default false,
  cal jsonb,
  creado_por uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index novedades_ad_idx on public.novedades (ad);
create index novedades_creado_por_idx on public.novedades (creado_por);

create table public.recursos (
  id uuid primary key default gen_random_uuid(),
  evento_id text references public.eventos(id) on delete cascade,
  titulo text not null,
  url text not null
);
create index recursos_evento_id_idx on public.recursos (evento_id);

-- 3. Disparadores de control -----------------------------------------------
-- Quien creó una tarea o novedad, y cuándo, no se puede cambiar después.
create or replace function private.keep_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.creado_por := old.creado_por;
  new.created_at := old.created_at;
  return new;
end
$$;
revoke execute on function private.keep_creator() from public, anon, authenticated;
create trigger tareas_keep_creator before update on public.tareas
  for each row execute function private.keep_creator();
create trigger novedades_keep_creator before update on public.novedades
  for each row execute function private.keep_creator();

-- En documentos, edición solo cambia el estado (recibido, Síntesis). Lo demás (asunto, links, etc.) es de admin.
create or replace function private.documentos_solo_estado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select private.current_rol()) is distinct from 'admin'
     and (to_jsonb(new) - 'recibido' - 'sintesis') is distinct from (to_jsonb(old) - 'recibido' - 'sintesis') then
    raise exception 'Con rol edición solo se puede cambiar el estado del documento';
  end if;
  return new;
end
$$;
revoke execute on function private.documentos_solo_estado() from public, anon, authenticated;
create trigger documentos_solo_estado before update on public.documentos
  for each row execute function private.documentos_solo_estado();

-- 4. Reglas de seguridad (RLS) ---------------------------------------------
alter table public.members     enable row level security;
alter table public.expedientes enable row level security;
alter table public.eventos     enable row level security;
alter table public.documentos  enable row level security;
alter table public.tareas      enable row level security;
alter table public.novedades   enable row level security;
alter table public.recursos    enable row level security;

-- Lectura: cualquier miembro con rol asignado. Sin sesión o sin fila en members: nada.
create policy members_read     on public.members     for select to authenticated using ((select private.current_rol()) is not null);
create policy expedientes_read on public.expedientes for select to authenticated using ((select private.current_rol()) is not null);
create policy eventos_read     on public.eventos     for select to authenticated using ((select private.current_rol()) is not null);
create policy documentos_read  on public.documentos  for select to authenticated using ((select private.current_rol()) is not null);
create policy tareas_read      on public.tareas      for select to authenticated using ((select private.current_rol()) is not null);
create policy novedades_read   on public.novedades   for select to authenticated using ((select private.current_rol()) is not null);
create policy recursos_read    on public.recursos    for select to authenticated using ((select private.current_rol()) is not null);

-- Edición: tareas y novedades (edicion y admin). Al crear, creado_por tiene que ser quien crea.
create policy tareas_insert on public.tareas for insert to authenticated
  with check ((select private.current_rol()) in ('edicion','admin') and creado_por = (select auth.uid()));
create policy tareas_update on public.tareas for update to authenticated
  using ((select private.current_rol()) in ('edicion','admin')) with check ((select private.current_rol()) in ('edicion','admin'));
create policy tareas_delete on public.tareas for delete to authenticated
  using ((select private.current_rol()) in ('edicion','admin'));

create policy novedades_insert on public.novedades for insert to authenticated
  with check ((select private.current_rol()) in ('edicion','admin') and creado_por = (select auth.uid()));
create policy novedades_update on public.novedades for update to authenticated
  using ((select private.current_rol()) in ('edicion','admin')) with check ((select private.current_rol()) in ('edicion','admin'));
create policy novedades_delete on public.novedades for delete to authenticated
  using ((select private.current_rol()) in ('edicion','admin'));

-- Documentos: edición y admin actualizan (el disparador limita a edición al estado); solo admin crea y borra.
create policy documentos_update on public.documentos for update to authenticated
  using ((select private.current_rol()) in ('edicion','admin')) with check ((select private.current_rol()) in ('edicion','admin'));
create policy documentos_insert on public.documentos for insert to authenticated
  with check ((select private.current_rol()) = 'admin');
create policy documentos_delete on public.documentos for delete to authenticated
  using ((select private.current_rol()) = 'admin');

-- Administración: miembros (las altas las hace el disparador), expedientes, eventos y recursos.
create policy members_update on public.members for update to authenticated
  using ((select private.current_rol()) = 'admin') with check ((select private.current_rol()) = 'admin');
create policy members_delete on public.members for delete to authenticated
  using ((select private.current_rol()) = 'admin');

create policy expedientes_insert on public.expedientes for insert to authenticated with check ((select private.current_rol()) = 'admin');
create policy expedientes_update on public.expedientes for update to authenticated
  using ((select private.current_rol()) = 'admin') with check ((select private.current_rol()) = 'admin');
create policy expedientes_delete on public.expedientes for delete to authenticated using ((select private.current_rol()) = 'admin');

create policy eventos_insert on public.eventos for insert to authenticated with check ((select private.current_rol()) = 'admin');
create policy eventos_update on public.eventos for update to authenticated
  using ((select private.current_rol()) = 'admin') with check ((select private.current_rol()) = 'admin');
create policy eventos_delete on public.eventos for delete to authenticated using ((select private.current_rol()) = 'admin');

create policy recursos_insert on public.recursos for insert to authenticated with check ((select private.current_rol()) = 'admin');
create policy recursos_update on public.recursos for update to authenticated
  using ((select private.current_rol()) = 'admin') with check ((select private.current_rol()) = 'admin');
create policy recursos_delete on public.recursos for delete to authenticated using ((select private.current_rol()) = 'admin');

-- 5. Permisos de tabla ------------------------------------------------------
-- anon (sin sesión) no recibe ninguno. authenticated queda limitado por las reglas de arriba.
-- service_role (solo del lado servidor, p. ej. la futura sincronización con Notion) necesita permisos explícitos
-- porque se cortaron los automáticos; esa clave nunca va en la página.
revoke all on all tables in schema public from anon;
grant select, update, delete on public.members to authenticated;
grant select, insert, update, delete on
  public.expedientes, public.eventos, public.documentos,
  public.tareas, public.novedades, public.recursos
  to authenticated;
grant select, insert, update, delete on
  public.members, public.expedientes, public.eventos, public.documentos,
  public.tareas, public.novedades, public.recursos
  to service_role;
