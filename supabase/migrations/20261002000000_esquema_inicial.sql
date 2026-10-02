-- Portal CE: esquema inicial. Borrador, sin probar. Aplicar como migración en el proyecto nuevo de Supabase.

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
create or replace function public.current_rol()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.rol from public.members m where m.id = (select auth.uid())
$$;
revoke execute on function public.current_rol() from public, anon;
grant execute on function public.current_rol() to authenticated;

-- Al invitar a alguien, se crea su fila en members con rol lectura (el rol mínimo).
create or replace function public.handle_new_user()
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
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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
  estado text not null default 'Por iniciar'
);

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

create table public.recursos (
  id uuid primary key default gen_random_uuid(),
  evento_id text references public.eventos(id) on delete cascade,
  titulo text not null,
  url text not null
);

-- 3. Reglas de seguridad (RLS) ---------------------------------------------
alter table public.members     enable row level security;
alter table public.expedientes enable row level security;
alter table public.eventos     enable row level security;
alter table public.documentos  enable row level security;
alter table public.tareas      enable row level security;
alter table public.novedades   enable row level security;
alter table public.recursos    enable row level security;

-- Lectura: cualquier miembro con rol asignado. Sin sesión o sin fila en members: nada.
create policy members_read     on public.members     for select to authenticated using (public.current_rol() is not null);
create policy expedientes_read on public.expedientes for select to authenticated using (public.current_rol() is not null);
create policy eventos_read     on public.eventos     for select to authenticated using (public.current_rol() is not null);
create policy documentos_read  on public.documentos  for select to authenticated using (public.current_rol() is not null);
create policy tareas_read      on public.tareas      for select to authenticated using (public.current_rol() is not null);
create policy novedades_read   on public.novedades   for select to authenticated using (public.current_rol() is not null);
create policy recursos_read    on public.recursos    for select to authenticated using (public.current_rol() is not null);

-- Edición: tareas, novedades y documentos (edicion y admin).
create policy tareas_write on public.tareas for all to authenticated
  using (public.current_rol() in ('edicion','admin')) with check (public.current_rol() in ('edicion','admin'));
create policy novedades_write on public.novedades for all to authenticated
  using (public.current_rol() in ('edicion','admin')) with check (public.current_rol() in ('edicion','admin'));
create policy documentos_write on public.documentos for all to authenticated
  using (public.current_rol() in ('edicion','admin')) with check (public.current_rol() in ('edicion','admin'));

-- Administración: miembros, expedientes, eventos y recursos.
create policy members_admin     on public.members     for all to authenticated
  using (public.current_rol() = 'admin') with check (public.current_rol() = 'admin');
create policy expedientes_admin on public.expedientes for all to authenticated
  using (public.current_rol() = 'admin') with check (public.current_rol() = 'admin');
create policy eventos_admin     on public.eventos     for all to authenticated
  using (public.current_rol() = 'admin') with check (public.current_rol() = 'admin');
create policy recursos_admin    on public.recursos    for all to authenticated
  using (public.current_rol() = 'admin') with check (public.current_rol() = 'admin');

-- Permisos de tabla. Se asume que en el proyecto está DESACTIVADO "Automatically expose new tables":
-- hay que dar los permisos a mano. anon (sin sesión) no recibe ninguno; authenticated queda limitado por las reglas de arriba.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on
  public.members, public.expedientes, public.eventos, public.documentos,
  public.tareas, public.novedades, public.recursos
  to authenticated;
