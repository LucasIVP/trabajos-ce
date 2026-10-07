# Portal CE — Sistema de diseño "A4"

Blanco institucional con azul de marca y barra lateral blanca. Identidad propia y sobria: sin logos, escudos ni colores institucionales de terceros, sin emojis.
Los valores de esta guía son los que usa `css/style.css` (variables en `:root`). Si cambia uno, se cambia en los dos lugares.

## 1. Principios

- **Celular primero.** Se diseña para 320 px y se amplía. Barra inferior por debajo de 1024 px; barra lateral blanca fija desde 1024 px.
- **Lo urgente primero.** Inicio abre con "Requiere atención hoy"; cada pantalla empieza por lo que requiere acción.
- **El estado nunca es solo color.** Siempre ícono + texto. Ámbar = en espera / pendiente; verde = al día / completo; rojo apagado = solo "anulada" y "vencida".
- **Sin tarjetas dentro de tarjetas.** Un nivel de superficie; adentro, filas separadas por línea.
- **Lectura cómoda.** Párrafos de hasta ~65 caracteres de ancho.
- **Foco visible siempre:** contorno de 3 px en azul, separado 2 px.
- **Objetivos táctiles de al menos 44 × 44 px** por debajo de 1024 px.
- **Movimiento mínimo.** Solo transiciones de color de 150 ms o menos; con `prefers-reduced-motion: reduce`, ninguna.
- **Se evita el look genérico:** sin degradés (violeta ni ninguno), sin sombras grandes (como máximo una sombra de 1–2 px), sin emojis, sin flechas agregadas a botones o links, sin grillas de tarjetas idénticas con un cuadradito de ícono arriba, sin texto gris sobre fondos de color.
- **Texto institucional sobrio.** Fechas `dd/mm/aaaa`, siempre en hora de Argentina. Si un dato falta, se muestra "Sin dato"; no se inventa.

## 2. Color

Tokens en `:root`. El modo oscuro mantiene la jerarquía y usa un azul aclarado. Se aplica según `prefers-color-scheme` y se puede elegir a mano (`data-theme="light|dark"` en `<html>`, recordado solo en ese navegador).

| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| `--bg` | Fondo de página | `#F6F8FB` | `#0D1522` |
| `--surface` | Superficies (paneles, barra lateral) | `#FFFFFF` | `#142033` |
| `--surface-2` | Gris muy claro (tarjeta de usuario, filas alternas) | `#F1F5FA` | `#1A2A40` |
| `--ink` | Texto principal | `#0F1B2D` | `#E6ECF4` |
| `--ink-2` | Texto de navegación y secundario fuerte | `#33415C` | `#C9D3E1` |
| `--muted` | Texto secundario | `#55627A` | `#A3B0C4` |
| `--line` | Separadores (no es borde de control) | `#E1E7F0` | `#26364D` |
| `--control` | Borde de campos y controles (≥ 3:1) | `#7B879B` | `#6B7A93` |
| `--primary` | Acción principal, ítem activo, links | `#1D5FA8` | `#7FB2EC` |
| `--primary-hover` | Hover de la acción principal | `#174C87` | `#A6CBF3` |
| `--on-primary` | Texto sobre `--primary` | `#FFFFFF` | `#0D1522` |
| `--primary-soft` / `--primary-soft-ink` | Etiqueta azul suave (AD, chips) | `#E3EEFA` / `#1D5FA8` | `#1B3556` / `#A6CBF3` |
| `--hero` / `--hero-ink` / `--hero-muted` | Tarjeta del evento activo | `#1D5FA8` / `#FFFFFF` / `#D6E6F8` | `#1B4C86` / `#FFFFFF` / `#D6E6F8` |
| `--warn-bg` / `--warn` | Ámbar: en espera, pendiente | `#FFF1D6` / `#7A4B00` | `#3B2C08` / `#F5CF7A` |
| `--warn-strong` / `--on-warn-strong` | Ámbar fuerte: contadores, "Evento activo" | `#F4B63F` / `#3A2600` | `#F4B63F` / `#3A2600` |
| `--ok-bg` / `--ok` | Verde: al día, completo | `#E6F4F1` / `#1F5A40` | `#0F3027` / `#8FD9C2` |
| `--danger-bg` / `--danger` | Rojo apagado: solo anulada y vencida | `#FDE7E1` / `#A3341B` | `#3D1A14` / `#F0A898` |

Contraste medido (WCAG 2.x, texto ≥ 4,5:1; bordes de control ≥ 3:1):

