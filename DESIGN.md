# Portal CE — Sistema de diseño

Guía de interfaz del portal. Identidad propia y sobria: sin logos, escudos ni colores institucionales de terceros, sin emojis.
Los valores de esta guía son los que usa `css/style.css` (variables en `:root`). Si cambia uno, se cambia en los dos lugares.

## 1. Principios

- **Celular primero.** Se diseña para 320 px y se amplía. Navegación inferior en celular, barra superior en escritorio.
- **Lo urgente primero.** Cada pantalla abre con lo que requiere acción; el resto queda debajo.
- **Un solo color de alerta: ámbar.** El verde solo indica "completo". No hay rojo decorativo.
- **El estado nunca es solo color.** Siempre ícono + texto ("Falta Síntesis", "Con Síntesis").
- **Sin tarjetas dentro de tarjetas.** Un nivel de superficie; dentro, filas separadas por línea.
- **Lectura cómoda.** Párrafos de hasta ~65 caracteres de ancho (`max-width: 65ch`).
- **Foco visible siempre** (contorno de 2 px en color de acción, separado 2 px).
- **Objetivos táctiles de al menos 44 × 44 px** en celular (botones, chips, pestañas, ítems de navegación).
- **Movimiento mínimo.** Solo transiciones de estado de 150 ms o menos. Nada decorativo. Con `prefers-reduced-motion: reduce`, ninguna transición.
- **Se evita el diseño genérico:** sin gradientes decorativos, sin flechas agregadas a botones o links, sin grillas de tarjetas idénticas con un cuadradito de ícono arriba, sin texto gris sobre fondos de color.
- **Texto institucional sobrio.** Fechas `dd/mm/aaaa` (en el tablero semanal, `dd/mm` porque el año figura en el encabezado). Si un dato falta, se muestra vacío con un aviso; no se inventa.

## 2. Color

Tokens en `:root`. El modo oscuro mantiene la misma jerarquía. Se aplica según `prefers-color-scheme` y se puede elegir a mano (atributo `data-theme="light|dark"` en `<html>`, recordado en el navegador).

| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| `--bg` | Fondo de página | `#E9ECE8` | `#0E1420` |
| `--surface` | Superficies (paneles, tarjetas) | `#F9FAF7` | `#172033` |
| `--ink` | Texto principal | `#121C33` | `#E6EAF0` |
| `--muted` | Texto secundario | `#4F5B6E` | `#A7B2C2` |
| `--line` | Separadores (no es borde de control) | `#CFD5CD` | `#2E3A52` |
| `--control` | Borde de campos y controles (≥ 3:1) | `#7D877A` | `#66738C` |
| `--primary` | Acción principal, evento activo, links | `#1A2E52` | `#A9C1E8` |
| `--on-primary` | Texto sobre `--primary` | `#F2F4EE` | `#0E1420` |
| `--warn-bg` / `--warn` | Ámbar de urgencia (fondo / texto) | `#F6E3B4` / `#6B4400` | `#3A2C0B` / `#F3D27F` |
| `--ok-bg` / `--ok` | Verde de estado completo (fondo / texto) | `#DCEBE2` / `#1F5A40` | `#12301F` / `#93D5B1` |

Contraste medido (WCAG 2.x):

| Par | Claro | Oscuro |
|---|---|---|
| Texto principal sobre fondo / superficie | 14,2 / 16,2 | 15,3 / 13,5 |
| Texto secundario sobre fondo / superficie | 5,8 / 6,6 | 8,6 / 7,6 |
| Texto sobre acción | 12,2 | 10,1 |
| Acción (link) sobre superficie | 12,9 | 8,9 |
| Ámbar | 6,8 | 9,3 |
| Verde | 6,6 | 8,4 |
| Borde de control sobre superficie / fondo | 3,6 / 3,1 | 3,4 / 3,9 |

Todo texto ≥ 4,5:1; bordes de control ≥ 3:1. La línea (1,4:1) solo separa bloques, nunca delimita un campo.

## 3. Tipografía

Alojadas en el repo (`fonts/`), woff2, solo subconjunto latino (incluye ñ, ¿, ¡, ª, º), `font-display: swap`. Licencia SIL Open Font License 1.1 (archivos `fonts/LICENSE-*.txt`). Origen: paquetes oficiales `@fontsource` 5.3.0.

| Rol | Familia | Pesos | Reserva |
|---|---|---|---|
| Títulos | Source Serif 4 | 500, 600 | `Georgia, serif` |
| Texto | IBM Plex Sans | 400, 500, 600 | `system-ui, sans-serif` |
| Números (AD, DOC-NN, fechas, contadores) | IBM Plex Mono | 400, 500 | `ui-monospace, monospace` |

Los números usan `font-variant-numeric: tabular-nums` para alinear en columnas. Peso total: 140 KB (143 680 bytes).

Escala: cuerpo 15 px (14 px en tablas), títulos de página `clamp(22px, 4vw, 28px)`, títulos de sección 18 px, etiquetas 12,5 px. Interlineado 1,45 en texto.

Huellas SHA-256 (para detectar cambios no autorizados):

```
d3e119de0b756d9fa6d368de570f7168bb74eedf3289aaeae22dd97b900918d1  source-serif-4-latin-500-normal.woff2
f2b7e1cf1d277b7608231868135648f8ad8e2b58d8e97ca088bee15dc357bee7  source-serif-4-latin-600-normal.woff2
3b646991d30055a93a4ecc499713d4347953a74a947ecab435ab72070cbdab0e  ibm-plex-sans-latin-400-normal.woff2
0717336fb31fcdcde4b8deb3675bb4a0f7f6d484864afcd6751ac29975962203  ibm-plex-sans-latin-500-normal.woff2
8960851d691c054ed38e259bdcf1a6190d157b4203ed5bb32c632a863fb8ec2f  ibm-plex-sans-latin-600-normal.woff2
08949f728dc52d528e69b1667d15c89a5686a4ee9a296ff90983985f99c380f7  ibm-plex-mono-latin-400-normal.woff2
01d285447409c8a588692162439a038b8cbd7871309ee20267b0d2d91c6e8e22  ibm-plex-mono-latin-500-normal.woff2
```

