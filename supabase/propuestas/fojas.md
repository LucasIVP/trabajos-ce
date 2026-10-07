# Propuesta: fojas de expediente (v1, solo link a Drive)

**Estado: aprobada y aplicada el 07/10/2026** como `supabase/migrations/20261007020000_fojas.sql` (probada antes en una transacción descartada). `fojas.sql` conserva la versión comentada, con el sembrado del contador y la prueba de concurrencia.

## Qué resuelve
- Una tabla `fojas` ligada al expediente, con número, descripción, tipo, link, estado (`reservada`, `vigente`, `anulada`), "reemplaza a", autor y fechas.
- Un mismo número no puede repetirse dentro de un expediente: lo garantiza `UNIQUE (expediente, numero)`.
- **El número lo asigna el servidor**, nunca el navegador. Es el máximo + 1, con un bloqueo por expediente: dos altas simultáneas esperan una detrás de la otra.
- **Alta en dos pasos**, para que el nombre del archivo en Drive coincida con el número:
  1. `reservar_foja`: el servidor reserva el número y la página muestra el nombre sugerido, `#[AD] - F[número] - [DESCRIPCIÓN]`.
  2. Se sube el archivo a Drive con ese nombre.
  3. `confirmar_foja`: se guarda el link y la foja queda vigente.
- **Nada se borra:** no hay permiso de DELETE ni desde la página ni desde el servidor. Una reserva abandonada se cancela y queda anulada; su número no se reutiliza.
- **Anular** (solo admin, con motivo): solo cambia el estado y registra quién, cuándo y por qué.
- **El servidor valida el link:** solo `https://drive.google.com/…` o `https://docs.google.com/…`.
- **Permisos:**
  - Leen todos los miembros con rol y segundo factor.
  - Escriben solo edición y admin, siempre a través de las funciones.
  - Anula solo admin.
  - Todo pasa por `private.current_rol()`, que ya exige el segundo factor (aal2).
- **Auditoría:** toda alta, confirmación y anulación queda en `public.auditoria`, con el trigger que ya existe.
- **Expediente:** columnas nuevas `estado`, `tipo`, `proxima_revision`, `ee_gde` y `carpeta_url`, que la pantalla hoy muestra como "Sin dato".

## Cómo encaja con la página
La página (rama `diseno-ui`) ya llama a `reservar_foja`, `confirmar_foja`, `cancelar_reserva_foja` y `anular_foja` con estos mismos nombres y parámetros. Mientras la tabla no exista, muestra el aviso y deshabilita "Reservar número de foja". Al aplicar la propuesta, se habilita sola.

## Contador inicial
Para que un expediente que ya tiene fojas en Drive no arranque en F001, hay dos caminos (ver la sección 4 del SQL):
- **Sembrar** el contador con la foja más alta encontrada en Drive (una línea por expediente).
- **Importar** las fojas viejas a `public.fojas` (Etapa A del documento de referencia). La primera reserva toma sola el máximo importado.

## Prueba de concurrencia
Sección 5 del SQL: dos conexiones abiertas a la vez. La segunda reserva queda esperando hasta que la primera termina, y obtiene el número siguiente. El SQL Editor de Supabase no sirve para esto porque confirma cada corrida: hace falta psql u otro cliente que mantenga la transacción abierta.

## Riesgos y decisiones abiertas
1. **Reservas abandonadas.** Quien reserva y no sube el archivo deja una foja "reservada". La página la muestra con "Completar link". Si se cancela, queda anulada con su número. No hay limpieza automática: el plan gratuito no tiene `pg_cron` activado. Propuesta: revisarlas a mano o sumar después un aviso en Inicio.
2. **El link no garantiza el archivo.** El servidor valida el dominio, no que el archivo exista ni que su nombre tenga el número correcto. Validar eso exige la API de Drive desde una función de servidor (Etapa B del documento de referencia).
3. **Quién confirma.** Cualquier persona de edición o admin puede confirmar una reserva ajena; cancelarla, solo quien la reservó o un admin. ¿Lo dejamos así?
4. **Estado y tipo del expediente** copian los valores de Notion. Si Notion agrega uno nuevo, hay que ampliar el check.
5. **Borrar un expediente con fojas** queda bloqueado (`on delete restrict`). Es intencional.
6. **Probar antes de aplicar.** El plan gratuito no tiene copias de la base (branching). Se puede probar en una transacción que termine en ROLLBACK, como se hizo con la migración de seguridad. La prueba de concurrencia necesita dos conexiones.
7. **Aplicarla:** como el MCP rechaza `DROP` y `DELETE`, igual que antes, la corrés vos en el SQL Editor.