| Par | Claro | Oscuro |
|---|---|---|
| Tinta sobre fondo / superficie | 16,3 / 17,3 | 15,4 / 13,8 |
| Secundario sobre fondo / superficie / gris 2 | 5,8 / 6,2 / 5,6 | — / 7,5 / 6,6 |
| Texto sobre azul (botón) / sobre hover | 6,5 / 8,7 | 8,3 / — |
| Azul (link) sobre superficie / fondo | 6,5 / 6,1 | 7,4 / 8,3 |
| Azul sobre azul suave | 5,5 | 7,4 |
| Tarjeta del evento: blanco / celeste | 6,5 / 5,1 | 8,7 / 6,8 |
| Ámbar / ámbar fuerte | 6,6 / 8,0 | 9,1 / 8,0 |
| Verde | 7,2 | 8,7 |
| Rojo apagado | 5,8 | 7,9 |
| Borde de control sobre superficie / fondo | 3,6 / 3,4 | 3,8 / 4,2 |

El rojo del mockup (`#C23B1F` sobre `#FDE7E1`, 4,49:1) no llega a 4,5: se usa `#A3341B`.

## 3. Tipografía

Autoalojadas en `fonts/`, woff2, subconjunto latino (incluye ñ, ¿, ¡, ª, º), `font-display: swap`. Licencia SIL Open Font License 1.1 (`fonts/LICENSE-*.txt`). Origen: paquetes oficiales `@fontsource` 5.3.0. Peso total: 129 KB (131 720 bytes).

| Rol | Familia | Pesos | Reserva |
|---|---|---|---|
| Títulos | Bricolage Grotesque | 600, 700 | `system-ui, sans-serif` |
| Texto | Public Sans | 400, 500, 600 | `system-ui, sans-serif` |
| Números de expediente, fojas, fechas, contadores | JetBrains Mono | 400, 500 | `ui-monospace, monospace` |

Números con `font-variant-numeric: tabular-nums`. Escala: cuerpo 15 px (14 en tablas); h1 `clamp(26px, 4vw, 40px)` con `letter-spacing: -0.02em`; h2 22 px; etiquetas 12–13 px; número de la cuenta regresiva `clamp(64px, 12vw, 112px)`.

Huellas SHA-256:

```
b34fc8c1ef0ac8798455ac2979eae4b4f90f0d327e3584d1032fa77a8a9a66ca  bricolage-grotesque-latin-600-normal.woff2
4c373ce3c1cca41c864eb3e27c059a59fc6310547ab9c9b6cd780d387ba24206  bricolage-grotesque-latin-700-normal.woff2
36274b5787b4f03b27e65ae971d6c808a96838ccd60c9dabaee154889b6bba82  public-sans-latin-400-normal.woff2
55e866a00caa197bc9fafa52c907f4dfe88e51bbb3f585c777931d03eb961e96  public-sans-latin-500-normal.woff2
c7842f97346df1b3b470e9d71acde90f132dd858508ec5ae6606401e5d0938f7  public-sans-latin-600-normal.woff2
14425ba9c695763c1547f48a206b7aa60350a33ae23de09f0407877f3fcd89eb  jetbrains-mono-latin-400-normal.woff2
cb182feeed4d798ff6961d3c79f7026279448fca0676438aaecb21f3fc39553a  jetbrains-mono-latin-500-normal.woff2
```

## 4. Espaciado, forma y elevación

- Espacio: 4, 8, 12, 16, 20, 24, 28, 36, 44 px. Margen de contenido: 16 px en celular, 36–44 px en escritorio.
- Radios: 10 px controles e ítems de navegación, 14 px tarjetas de fila, 20 px paneles y tarjeta del evento. Píldoras con radio completo.
- Elevación: sombra única `0 1px 2px rgba(15,27,45,.04)` en paneles claros; en oscuro, ninguna (la separación la da el borde).
- Ancho máximo de contenido: 1180 px.

## 5. Íconos

SVG en línea, trazo de 2 px, `stroke="currentColor"`, sin relleno, 20 × 20 (12–16 en chips). Con `aria-hidden="true"` cuando hay texto al lado. Sin librerías externas.

## 6. Componentes