## 4. Espaciado, forma y elevación

- Escala de espacio: 4, 8, 12, 16, 20, 24, 32 px. Margen lateral de página 16 px en celular.
- Radios: 6 px controles, 8 px superficies. Sin sombras: la separación la dan el color de superficie y la línea.
- Ancho máximo de contenido: 1180 px.

## 5. Íconos

SVG en línea, trazo de 1,75 px, `stroke="currentColor"`, sin relleno, 20 × 20 (16 en chips). Siempre acompañados de texto o con `aria-hidden="true"` si el texto ya está al lado. Sin librerías externas.

## 6. Componentes

### Navegación
- **Celular y tablet vertical (< 900 px):** barra inferior fija con 5 lugares (Inicio, Semana, Novedades, Eventos, Cuenta), ícono + texto, 56 px de alto, respeta `env(safe-area-inset-bottom)`. Miembros (solo admin) se abre desde Cuenta.
- **Escritorio (≥ 900 px):** barra superior con la marca, las secciones (incluida Miembros para admin) y el usuario. La sección actual lleva `aria-current="page"` y subrayado de 2 px en color de acción.

### Bloque "Requiere atención hoy" (Inicio)
Primer bloque de Inicio. Calculado solo con datos ya cargados: tareas de hoy sin completar, documentos recibidos sin Síntesis y novedades en espera (Qrx). Una superficie con filas; cada fila: ícono, texto, cantidad en mono y enlace a la pantalla correspondiente. Si no hay nada: "Nada pendiente para hoy" con ícono de check en verde.

### Tarjeta de evento activo
Superficie con borde izquierdo de 4 px en `--primary`. Arriba, nombre (serif) y lugar · fechas. Cuenta regresiva grande en mono ("12 días", "En curso", "Finalizado"). Barra de avance de documentos: tramo verde (con Síntesis o no la lleva), ámbar (recibido sin Síntesis) y fondo de línea (no disponible), con el texto "N de M listos" al lado. El ancho de cada tramo se fija desde JS con `style.setProperty` (sin estilos en línea en la plantilla).

### Fila de novedad
Fecha en mono a la izquierda (`dd/mm/aaaa`), texto, autor en secundario. Si está en espera: chip ámbar "En espera (Qrx)" con ícono de reloj. Acciones (Borrar, Preparar evento de Calendar) como botones secundarios al final.

### Chips de estado
Píldora de 12,5 px con ícono + texto.
- Completo (verde): "Con Síntesis", "Hecha" — ícono check.
- Urgente (ámbar): "Falta Síntesis", "En espera (Qrx)", prioridad alta — ícono alerta o reloj.
- Neutro (superficie con borde de control): "No disponible", "No lleva Síntesis", "En proceso".
Los chips de filtro son botones con `aria-pressed`; el activo usa `--primary` / `--on-primary`.

### Botones
- **Principal:** fondo `--primary`, texto `--on-primary`, 44 px de alto mínimo en celular. Uno por formulario.
- **Secundario:** superficie con borde de control, texto en `--primary`.
- **Peligro (Borrar):** secundario con texto ámbar e ícono; siempre pide confirmación.
- Deshabilitado: opacidad 0,55 y `aria-busy="true"` mientras guarda. Sin flechas agregadas.

### Documentos: tabla y tarjetas
- **Escritorio (≥ 900 px):** tabla con encabezado fijo en tono de superficie, código en mono, filas separadas por línea.
- **Celular y tablet vertical (< 900 px):** una tarjeta por documento: código (mono) y asunto arriba; chip de estado; botones "Abrir" y "Abrir Síntesis" abajo (o "Sin archivo" si no hay link). Las acciones de estado (Marcar recibido, etc.) debajo, como secundarios.

### Estados de vista
Mismo estilo en todas las pantallas: **cargando** (texto "Cargando…" con `role="status"`), **vacío** (texto secundario centrado, sin ilustraciones), **error** (superficie con texto y botón "Reintentar", `role="alert"`), **éxito** (aviso flotante inferior con `role="status"`).

## 7. PENDIENTE DE OTRA ETAPA: línea de tiempo de fojas

No implementado (requiere esquema y reglas nuevas). Diseño previsto: dentro del detalle de un expediente, línea vertical con un punto por foja, ordenadas por número; cada foja muestra `F###` en mono, descripción, tipo (chip neutro) y fecha. Fojas nuevas desde la última visita marcadas con chip ámbar "Nueva". Saltos o repetidos en la numeración: aviso ámbar arriba de la línea ("Faltan F012–F014"). Archivos fuera del patrón en una sección aparte "Sin foja". Una foja anulada se muestra tachada con chip neutro "Anulada", sin desaparecer.

## 8. Seguridad de la interfaz

- Todo dato de la base se inserta con `esc()` o `textContent`.
- Links solo `https` (`safeUrl`), con `rel="noopener noreferrer"`.
- CSP por `<meta>` en `index.html`: sin dominios externos salvo el proyecto de Supabase; fuentes solo del propio sitio. Objetivo: quitar `'unsafe-inline'` de `style-src` cuando no quede ningún estilo en línea.
