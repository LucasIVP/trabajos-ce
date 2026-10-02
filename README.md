# trabajos-ce

Portal web con acceso por invitación para el seguimiento de semana de trabajo, novedades, eventos y documentos de un equipo. Página estática (HTML, CSS y JavaScript) que se conecta a un proyecto de Supabase para el login y los datos.

Este repositorio es **público**: contiene solo código. Los datos, las claves privadas y los documentos no se suben nunca.

## Estructura

- `index.html`, `css/`, `js/`: la página. `js/config.js` lleva la dirección del proyecto y la clave **pública** de Supabase.
- `vendor/supabase.js`: biblioteca cliente de Supabase (versión fija, copiada al repo para no depender de un CDN).
- `supabase/migrations/`: esquema de la base, roles y reglas de seguridad (RLS).
- `supabase/seed-prueba.sql` y `borrar-prueba.sql`: datos de prueba inventados, opcionales, y su limpieza.
- `supabase/primer-admin.sql`: asigna el rol de administración a la primera cuenta.

## Puesta en marcha

1. En el panel de Supabase, abrir el editor SQL y correr `supabase/migrations/20261002000000_esquema_inicial.sql`.
2. En Authentication, desactivar el registro abierto, activar la confirmación por correo y fijar una clave mínima de 12 caracteres.
3. Crear la primera cuenta (Authentication, Users, Add user) y correr `supabase/primer-admin.sql` con su correo.
4. Copiar la clave pública (Project Settings, API Keys, clave *publishable*) en `js/config.js`.
5. Publicar con GitHub Pages (Settings, Pages, rama `main`, carpeta raíz).
6. En Supabase, Authentication, URL Configuration: poner la dirección del sitio publicado como Site URL y en las URL de redirección, para que funcionen los enlaces de invitación.

## Seguridad

- Las reglas de acceso están en la base (RLS) y no en la página: ocultar un botón no protege un dato.
- Roles: `lectura` (ve), `edicion` (carga tareas, novedades y estado de documentos) y `admin` (además gestiona miembros y eventos).
- Nunca subir al repo: la clave `service_role`, la contraseña de la base, tokens de otros servicios ni archivos `.env`.
- `index.html` incluye una política de seguridad de contenido (CSP) por etiqueta meta. Si cambia la dirección del proyecto de Supabase, hay que actualizarla ahí también.
