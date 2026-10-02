-- DATOS DE PRUEBA, INVENTADOS. Opcional: sirven para probar las pantallas y los roles.
-- Todos los identificadores empiezan con PRUEBA / prueba, para borrarlos sin tocar datos reales (ver borrar-prueba.sql).
-- No cargar acá información real.

insert into public.expedientes (ad, nombre) values
  ('PRUEBA-1', 'Evento de prueba A'),
  ('PRUEBA-2', 'Evento de prueba B'),
  ('PRUEBA-3', 'Gestiones generales de prueba');

insert into public.eventos (id, nombre, lugar, desde, hasta, ad, estado) values
  ('prueba-a', 'Sesión de prueba A', 'Ciudad de prueba', current_date + 12, current_date + 14, 'PRUEBA-1', 'En preparación'),
  ('prueba-b', 'Asamblea de prueba B', 'Otra ciudad de prueba', current_date + 58, current_date + 61, 'PRUEBA-2', 'Por iniciar');

insert into public.documentos (evento_id, punto, codigo, asunto, relevancia, grupo, idioma, recibido, sintesis) values
  ('prueba-a', '1.2', 'DOC-01', 'Documento de prueba 1', 'baja',  'P', 'ES', true,  true),
  ('prueba-a', '2.1', 'DOC-02', 'Documento de prueba 2', 'media', 'P', 'EN', true,  false),
  ('prueba-a', '5.4', 'DOC-03', 'Documento de prueba 3', 'alta',  'P', '',   false, false),
  ('prueba-a', 'S 3', 'DOC-04', 'Documento de prueba 4', 'media', 'S', 'EN', true,  true),
  ('prueba-a', 'Info','INFO-DOC-A', 'Informativo de prueba', 'baja', 'I', 'ES', true, true);

insert into public.tareas (dia, titulo, ad, prioridad, estado) values
  (date_trunc('week', current_date)::date,     'Tarea de prueba 1', 'PRUEBA-1', 'media', 'Completadas'),
  (date_trunc('week', current_date)::date + 1, 'Tarea de prueba 2', 'PRUEBA-1', 'alta',  'En Proceso'),
  (date_trunc('week', current_date)::date + 3, 'Tarea de prueba 3', 'PRUEBA-3', 'alta',  'Pendiente'),
  (null,                                       'Tarea de prueba sin día', 'PRUEBA-2', 'media', 'Pendiente');

insert into public.novedades (fecha, ad, texto, autor, qrx) values
  (current_date - 1, 'PRUEBA-1', 'Novedad de prueba. Se coordinan las pruebas de conexión.', 'xx', false),
  (current_date - 2, 'PRUEBA-2', 'Novedad de prueba en espera de respuesta.', 'xx', true);