### Navegación
- **Escritorio (≥ 1024 px):** barra lateral blanca de 248 px, fija. Arriba, el logotipo "CE" en un cuadrado azul con "Portal CE". Grupos "Trabajo" (Inicio, Semana, Novedades, Eventos) y "Administración" (Miembros, solo admin) con rótulo en mayúsculas pequeñas. Ítem: 44 px de alto, radio 10, ícono + texto; activo con fondo azul y texto blanco (`aria-current="page"`). Abajo, tarjeta de usuario en gris 2 con inicial, nombre, rol, botón de tema y Salir.
- **Celular y tablet (< 1024 px):** barra superior con la marca, tema y Salir; barra inferior fija con 5 lugares (Inicio, Semana, Novedades, Eventos, Cuenta), ícono + texto, 56 px, `env(safe-area-inset-bottom)`. Miembros se abre desde Cuenta.
- Los ítems son enlaces (`<a href="#…">`): se pueden abrir en otra pestaña.

### Encabezado de Inicio
Fecha en mono y mayúsculas pequeñas (`MIÉRCOLES 07/10/2026`), saludo en h1 y, al lado, un resumen ("Hoy hay N cosas para resolver") con el número en ámbar.

### Tarjeta del evento activo
Panel azul (`--hero`) con radio 20 y círculos concéntricos decorativos (SVG, opacidad 0,18, `aria-hidden`). Chip ámbar fuerte "Evento activo". Número de días grande en Bricolage 700 y, al lado, "días para la" + nombre del evento + lugar. Barra de avance en tres tramos con separación de 4 px: blanco (listos), ámbar fuerte (sin Síntesis), blanco al 28 % (no disponibles); debajo, los tres números en mono. Botones "Abrir" y "Ver todos" en versión clara sobre azul. Los anchos de la barra se fijan desde JS con `style.setProperty`.

### Bloque "Requiere atención hoy"
Panel blanco, radio 20. Título h2 y contador en píldora ámbar fuerte. Filas separadas por línea: ícono en un cuadrado de 40 px con fondo de estado, texto principal, detalle en secundario y botón "Ver …". Si no hay nada: "Nada pendiente para hoy" con check verde.

### Chips de estado
Píldora 12,5–13 px con ícono + texto: verde (Con Síntesis, Hecha, Al día), ámbar (Falta Síntesis, En espera (Qrx), Prioridad alta), rojo apagado (Anulada, Vencida), neutro gris 2 (No disponible, No lleva Síntesis, En proceso). Etiqueta de expediente: mono sobre azul suave, radio 6 (`AD 901/26`). Filtros: píldoras de 44 px, activo en azul con contador en mono.

### Botones
- **Principal:** azul, texto blanco, radio 10, 44 px en celular. Hover: `--primary-hover`.
- **Secundario:** blanco con borde de control y texto azul.
- **Peligro (Borrar):** secundario con texto rojo apagado; siempre pide confirmación.
- Deshabilitado: opacidad 0,55 y `aria-busy="true"` mientras envía.

### Documentos
- **Contenido ≥ 760 px:** tabla (Punto, Documento, Asunto, Relevancia, Idioma, Estado, Archivos).
- **Más angosto:** una tarjeta por documento: código (mono) y asunto, chips, botones "Abrir" / "Abrir Síntesis" o "Sin archivo", acciones de estado y Borrar.

### Estados de vista
Mismo estilo en todas las pantallas: cargando ("Cargando…", `role="status"`), vacío (texto secundario centrado), error (texto + "Reintentar", `role="alert"`), éxito (aviso flotante con `role="status"`).

## 7. PENDIENTE (TANDA 2): Expediente y línea de tiempo

Diseño previsto según el mockup "ExpedienteA4": migas "Expedientes / AD"; etiqueta AD, estado, tipo; título; EE GDE y próxima revisión (chip ámbar con la fecha y "en N días"). Línea de tiempo mixta (novedades + fojas) con línea vertical; cada foja con su número `F008` en una pastilla azul a la izquierda y la tarjeta a la derecha; filtros Todo / Novedades / Documentos con contador. Foja anulada: borde punteado y chip "Anulada" (rojo apagado); una foja que reemplaza a otra muestra "reemplaza a F0XX". Nunca se borran. Panel Resumen al costado. Formulario "Agregar a la línea de tiempo" (Solo mensaje / Con documento) solo para edición y admin; el número de foja lo asigna el servidor. Estado, tipo y próxima revisión: "Sin dato" hasta que existan en la base.

## 8. Seguridad de la interfaz

- Todo dato de la base se inserta con `esc()` o `textContent`.
- Links solo `https` (`safeUrl`), con `rel="noopener noreferrer"`.
- CSP por `<meta>`: `default-src 'none'`, scripts y estilos solo del sitio (sin `'unsafe-inline'`), fuentes solo del sitio, conexión solo al proyecto de Supabase. Sin estilos en línea en las plantillas.
