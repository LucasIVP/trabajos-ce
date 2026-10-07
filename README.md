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
- **Segundo factor obligatorio para todos** (app de códigos TOTP). La base no entrega ni acepta nada de una sesión que no pasó el código (`aal2`); la página obliga a configurarlo al primer ingreso. Si alguien pierde el celular, se le borra el factor desde el panel de Supabase (Authentication, Users) y lo vuelve a configurar.
- **Registro de cambios:** toda alta, cambio y borrado queda copiado en `auditoria` (solo lo lee admin, nadie lo modifica desde la API). Los errores de la página van a `errores`, sin textos de datos.
- **Permisos por columna:** cada rol solo escribe las columnas que la página usa; nadie cambia su propio rol y siempre queda al menos un admin. Los links tienen que ser `https`.
- **Sesión:** se cierra sola tras 30 minutos sin uso (control del navegador). La página no se deja abrir dentro de otro sitio y no carga fuentes ni scripts de terceros.
- **Correo:** el servicio de correo por defecto de Supabase no entrega a direcciones fuera del equipo de la organización; para invitaciones y recuperación de clave hace falta un SMTP propio.
- Antes de aplicar `20261007000000_seguridad.sql`, cada admin tiene que haber activado el segundo factor desde la página.
