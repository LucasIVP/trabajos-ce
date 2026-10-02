-- Portal CE: corrige permisos que quedaron de más después del esquema inicial.

-- 1. Permisos por defecto ---------------------------------------------------
-- El esquema inicial revocó solo select/insert/update/delete; los defaults de Supabase también dan
-- truncate, references, trigger y maintain, y esos quedaron. Se cortan todos.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated, service_role;

-- 2. Tablas existentes: solo lo que la página usa -----------------------------
-- truncate no pasa por RLS, así que authenticated no lo puede tener.
revoke all on all tables in schema public from anon, authenticated, service_role;
grant select, update, delete on public.members to authenticated;
grant select, insert, update, delete on
  public.expedientes, public.eventos, public.documentos,
  public.tareas, public.novedades, public.recursos
  to authenticated;
grant select, insert, update, delete on
  public.members, public.expedientes, public.eventos, public.documentos,
  public.tareas, public.novedades, public.recursos
  to service_role;

-- 3. rls_auto_enable --------------------------------------------------------
-- Función que Supabase crea en public para el disparador de eventos ensure_rls (activa RLS en cada tabla nueva).
-- Es security definer y quedó ejecutable por anon y authenticated vía /rest/v1/rpc. Se le quita ese permiso;
-- el disparador de eventos la sigue usando igual.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
