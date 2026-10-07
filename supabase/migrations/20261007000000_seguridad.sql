-- Portal CE: endurecimiento previo a producción (auditoría del 07/10/2026).
-- 1) Segundo factor (MFA) obligatorio para todos: sin código no se ve ni se escribe nada.
-- 2) Registro de auditoría de toda alta, cambio y borrado (solo lo ve admin).
-- 3) Registro de errores de la página (sin datos de expedientes; solo lo ve admin).
-- 4) Permisos por columna: cada rol solo escribe las columnas que la página usa.
-- 5) Nadie cambia su propio rol y siempre queda al menos un admin.
-- 6) Validación en la base: links solo https y largos máximos.
-- ANTES DE APLICAR: cada admin tiene que haber activado el segundo factor desde la página;
-- si no, pierde el acceso hasta activarlo (la página lo pide al ingresar).

-- 1. Segundo factor obligatorio ---------------------------------------------------
-- El JWT trae el nivel de autenticación en el claim aal: aal2 = entró con clave y código.
-- Todas las reglas usan current_rol(): si la sesión no es aal2, el rol es null y no hay acceso a nada.
create or replace function private.current_rol()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.rol from public.members m
  where m.id = (select auth.uid())
    and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
$$;

create or replace function private.es_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(private.current_rol() = 'admin' and (select auth.jwt() ->> 'aal') = 'aal2', false)
$$;
revoke execute on function private.es_admin() from public, anon;
grant execute on function private.es_admin() to authenticated;

drop policy members_update on public.members;
drop policy members_delete on public.members;
create policy members_update on public.members for update to authenticated
  using ((select private.es_admin())) with check ((select private.es_admin()));
create policy members_delete on public.members for delete to authenticated
  using ((select private.es_admin()));

drop policy expedientes_insert on public.expedientes;
drop policy expedientes_update on public.expedientes;
drop policy expedientes_delete on public.expedientes;
create policy expedientes_insert on public.expedientes for insert to authenticated with check ((select private.es_admin()));
create policy expedientes_update on public.expedientes for update to authenticated
  using ((select private.es_admin())) with check ((select private.es_admin()));
create policy expedientes_delete on public.expedientes for delete to authenticated using ((select private.es_admin()));

drop policy eventos_insert on public.eventos;
drop policy eventos_update on public.eventos;
drop policy eventos_delete on public.eventos;
create policy eventos_insert on public.eventos for insert to authenticated with check ((select private.es_admin()));
create policy eventos_update on public.eventos for update to authenticated
  using ((select private.es_admin())) with check ((select private.es_admin()));
create policy eventos_delete on public.eventos for delete to authenticated using ((select private.es_admin()));

drop policy recursos_insert on public.recursos;
drop policy recursos_update on public.recursos;
drop policy recursos_delete on public.recursos;
create policy recursos_insert on public.recursos for insert to authenticated with check ((select private.es_admin()));
create policy recursos_update on public.recursos for update to authenticated
  using ((select private.es_admin())) with check ((select private.es_admin()));
create policy recursos_delete on public.recursos for delete to authenticated using ((select private.es_admin()));

drop policy documentos_insert on public.documentos;
drop policy documentos_delete on public.documentos;
create policy documentos_insert on public.documentos for insert to authenticated with check ((select private.es_admin()));
create policy documentos_delete on public.documentos for delete to authenticated using ((select private.es_admin()));

-- Un admin sin segundo factor edita documentos como edición: solo el estado.
create or replace function private.documentos_solo_estado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and not (select private.es_admin())
     and (to_jsonb(new) - 'recibido' - 'sintesis') is distinct from (to_jsonb(old) - 'recibido' - 'sintesis') then
    raise exception 'Con rol edición (o admin sin segundo factor) solo se puede cambiar el estado del documento';
  end if;
  return new;
end
$$;
revoke execute on function private.documentos_solo_estado() from public, anon, authenticated;

-- 2. Auditoría -----------------------------------------------------------------
-- Cada alta, cambio y borrado queda copiado con quién, cuándo, y la fila antes y después.
-- Nadie la puede modificar desde la API; solo admin (con segundo factor) la lee.
create table public.auditoria (
  id bigint generated always as identity primary key,
  momento timestamptz not null default now(),
  usuario uuid,
  rol text,
  tabla text not null,
  operacion text not null,
  fila text,
  antes jsonb,
  despues jsonb
);
create index auditoria_momento_idx on public.auditoria (momento desc);
create index auditoria_tabla_fila_idx on public.auditoria (tabla, fila);

create or replace function private.auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  d jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  insert into public.auditoria (usuario, rol, tabla, operacion, fila, antes, despues)
  values (
    (select auth.uid()),
    coalesce(private.current_rol(), nullif(current_setting('role', true), 'none'), session_user),
    tg_table_name,
    tg_op,
    coalesce(d ->> 'id', a ->> 'id', d ->> 'ad', a ->> 'ad'),
    a,
    d
  );
  return null;
