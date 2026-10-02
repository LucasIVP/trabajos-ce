-- Borra SOLO los datos de prueba cargados con seed-prueba.sql (identificadores PRUEBA / prueba).
-- Revisar antes de correr. No toca nada que no empiece con esos prefijos.
delete from public.tareas      where ad like 'PRUEBA-%';
delete from public.novedades   where ad like 'PRUEBA-%';
delete from public.documentos  where evento_id like 'prueba-%';
delete from public.recursos    where evento_id like 'prueba-%';
delete from public.eventos     where id like 'prueba-%';
delete from public.expedientes where ad like 'PRUEBA-%';