end
$$;
revoke execute on function private.auditar() from public, anon, authenticated;

create trigger auditar after insert or update or delete on public.novedades   for each row execute function private.auditar();
create trigger auditar after insert or update or delete on public.tareas      for each row execute function private.auditar();
create trigger auditar after insert or update or delete on public.documentos  for each row execute function private.auditar();
create trigger auditar after insert or update or delete on public.eventos     for each row execute function private.auditar();
create trigger auditar after insert or update or delete on public.recursos    for each row execute function private.auditar();
create trigger auditar after insert or update or delete on public.expedientes for each row execute function private.auditar();
create trigger auditar after insert or update or delete on public.members     for each row execute function private.auditar();

alter table public.auditoria enable row level security;
create policy auditoria_read on public.auditoria for select to authenticated using ((select private.es_admin()));
grant select on public.auditoria to authenticated;
grant select on public.auditoria to service_role;

-- 3. Errores de la página -------------------------------------------------------
-- La página registra fallas técnicas (vista, mensaje corto, navegador). Nunca textos de novedades ni documentos.
create table public.errores (
  id bigint generated always as identity primary key,
  momento timestamptz not null default now(),
  usuario uuid default auth.uid(),
  vista text not null default '' check (char_length(vista) <= 40),
  mensaje text not null check (char_length(mensaje) <= 300),
  navegador text not null default '' check (char_length(navegador) <= 200)
);
create index errores_momento_idx on public.errores (momento desc);
alter table public.errores enable row level security;
create policy errores_insert on public.errores for insert to authenticated with check (usuario = (select auth.uid()));
create policy errores_read   on public.errores for select to authenticated using ((select private.es_admin()));
create policy errores_delete on public.errores for delete to authenticated using ((select private.es_admin()));
grant insert (vista, mensaje, navegador) on public.errores to authenticated;
grant select, delete on public.errores to authenticated;
grant select, delete on public.errores to service_role;

-- 4. Permisos por columna -------------------------------------------------------
-- members: admin cambia nombre, iniciales y rol; id y email no se tocan desde la página.
revoke update on public.members from authenticated;
grant update (nombre, iniciales, rol) on public.members to authenticated;

-- tareas y novedades: creado_por, created_at, id y notion_id los pone la base o la sincronización.
revoke insert, update on public.tareas from authenticated;
grant insert (dia, titulo, ad, prioridad, estado) on public.tareas to authenticated;
grant update (dia, titulo, ad, prioridad, estado) on public.tareas to authenticated;

revoke insert, update on public.novedades from authenticated;
grant insert (fecha, ad, texto, autor, qrx, cal) on public.novedades to authenticated;
grant update (fecha, ad, texto, autor, qrx, cal) on public.novedades to authenticated;

-- 5. Roles: nadie cambia el suyo y siempre queda un admin -----------------------
create or replace function private.proteger_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and current_setting('role', true) = 'authenticated'
     and old.id = (select auth.uid()) and new.rol is distinct from old.rol then
    raise exception 'No podés cambiar tu propio rol';
  end if;
  if old.rol = 'admin' and (tg_op = 'DELETE' or new.rol is distinct from 'admin')
     and not exists (select 1 from public.members m where m.rol = 'admin' and m.id <> old.id) then
    raise exception 'Tiene que quedar al menos una cuenta admin';
  end if;
  return coalesce(new, old);
end
$$;
revoke execute on function private.proteger_roles() from public, anon, authenticated;
create trigger proteger_roles before update or delete on public.members
  for each row execute function private.proteger_roles();

-- 6. Validación en la base ------------------------------------------------------
alter table public.recursos   add constraint recursos_url_https check (url ~ '^https://' and char_length(url) <= 2000);
alter table public.recursos   add constraint recursos_titulo_largo check (char_length(titulo) between 1 and 300);
alter table public.documentos add constraint documentos_url_doc_https check (url_doc is null or (url_doc ~ '^https://' and char_length(url_doc) <= 2000));
alter table public.documentos add constraint documentos_url_sintesis_https check (url_sintesis is null or (url_sintesis ~ '^https://' and char_length(url_sintesis) <= 2000));
alter table public.documentos add constraint documentos_largos check (char_length(asunto) <= 1000 and char_length(codigo) <= 40 and char_length(punto) <= 20 and char_length(idioma) <= 20);
alter table public.novedades  add constraint novedades_autor_largo check (char_length(autor) <= 20);
alter table public.novedades  add constraint novedades_cal_largo check (cal is null or octet_length(cal::text) <= 4000);
alter table public.members    add constraint members_largos check (char_length(nombre) <= 120 and char_length(iniciales) <= 8);
alter table public.expedientes add constraint expedientes_nombre_largo check (char_length(nombre) <= 300);
alter table public.eventos    add constraint eventos_largos check (char_length(nombre) <= 300 and char_length(lugar) <= 200 and char_length(estado) <= 40);
