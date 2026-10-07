/* Portal CE. Página estática conectada a Supabase.
   Los permisos reales los aplican las reglas (RLS) de la base; ocultar botones acá es solo comodidad. */
(function () {
'use strict';

/* La página no se deja abrir dentro de un marco de otro sitio (clickjacking).
   GitHub Pages no permite la cabecera frame-ancestors, así que se controla acá. */
if (window.top !== window.self) {
  document.body.textContent = 'El Portal CE no se puede abrir dentro de otra página. Entrá desde su dirección.';
  return;
}

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
/* Fechas y horas siempre en hora de Argentina, aunque el dispositivo esté en otra zona (por ejemplo, de viaje). */
var TZ = 'America/Argentina/Buenos_Aires';
var DIA_AR = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
var FECHA_HORA_AR = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
var T0 = (function () { var p = DIA_AR.format(new Date()).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); })();
function pd(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function ds(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function addD(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function p2(n) { return ('0' + n).slice(-2); }
/* Fechas: dd/mm/aaaa; fms = dd/mm (solo donde el año ya figura al lado). */
function fm(s) { var d = pd(s); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear(); }
function fms(s) { var d = pd(s); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1); }
function days(s) { return Math.round((pd(s) - T0) / 864e5); }
function range(e) { return e.desde === e.hasta ? fm(e.desde) : fm(e.desde) + ' al ' + fm(e.hasta); }
function monday(off) { return addD(T0, -((T0.getDay() + 6) % 7) + 7 * off); }
function safeUrl(u) { return /^https:\/\//i.test(u || '') ? u : null; }
function toast(m) { var t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 3200); }
function fdt(s) { return FECHA_HORA_AR.format(new Date(s)).replace(',', ''); }

var cfg = window.PORTAL_CONFIG || {};
var configured = cfg.SUPABASE_URL && cfg.SUPABASE_KEY && cfg.SUPABASE_KEY.indexOf('PEGAR_') !== 0;
var sb = null;
if (configured) {
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
}

/* Datos cargados desde la base */
function emptyDB() { return { eventos: [], exp: {}, expList: [], docs: {}, tareas: [], novs: [], recursos: [], members: [], audit: [], errs: [] }; }
var DB = emptyDB();
var S = { me: null, session: null, noRole: false, setpw: false, loading: true, err: '', dataErr: '', connErr: false, aal: 'aal1', needCode: false, needEnroll: false, factors: [], enroll: null, fresh: false, view: 'inicio', ev: null, tab: 'resumen', f: { est: 'todos', rel: 'todos', g: 'todos' }, tf: 'todas', wk: 0, cal: null };

/* Un enlace de invitación o de recuperación trae su tipo en la dirección */
if (/type=(invite|recovery)/.test(location.hash)) S.setpw = true;
if (/access_token=/.test(location.hash)) S.fresh = true;

var NAV = [['inicio', 'Inicio'], ['semana', 'Semana'], ['novedades', 'Novedades'], ['eventos', 'Eventos'], ['miembros', 'Miembros', 'adm'], ['cuenta', 'Mi cuenta']];
var ROLES = { lectura: 'Lectura', edicion: 'Edición', admin: 'Administración' };

/* El segundo factor es obligatorio para todos: la base no entrega nada a una sesión sin código (aal2).
   Admin con segundo factor: es lo mismo que exige la base (private.es_admin). */
function isAdmin() { return !!(S.me && S.me.rol === 'admin' && S.aal === 'aal2'); }
function uiRole() { return isAdmin() ? 'admin' : S.me.rol === 'admin' ? 'edicion' : S.me.rol; }

/* ---------- cierre por inactividad ---------- */
/* 30 minutos sin tocar la página en ningún dispositivo de este navegador: se cierra la sesión.
   El corte del lado servidor es solo del plan Pro; esto protege el celular o la PC que quedó abierta. */
var IDLE = 30 * 60 * 1000, IDLE_KEY = 'portalce.ultimaActividad';
function lastAct() { try { return +localStorage.getItem(IDLE_KEY) || 0; } catch (e) { return 0; } }
function touch() { try { localStorage.setItem(IDLE_KEY, String(Date.now())); } catch (e) { } }
function clearAct() { try { localStorage.removeItem(IDLE_KEY); } catch (e) { } }
function stale() { var l = lastAct(); return l > 0 && Date.now() - l > IDLE; }
var touchedAt = 0;
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
  document.addEventListener(ev, function () { if (!S.session) return; var n = Date.now(); if (n - touchedAt > 15000) { touchedAt = n; touch(); } }, { passive: true });
});
async function idleLogout() {
  clearAct();
  S.err = 'Se cerró la sesión después de 30 minutos sin uso. Volvé a ingresar.';
  await sb.auth.signOut({ scope: 'local' });
}
function checkIdle() { if (S.session && stale()) idleLogout(); }
if (configured) {
  setInterval(checkIdle, 30000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') checkIdle(); });
}

/* ---------- registro de errores ---------- */
/* Se guarda solo la vista, un mensaje técnico corto y el navegador; nunca textos de novedades ni documentos.
   Lo ve únicamente admin, en Miembros. Máximo 5 por carga de página. */
var reported = 0;
function report(msg, silent) {
  if (!silent) toast('Algo falló en la página. Si se repite, avisale a quien administra.');
  if (!sb || !S.session || !S.me || reported >= 5) return;
  reported++;
  try {
    sb.from('errores').insert({ vista: String(S.view).slice(0, 40), mensaje: String(msg || 'sin mensaje').slice(0, 300), navegador: String(navigator.userAgent || '').slice(0, 200) }).then(function () { }, function () { });
  } catch (e) { }
}
window.addEventListener('error', function (e) { report('error: ' + (e.message || '') + ' @' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0)); });
window.addEventListener('unhandledrejection', function (e) { var r = e.reason || {}; report('promesa: ' + (r.message || String(r))); });

/* ---------- carga de datos ---------- */
async function loadAll() {
  var qs = [
    sb.from('eventos').select('*').order('desde'),
    sb.from('expedientes').select('*').order('ad'),
    sb.from('documentos').select('*').order('codigo'),
    sb.from('tareas').select('*').order('created_at'),
    sb.from('novedades').select('*').order('fecha', { ascending: false }),
    sb.from('recursos').select('*'),
    sb.from('members').select('*').order('created_at')
  ];
  var q = await Promise.all(qs);
  for (var i = 0; i < q.length; i++) { if (q[i].error) throw q[i].error; }
  DB.eventos = q[0].data.map(function (e) { return { id: e.id, n: e.nombre, lugar: e.lugar, desde: e.desde, hasta: e.hasta, ad: e.ad, st: e.estado }; });
  DB.expList = q[1].data;
  DB.exp = {}; q[1].data.forEach(function (x) { DB.exp[x.ad] = x.nombre; });
  DB.docs = {};
  q[2].data.forEach(function (d) { (DB.docs[d.evento_id] = DB.docs[d.evento_id] || []).push(d); });
  DB.tareas = q[3].data;
  DB.novs = q[4].data;
  DB.recursos = q[5].data;
  DB.members = q[6].data;
  /* Registros de admin: si fallan (por ejemplo, la tabla todavía no existe), no frenan el resto. null = no disponible. */
  DB.audit = []; DB.errs = [];
  if (isAdmin()) {
    var ad = await Promise.all([
      sb.from('auditoria').select('*').order('momento', { ascending: false }).limit(50),
      sb.from('errores').select('*').order('momento', { ascending: false }).limit(30)
    ]);
    DB.audit = ad[0].error ? null : ad[0].data;
    DB.errs = ad[1].error ? null : ad[1].data;
  }
  if (!S.ev || !evById(S.ev)) S.ev = DB.eventos.length ? DB.eventos[0].id : null;
}
async function loadFactors() {
  try { var f = await sb.auth.mfa.listFactors(); S.factors = (f.data && f.data.totp) || []; } catch (e) { S.factors = []; }
}
async function boot(session) {
  S.session = session; S.me = null; S.noRole = false; S.dataErr = ''; S.connErr = false; S.needCode = false; S.needEnroll = false;
  if (!session) { S.loading = false; render(); return; }
  S.loading = true; render();
  /* Segundo factor obligatorio: si la sesión no pasó el código, se pide; si la cuenta no lo tiene, se configura. */
  var a;
  try {
    a = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (a.error) throw a.error;
    S.aal = a.data.currentLevel || 'aal1';
  } catch (e) { S.connErr = true; S.loading = false; render(); return; }
  if (S.aal !== 'aal2') {
    if (a.data.nextLevel === 'aal2') S.needCode = true; else S.needEnroll = true;
    S.loading = false; render(); return;
  }
  var r = await sb.from('members').select('*').eq('id', session.user.id).maybeSingle();
  if (r.error) { S.connErr = true; S.loading = false; render(); report('members: ' + (r.error.code || '') + ' ' + r.error.message, true); return; }
  if (!r.data || !r.data.rol) { S.noRole = true; S.loading = false; render(); return; }
  S.me = r.data;
  await loadFactors();
  try { await loadAll(); } catch (e) { S.dataErr = 'No se pudieron cargar los datos.'; report('carga: ' + (e.code || '') + ' ' + (e.message || ''), true); }
  S.loading = false; render();
}
async function rebootNow() { var s = await sb.auth.getSession(); await boot(s.data.session); }
async function reload() { try { await loadAll(); } catch (e) { toast('No se pudo actualizar la lista.'); } render(); }
/* Traduce el error de la base a un mensaje en español con el paso siguiente. El detalle técnico va solo al registro de errores. */
function errMsg(err) {
  var c = (err && err.code) || '', m = (err && err.message) || '';
  if (c === 'P0001') return m; /* mensajes propios de la base, ya en español (p. ej. "No podés cambiar tu propio rol") */
  if (c === '42501' || /row-level security|permission denied/i.test(m)) return 'Tu rol no permite este cambio. Si hace falta, pedíselo a quien administra.';
  if (c === '23514') return 'Algún dato no es válido (por ejemplo, un link que no empieza con https o un texto demasiado largo). Revisalo y probá de nuevo.';
  if (c === '23505') return 'Ya existe un registro con esos datos.';
  if (c === '23503') return 'El expediente o evento elegido ya no existe. Recargá la página y probá de nuevo.';
  if (c === '23502') return 'Falta completar un dato obligatorio.';
  if (!c || /fetch|network|Failed/i.test(m)) return 'No se pudo conectar. Revisá la conexión y probá de nuevo.';
  return 'Probá de nuevo; si se repite, avisale a quien administra.';
}
function saveFail(r, que) {
  toast('No se pudo ' + (que || 'guardar') + '. ' + errMsg(r.error));
  report((que || 'guardar') + ': ' + (r.error.code || '') + ' ' + r.error.message, true);
}
async function run(promise, okMsg) {
  var r = await promise;
  if (r.error) { saveFail(r); return false; }
  if (okMsg) toast(okMsg);
  await reload();
  return true;
}
/* Evita el doble envío: el botón queda desactivado hasta que termina la operación. */
async function lock(b, fn, label) {
  if (!b || b.disabled) return;
  var txt = b.textContent;
  b.disabled = true; b.setAttribute('aria-busy', 'true'); if (label) b.textContent = label;
  try { await fn(); } finally { if (b.isConnected) { b.disabled = false; b.removeAttribute('aria-busy'); if (label) b.textContent = txt; } }
}

/* ---------- utilidades de vista ---------- */
function hasView(v) { return Object.prototype.hasOwnProperty.call(V, v); }
function evById(id) { return DB.eventos.filter(function (e) { return e.id === id; })[0]; }
/* Íconos SVG en línea, trazo 1,75 (DESIGN.md §5). Solo formas fijas: nunca datos. */
var ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  week: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3"/>',
  news: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 10h8M8 14h8M8 18h5"/>',
  event: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.3 2.4 4 5.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  minus: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  out: '<path d="M14 4h5v16h-5"/><path d="M10 16l-4-4 4-4M6 12h10"/>'
};
function ic(n, small) { return '<svg class="ic' + (small ? ' ic-s' : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[n] + '</svg>'; }
/* Chip de estado: siempre ícono + texto (el texto ya viene escapado o es fijo). */
function st(kind, icon, text) { return '<span class="st st-' + kind + '">' + ic(icon, true) + text + '</span>'; }
/* Estado de un documento: falta (no recibido), ok (con Síntesis), na (recibido y no lleva Síntesis), sin (recibido, falta la Síntesis) */
function docStat(d) { return !d.recibido ? 'falta' : d.sintesis ? 'ok' : d.lleva_sintesis === false ? 'na' : 'sin'; }
/* short: en la tabla, donde el encabezado ya dice Relevancia */
function relChip(p, short) { var t = { alta: 'Alta', media: 'Media', baja: 'Baja' }[p] || esc(p); var txt = short ? t : 'Relevancia ' + t.toLowerCase(); return p === 'alta' ? st('warn', 'alert', txt) : st('neutral', 'minus', txt); }
function docChip(d) { var s = docStat(d); return s === 'ok' ? st('ok', 'check', 'Con Síntesis') : s === 'na' ? st('neutral', 'check', 'No lleva Síntesis') : s === 'sin' ? st('warn', 'alert', 'Falta Síntesis') : st('neutral', 'clock', 'No disponible'); }
/* listo = con Síntesis o recibido sin necesidad de Síntesis */
function docCounts(list) { var ok = 0, na = 0, sin = 0, no = 0; list.forEach(function (d) { var s = docStat(d); if (s === 'ok') ok++; else if (s === 'na') na++; else if (s === 'sin') sin++; else no++; }); return { ok: ok, na: na, listo: ok + na, sin: sin, no: no, t: list.length }; }
/* Barra de avance: el ancho de cada tramo se fija después de dibujar (hydrate), sin estilos en línea. */
function meter(c) {
  if (!c.t) return '';
  return '<div class="meter" role="img" aria-label="Avance de documentos: ' + c.listo + ' listos, ' + c.sin + ' sin Síntesis y ' + c.no + ' no disponibles, de ' + c.t + '"><i class="m-ok" data-w="' + (c.listo / c.t * 100).toFixed(2) + '"></i><i class="m-mid" data-w="' + (c.sin / c.t * 100).toFixed(2) + '"></i></div>' +
    '<div class="legend"><span><i class="k-ok"></i>Listos ' + c.listo + '</span><span><i class="k-mid"></i>Sin Síntesis ' + c.sin + '</span><span><i class="k-no"></i>No disponibles ' + c.no + '</span></div>';
}
function hydrate(root) { root.querySelectorAll('[data-w]').forEach(function (el) { el.style.setProperty('width', el.getAttribute('data-w') + '%'); }); }
/* Cuenta regresiva de un evento */
function countdown(e) {
  var n = days(e.desde);
  if (days(e.hasta) < 0) return '<div class="count"><span class="txt">Finalizado</span></div>';
  if (n <= 0) return '<div class="count"><span class="num">En curso</span></div>';
  return '<div class="count"><span class="num">' + n + '</span><span class="txt">' + (n === 1 ? 'día para el inicio' : 'días para el inicio') + '</span></div>';
}
/* Borrar: tareas y novedades, edición y admin; el resto, solo admin (lo mismo que exigen las reglas de la base). */
var DEL_CLS = { tareas: 'edit', novedades: 'edit', documentos: 'adm', recursos: 'adm', eventos: 'adm' };
function delBtn(tabla, id, que) { return '<button type="button" class="btn sm danger ' + DEL_CLS[tabla] + '" data-del="' + tabla + '" data-id="' + esc(id) + '" data-que="' + esc(que) + '">Borrar</button>'; }
var NEXT = { 'Pendiente': ['Empezar', 'En Proceso'], 'En Proceso': ['Completar', 'Completadas'], 'Completadas': ['Reabrir', 'Pendiente'] };
function taskHTML(t) {
  var p = ['alta', 'media', 'baja'].indexOf(t.prioridad) > -1 ? t.prioridad : 'media';
  var nx = NEXT[t.estado] || NEXT.Pendiente;
  return '<div class="tk ' + p + (t.estado === 'Completadas' ? ' done' : '') + '"><div class="t">' + esc(t.titulo) + '</div><div class="m">' + (t.ad ? '<span class="mono" translate="no">#' + esc(t.ad) + '</span>' : '<span>Sin expediente</span>') +
    (p === 'alta' ? st('warn', 'alert', 'Prioridad alta') : '') +
    (t.estado === 'En Proceso' ? st('neutral', 'clock', 'En proceso') : '') + (t.estado === 'Completadas' ? st('ok', 'check', 'Hecha') : '') +
    '<button type="button" class="btn sm edit" data-tk="' + esc(t.id) + '">' + nx[0] + '</button>' + delBtn('tareas', t.id, 'la tarea “' + t.titulo + '”') + '</div></div>';
}
function novHTML(n) {
  var i = DB.novs.indexOf(n);
  return '<div class="nv"><div class="dt mono">' + fm(n.fecha) + '</div><div class="stack-s"><p>' + esc(n.texto) + '</p><div class="m"><span>' + esc(n.autor) + '</span>' +
    (n.qrx ? st('warn', 'clock', 'En espera (Qrx)') : '') +
    (n.cal ? '<button class="btn sm edit" type="button" data-cal="from" data-nv="' + i + '">Preparar evento de Calendar</button>' : '') +
    delBtn('novedades', n.id, 'la novedad del ' + fm(n.fecha) + ' (#' + n.ad + ')') + '</div></div></div>';
}
function expOptions() { return DB.expList.map(function (x) { return '<option value="' + esc(x.ad) + '" translate="no">#' + esc(x.ad) + ' ' + esc(x.nombre) + '</option>'; }).join(''); }
/* Estados de vista con el mismo estilo en todas las pantallas */
function empty(msg) { return '<div class="panel state">' + msg + '</div>'; }
function emptyIn(msg) { return '<div class="state">' + msg + '</div>'; }
function errorBox(msg) { return '<div class="panel state state-error" role="alert"><p>' + esc(msg) + '</p><button class="btn primary" type="button" data-act="retry">Reintentar</button></div>'; }
function memberName(id) { var m = DB.members.filter(function (x) { return x.id === id; })[0]; return m ? (m.nombre || m.email) : (id ? 'cuenta borrada' : 'sistema'); }
/* Escritorio o celular: la tabla de documentos y la navegación cambian según el ancho. */
var MQ_DESK = window.matchMedia('(min-width: 900px)');
function isDesk() { return MQ_DESK.matches; }
MQ_DESK.addEventListener('change', function () { if (S.me) render(); });

/* ---------- tema claro / oscuro ---------- */
/* Preferencia guardada solo en este navegador. Vacío = automático (según el sistema). */
var THEME_KEY = 'portalce.tema';
function themePref() { try { var t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'dark' ? t : ''; } catch (e) { return ''; } }
function themeNow() { return themePref() || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
function applyTheme(t) {
  try { if (t) localStorage.setItem(THEME_KEY, t); else localStorage.removeItem(THEME_KEY); } catch (e) { }
  if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  /* Con tema elegido a mano, las dos etiquetas theme-color toman ese color; en automático, cada una el suyo. */
  var tc = document.querySelectorAll('meta[name="theme-color"]');
  tc.forEach(function (m) { var dark = t ? t === 'dark' : /dark/.test(m.getAttribute('media') || ''); m.setAttribute('content', dark ? '#172033' : '#F9FAF7'); });
}
applyTheme(themePref());
function themeBtn() {
  var dark = themeNow() === 'dark';
  return '<button class="iconbtn" id="themebtn" type="button" data-theme-set="' + (dark ? 'light' : 'dark') + '" aria-label="' + (dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro') + '">' + ic(dark ? 'sun' : 'moon') + '</button>';
}

/* ---------- vistas ---------- */
function attention() {
  var today = ds(T0);
  var tk = DB.tareas.filter(function (t) { return t.dia === today && t.estado !== 'Completadas'; }).length;
  var sinEv = {}, sin = 0;
  Object.keys(DB.docs).forEach(function (id) { var n = DB.docs[id].filter(function (d) { return docStat(d) === 'sin'; }).length; if (n) { sin += n; sinEv[id] = n; } });
  var evSin = Object.keys(sinEv)[0];
  var q = DB.novs.filter(function (n) { return n.qrx; }).length;
  var rows = [];
  if (tk) rows.push(['clock', 'Tareas para hoy sin completar', tk, '<button class="btn sm" type="button" data-v="semana">Ver semana</button>']);
  if (sin) rows.push(['alert', 'Documentos recibidos sin Síntesis', sin, '<button class="btn sm" type="button" data-ev="' + esc(evSin) + '" data-go="docs" data-fest="sin">Ver documentos</button>']);
  if (q) rows.push(['clock', 'Novedades en espera (Qrx)', q, '<button class="btn sm" type="button" data-v="novedades">Ver novedades</button>']);
  return '<section class="panel" aria-labelledby="h-attn"><header><h2 id="h-attn">Requiere atención hoy</h2><span class="note mono">' + fm(today) + '</span></header>' +
    (rows.length ? '<div class="rows">' + rows.map(function (r) { return '<div class="attn-row">' + ic(r[0]) + '<span class="txt">' + r[1] + '</span><span class="num">' + r[2] + '</span>' + r[3] + '</div>'; }).join('') + '</div>'
      : '<div class="attn-ok">' + ic('check') + '<span>Nada pendiente para hoy.</span></div>') + '</section>';
}
function activeEvent(cur) {
  if (!cur) return empty('Todavía no hay eventos próximos cargados.');
  var cn = docCounts(DB.docs[cur.id] || []);
  return '<section class="panel evact" aria-labelledby="h-evact"><div class="body"><div><h2 id="h-evact">' + esc(cur.n) + '</h2><p class="meta">' + esc(cur.lugar) + ' · <span class="mono">' + range(cur) + '</span></p></div>' +
    countdown(cur) +
    (cn.t ? '<div><b class="num">' + cn.listo + '</b> <span class="muted">de ' + cn.t + ' documentos listos (con Síntesis o sin necesidad)</span></div>' + meter(cn) : '<p class="muted">Todavía no hay documentos cargados para este evento.</p>') +
    '<div class="chips"><button class="btn primary" data-ev="' + esc(cur.id) + '" data-go="docs" type="button">Abrir</button><button class="btn" data-v="eventos" type="button">Ver todos</button></div></div></section>';
}
function vInicio() {
  var next = DB.eventos.filter(function (e) { return days(e.hasta) >= 0; }).sort(function (a, b) { return a.desde < b.desde ? -1 : 1; });
  var q = DB.novs.filter(function (n) { return n.qrx; });
  var m0 = ds(monday(0)), m1 = ds(addD(monday(0), 6));
  var wk = DB.tareas.filter(function (t) { return t.dia && t.dia >= m0 && t.dia <= m1 && t.estado !== 'Completadas'; }).sort(function (a, b) { return a.dia < b.dia ? -1 : 1; }).slice(0, 6);
  var name = S.me.nombre || S.me.email;
  var otros = next.slice(1, 4);
  return '<div class="head"><div><h1>Buen día, ' + esc(name) + '</h1><p>Esto es lo que hay para el Comité Ejecutivo hoy.</p></div></div>' +
    attention() +
    '<div class="grid2"><div class="stack">' + activeEvent(next[0]) +
    '<section class="panel" aria-labelledby="h-wk"><header><h2 id="h-wk">Esta semana, por hacer</h2><button class="btn sm" data-v="semana" type="button">Abrir semana</button></header><div class="body">' +
    (wk.length ? wk.map(taskHTML).join('') : emptyIn('No hay tareas pendientes esta semana.')) + '</div></section></div>' +
    '<div class="stack">' +
    '<section class="panel" aria-labelledby="h-qrx"><header><h2 id="h-qrx">En espera (Qrx)</h2>' + st('warn', 'clock', String(q.length)) + '</header>' +
    (q.length ? '<div class="rows">' + q.map(function (n) { return '<div class="evlist-row"><div><span class="mono muted" translate="no">#' + esc(n.ad) + ' · ' + fm(n.fecha) + '</span><p class="wrapw">' + esc(n.texto) + '</p></div></div>'; }).join('') + '</div>' : emptyIn('Nada en espera.')) + '</section>' +
    (otros.length ? '<section class="panel" aria-labelledby="h-next"><header><h2 id="h-next">Próximos eventos</h2></header><div class="rows">' + otros.map(function (e) { return '<div class="evlist-row"><div><b>' + esc(e.n) + '</b><p class="note mono">' + range(e) + '</p></div><button class="btn sm" type="button" data-ev="' + esc(e.id) + '">Abrir</button></div>'; }).join('') + '</div></section>' : '') +
    '</div></div>';
}
function vSemana() {
  var base = monday(S.wk), names = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'], tds = ds(T0);
  var cols = names.map(function (nm, i) {
    var d = addD(base, i), k = ds(d), list = DB.tareas.filter(function (t) { return t.dia === k && (S.tf === 'todas' || t.prioridad === 'alta'); });
    return '<section class="day' + (k === tds ? ' today' : '') + '" aria-label="' + nm + ' ' + fms(k) + (k === tds ? ', hoy' : '') + '"><header><h3>' + nm + '</h3><span class="dn">' + fms(k) + (k === tds ? ' · Hoy' : '') + '</span></header>' + (list.length ? list.map(taskHTML).join('') : '<p class="empty">Libre</p>') + '</section>';
  }).join('');
  var sin = DB.tareas.filter(function (t) { return !t.dia; }), end = addD(base, 6);
  var form = '<section class="panel edit" aria-labelledby="h-nt"><header><h2 id="h-nt">Nueva tarea</h2><span class="note">Se guarda para todo el equipo</span></header><div class="body form">' +
    '<label for="tn">Tarea<input id="tn" type="text" maxlength="300" autocomplete="off" placeholder="Qué hay que hacer…"></label>' +
    '<div class="row"><label for="tad">Expediente<select id="tad"><option value="">Sin expediente</option>' + expOptions() + '</select></label>' +
    '<label for="td">Día<input id="td" type="date" value="' + ds(T0) + '"></label>' +
    '<label for="tp">Prioridad<select id="tp"><option value="alta">Alta</option><option value="media" selected>Media</option><option value="baja">Baja</option></select></label></div>' +
    '<div><button class="btn primary" type="button" data-act="addtask">Agregar tarea</button></div></div></section>';
  return '<div class="head"><div><h1>Semana de trabajo</h1><p>Del <span class="mono">' + fm(ds(base)) + '</span> al <span class="mono">' + fm(ds(end)) + '</span>.</p></div>' +
    '<div class="chips"><button class="btn" type="button" data-wk="-1">Semana anterior</button><button class="btn" type="button" data-wk="0">Esta semana</button><button class="btn" type="button" data-wk="1">Semana siguiente</button></div></div>' +
    '<div class="chips"><span class="gl">Mostrar</span><button class="chip" data-tf="todas" aria-pressed="' + (S.tf === 'todas') + '" type="button">Todas</button><button class="chip" data-tf="alta" aria-pressed="' + (S.tf === 'alta') + '" type="button">Solo prioridad alta</button></div>' +
    '<div class="board">' + cols + '</div>' +
    '<section class="panel" aria-labelledby="h-sd"><header><h2 id="h-sd">Sin día asignado</h2></header><div class="body">' + (sin.length ? sin.map(taskHTML).join('') : emptyIn('Todas las tareas tienen día.')) + '</div></section>' + form;
}

/* Calendar: en esta versión solo se prepara la vista previa. La creación real se conecta con la sincronización (Fase 3). */
var REMALL = [[43200, '30 días'], [10080, '7 días'], [4320, '3 días'], [1440, '1 día'], [60, '1 hora'], [30, '30 min']];
var TIPOS = {
  institucional: { n: 'Institucional', d: 'Sesiones, conferencias, AG', rem: [43200, 10080, 4320], dur: 480 },
  fecha: { n: 'Fecha o efeméride', d: 'Cumpleaños, días nacionales', rem: [10080, 4320], dur: 0 },
  reunion: { n: 'Reunión o videollamada', d: 'Con invitados y link', rem: [1440, 30], dur: 60 },
  custom: { n: 'Personalizado', d: 'Elegís los avisos', rem: [1440], dur: 60 }
};
function invList() { return DB.members.map(function (m) { return [m.id, m.nombre || m.email]; }); }
function newCal(seed) {
  seed = seed || {}; var t = TIPOS[seed.tipo] ? seed.tipo : 'reunion';
  return { titulo: String(seed.titulo || ''), fecha: seed.fecha || ds(addD(T0, 7)), hora: seed.hora || '08:30', dur: seed.dur != null ? +seed.dur : TIPOS[t].dur, tipo: t, link: '', inv: (function () { var o = {}; invList().forEach(function (i) { o[i[0]] = 1; }); return o; })(), rem: TIPOS[t].rem.slice() };
}
function remLabel(m) { var r = REMALL.filter(function (x) { return x[0] === m; })[0]; return r ? r[1] : m + ' min'; }
function hhmm(h, add) { var a = h.split(':'); var t = (+a[0]) * 60 + (+a[1]) + add; return ('0' + Math.floor(t / 60) % 24).slice(-2) + ':' + ('0' + t % 60).slice(-2); }
function calPrev() {
  var c = S.cal, d = pd(c.fecha), allDay = c.tipo === 'fecha';
  var who = invList().filter(function (i) { return c.inv[i[0]]; }).map(function (i) { return esc(i[1]); });
  var when = DIAS[d.getDay()] + ' ' + fm(c.fecha) + (allDay ? ' · todo el día' : ' · ' + esc(c.hora) + ' a ' + hhmm(c.hora, c.dur || 60) + ' (hora de Argentina)');
  return '<div class="prev"><span class="note">Así quedará en Google Calendar</span><h3>' + esc(c.titulo || 'Sin título') + '</h3><dl>' +
    '<dt>Cuándo</dt><dd>' + when + '</dd><dt>Calendario</dt><dd>Calendario institucional</dd>' +
    '<dt>Videollamada</dt><dd>' + (c.link ? esc(c.link) : 'Sin link') + '</dd>' +
    '<dt>Invitados</dt><dd>' + (who.length ? who.join(', ') : 'Nadie') + '</dd>' +
    '<dt>Avisos</dt><dd>' + (c.rem.length ? c.rem.slice().sort(function (a, b) { return b - a; }).map(remLabel).join(' · ') + ' antes' : 'Sin avisos') + '</dd></dl>' +
    (c.tipo === 'reunion' && !c.link ? '<div class="warnbox">' + ic('alert', true) + '<span>Sin link, el evento se crea sin videollamada. Cuando llegue el link oficial, se agrega en el mismo evento.</span></div>' : '') + '</div>';
}
function calPanel() {
  var c = S.cal; if (!c) return '';
  var head = '<header><h2>Evento de Google Calendar</h2><div class="status"><span>Vista previa · la creación en Calendar se conecta más adelante</span><button class="btn sm" type="button" data-cal="close">Cerrar</button></div></header>';
  var types = '<div class="types" role="group" aria-label="Tipo de evento">' + Object.keys(TIPOS).map(function (k) { return '<button type="button" data-cal="tipo" data-k="' + k + '" aria-pressed="' + (c.tipo === k) + '"><b>' + TIPOS[k].n + '</b><span>' + TIPOS[k].d + '</span></button>'; }).join('') + '</div>';
  var rem = c.tipo === 'custom'
    ? '<div class="chips">' + REMALL.map(function (r) { return '<button class="chip" type="button" data-cal="rem" data-m="' + r[0] + '" aria-pressed="' + (c.rem.indexOf(r[0]) > -1) + '">' + r[1] + '</button>'; }).join('') + '</div>'
    : '<div class="chips">' + c.rem.map(function (m) { return st('neutral', 'clock', remLabel(m) + ' antes'); }).join('') + '<span class="note">Avisos fijos de este tipo</span></div>';
  var form = '<div class="form"><div class="note">Tipo de evento</div>' + types +
    '<label for="cf-titulo">Título<input id="cf-titulo" type="text" data-cf="titulo" autocomplete="off" value="' + esc(c.titulo) + '"></label>' +
    '<div class="row"><label for="cf-fecha">Fecha<input id="cf-fecha" type="date" data-cf="fecha" value="' + esc(c.fecha) + '"></label>' +
    (c.tipo === 'fecha' ? '' : '<label for="cf-hora">Hora (Argentina)<input id="cf-hora" type="time" data-cf="hora" value="' + esc(c.hora) + '"></label><label for="cf-dur">Duración<select id="cf-dur" data-cf="dur">' + [30, 60, 90, 120, 480].map(function (m) { return '<option value="' + m + '"' + (c.dur === m ? ' selected' : '') + '>' + (m < 60 ? m + ' min' : m / 60 + ' h') + '</option>'; }).join('') + '</select></label>') + '</div>' +
    (c.tipo === 'fecha' ? '' : '<label for="cf-link">Link de la videollamada (opcional)<input id="cf-link" type="text" data-cf="link" autocomplete="off" spellcheck="false" placeholder="Pegar el link oficial… Si queda vacío, no se agrega ninguno" value="' + esc(c.link) + '"></label>') +
    '<fieldset class="plain"><legend class="note">Invitar a</legend><div class="checks">' + invList().map(function (i) { return '<label><input type="checkbox" data-ci="' + esc(i[0]) + '"' + (c.inv[i[0]] ? ' checked' : '') + '> ' + esc(i[1]) + '</label>'; }).join('') + '</div></fieldset>' +
    '<div><div class="note">Avisos</div>' + rem + '</div></div>';
  return '<section class="panel cal edit">' + head + '<div class="body cal-grid"><div>' + form + '</div><div class="stack"><div id="calprev">' + calPrev() + '</div><div><button class="btn primary" type="button" disabled>Crear evento y enviar invitaciones</button><p class="note">Todavía no crea nada en Google Calendar. Hasta entonces, cargá el evento a mano con estos datos.</p></div></div></div></section>';
}
function vNov() {
  var g = {}, order = [];
  DB.novs.forEach(function (n) { if (!g[n.ad]) { g[n.ad] = []; order.push(n.ad); } g[n.ad].push(n); });
  var form = '<section class="panel edit" aria-labelledby="h-cn"><header><h2 id="h-cn">Cargar novedad</h2><span class="note">Se guarda para todo el equipo</span></header><div class="body form">' +
    '<label for="nt">Novedad<textarea id="nt" maxlength="2000" autocomplete="off" placeholder="Qué pasó… Ej.: se envió la confirmación de preferencia"></textarea></label>' +
    '<div class="row"><label for="nad">Expediente<select id="nad">' + expOptions() + '</select></label>' +
    '<label for="nf">Fecha<input id="nf" type="date" value="' + ds(T0) + '"></label><label for="ni">Iniciales<input id="ni" type="text" value="' + esc(S.me.iniciales) + '" maxlength="6" autocomplete="off" spellcheck="false" autocapitalize="characters"></label></div>' +
    '<div class="chips"><label class="check"><input type="checkbox" id="nq"> Queda en espera (Qrx)</label><label class="check"><input type="checkbox" id="ntk"> Crear también una tarea</label></div>' +
    '<div><button class="btn primary" type="button" data-act="addnov">Guardar novedad</button></div></div></section>';
  return '<div class="head"><div><h1>Novedades</h1><p>Novedades por expediente, de la más reciente a la más antigua.</p></div><div class="chips"><button class="btn edit" type="button" data-cal="new">Preparar evento de Calendar</button></div></div>' + calPanel() + form +
    (order.length ? order.map(function (ad) { return '<section class="grp"><h3><span translate="no">#' + esc(ad) + '</span> <small>' + esc(DB.exp[ad] || '') + '</small></h3>' + g[ad].map(novHTML).join('') + '</section>'; }).join('') : empty('Todavía no hay novedades.'));
}
function docActions(d) {
  var lleva = d.lleva_sintesis !== false;
  var act = !d.recibido ? '<button class="btn sm" type="button" data-doc="' + esc(d.id) + '" data-do="r">Marcar recibido</button>' : !d.sintesis && lleva ? '<button class="btn sm" type="button" data-doc="' + esc(d.id) + '" data-do="s">Marcar Síntesis lista</button>' : '';
  if (!d.sintesis) act += '<button class="btn sm adm" type="button" data-doc="' + esc(d.id) + '" data-do="' + (lleva ? 'n">No lleva Síntesis' : 'l">Sí lleva Síntesis') + '</button>';
  return act ? '<div class="cell-actions edit">' + act + '</div>' : '';
}
function docLinks(d) {
  var lleva = d.lleva_sintesis !== false;
  function link(u, txt) { var s = safeUrl(u); return s ? '<a class="btn sm" href="' + esc(s) + '" target="_blank" rel="noopener noreferrer">' + ic('file', true) + txt + '</a>' : null; }
  var a = d.recibido ? (link(d.url_doc, 'Abrir') || '<span class="muted">Sin link</span>') : '<span class="muted">Sin archivo</span>';
  var b = d.sintesis ? (link(d.url_sintesis, 'Abrir Síntesis') || '<span class="muted">Sin link</span>') : !lleva ? '<span class="muted">No lleva</span>' : (d.recibido ? '<span class="muted">Síntesis: falta</span>' : '');
  return [a, b];
}
function docsView(list) {
  var f = S.f;
  var rows = list.filter(function (d) {
    if (f.est !== 'todos' && docStat(d) !== f.est) return false;
    if (f.rel !== 'todos' && d.relevancia !== f.rel) return false;
    if (f.g !== 'todos' && d.grupo !== f.g) return false; return true;
  });
  function ch(k, label, opts) { return '<div class="chips" role="group" aria-label="' + label + '"><span class="gl">' + label + '</span>' + opts.map(function (o) { return '<button class="chip" type="button" data-f="' + k + '" data-fv="' + o[0] + '" aria-pressed="' + (f[k] === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
  var filters = '<div class="filters">' + ch('est', 'Estado', [['todos', 'Todos'], ['ok', 'Con Síntesis'], ['sin', 'Sin Síntesis'], ['na', 'No lleva Síntesis'], ['falta', 'No disponible']]) + ch('rel', 'Relevancia', [['todos', 'Todas'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']]) + ch('g', 'Grupo', [['todos', 'Todos'], ['P', 'Plenario'], ['S', 'Subcomités'], ['I', 'Informativos']]) + '</div>' +
    '<p class="note" role="status">Mostrando ' + rows.length + ' de ' + list.length + ' documentos</p>';
  if (!rows.length) return filters + empty('Ningún documento coincide con los filtros.');
  if (!isDesk()) {
    return filters + '<div class="panel rows">' + rows.map(function (d) {
      var l = docLinks(d);
      return '<article class="dcard"><div class="top"><span class="code" translate="no">' + esc(d.codigo) + '</span><span class="note mono">' + esc(d.punto) + '</span></div><p>' + esc(d.asunto) + '</p>' +
        '<div class="chips">' + docChip(d) + relChip(d.relevancia) + (d.recibido && d.idioma ? '<span class="note mono">' + esc(d.idioma) + '</span>' : '') + '</div>' +
        '<div class="links">' + l[0] + (l[1] ? ' ' + l[1] : '') + '</div>' + docActions(d) + '<div>' + delBtn('documentos', d.id, 'el documento ' + d.codigo) + '</div></article>';
    }).join('') + '</div>';
  }
  return filters + '<div class="panel tbox"><table class="t-wide"><thead><tr><th scope="col">Punto</th><th scope="col">Documento</th><th scope="col">Asunto</th><th scope="col">Relevancia</th><th scope="col">Idioma</th><th scope="col">Estado</th><th scope="col">Archivos</th></tr></thead><tbody>' +
    rows.map(function (d) {
      var l = docLinks(d);
      return '<tr><td class="mono muted">' + esc(d.punto) + '</td><td class="code" translate="no">' + esc(d.codigo) + '<div class="cell-actions">' + delBtn('documentos', d.id, 'el documento ' + d.codigo) + '</div></td><td class="asunto">' + esc(d.asunto) + '</td><td>' + relChip(d.relevancia, true) + '</td><td class="mono">' + (d.recibido ? esc(d.idioma || '—') : '—') + '</td><td>' + docChip(d) + docActions(d) + '</td><td><div class="files">' + l[0] + (l[1] ? l[1] : '') + '</div></td></tr>';
    }).join('') + '</tbody></table></div>';
}
function vEventos() {
  if (!DB.eventos.length) return '<div class="head"><div><h1>Eventos</h1></div></div>' + empty('Todavía no hay eventos cargados. Quien administra los carga desde el panel de la base.');
  var e = evById(S.ev), list = DB.docs[e.id] || [], c = docCounts(list);
  var tabs = [['resumen', 'Resumen'], ['docs', 'Documentos'], ['tareas', 'Tareas'], ['novs', 'Novedades'], ['recursos', 'Recursos']];
  var tb = '<div class="tabs" role="tablist" aria-label="Secciones del evento">' + tabs.map(function (t) { return '<button type="button" role="tab" id="tab-' + t[0] + '" aria-controls="tabpanel" data-tab="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
  var body = '';
  if (S.tab === 'resumen') {
    var abiertas = DB.tareas.filter(function (t) { return t.ad === e.ad && t.estado !== 'Completadas'; }).length;
    body = '<section class="panel"><div class="kv-num"><div><span class="num">' + Math.max(days(e.desde), 0) + '</span><span class="l">días para el inicio</span></div><div><span class="num">' + c.t + '</span><span class="l">documentos en seguimiento</span></div><div><span class="num">' + c.listo + '</span><span class="l">listos (con Síntesis o sin necesidad)</span></div><div><span class="num">' + abiertas + '</span><span class="l">tareas abiertas</span></div></div></section>' +
      (c.t ? '<div class="stack">' + meter(c) + '</div>' : '') +
      '<section class="panel"><div class="body"><h3>Datos del evento</h3><p class="muted">' + esc(e.lugar) + ' · <span class="mono">' + range(e) + '</span> · Expediente <span class="mono">#' + esc(e.ad || '—') + '</span></p></div></section>';
  } else if (S.tab === 'docs') {
    body = list.length ? docsView(list) : empty('Todavía no hay documentos para este evento.<br>Se cargan a medida que llegan, con su link a Drive.');
  } else if (S.tab === 'tareas') {
    var ts = DB.tareas.filter(function (t) { return t.ad === e.ad; });
    body = ts.length ? '<section class="panel"><div class="body">' + ts.map(taskHTML).join('') + '</div></section>' : empty('No hay tareas para este evento.');
  } else if (S.tab === 'novs') {
    var ns = DB.novs.filter(function (n) { return n.ad === e.ad; });
    body = ns.length ? '<section class="panel"><div class="body">' + ns.map(novHTML).join('') + '</div></section>' : empty('Todavía no hay novedades de este evento.');
  } else {
    var rs = DB.recursos.filter(function (r) { return r.evento_id === e.id; });
    body = rs.length ? '<section class="panel rows">' + rs.map(function (r) { var u = safeUrl(r.url); return '<div class="res-row"><h3>' + esc(r.titulo) + '</h3><p class="note">Link a Drive. Quien no tiene permiso en Drive no puede abrirlo.</p><div class="chips">' + (u ? '<a class="btn sm" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + ic('file', true) + 'Abrir en Drive</a>' : '<span class="muted">Sin link</span>') + delBtn('recursos', r.id, 'el recurso “' + r.titulo + '”') + '</div></div>'; }).join('') + '</section>' : empty('Todavía no hay recursos cargados para este evento.');
  }
  return '<div class="head"><div><h1>Eventos</h1><p>Cada evento reúne sus documentos, tareas, novedades y recursos.</p></div></div>' +
    '<div class="ev-layout"><div class="ev-list" role="group" aria-label="Eventos">' + DB.eventos.map(function (x) { return '<a href="#eventos/' + esc(encodeURIComponent(x.id)) + '/resumen" data-evlink="' + esc(x.id) + '"' + (x.id === S.ev ? ' aria-current="true"' : '') + '><b>' + esc(x.n) + '</b><span class="mono">' + range(x) + '</span></a>'; }).join('') + '</div>' +
    '<div class="stack"><div class="evhead"><h2>' + esc(e.n) + '</h2><div class="meta"><span>' + esc(e.lugar) + '</span><span class="mono">' + range(e) + '</span>' + st('neutral', 'minus', esc(e.st)) + delBtn('eventos', e.id, 'el evento “' + e.n + '” junto con sus ' + list.length + ' documentos y sus recursos') + '</div></div>' + tb + '<div id="tabpanel" role="tabpanel" aria-labelledby="tab-' + S.tab + '" class="stack">' + body + '</div></div></div>';
}
/* Resumen de una fila de auditoría: qué fila y qué columnas cambiaron. */
var OPS = { INSERT: 'Alta', UPDATE: 'Cambio', DELETE: 'Borrado' };
function auditRow(a) {
  var row = a.despues || a.antes || {};
  var what = String(row.titulo || row.texto || row.codigo || row.nombre || row.email || a.fila || '');
  if (what.length > 80) what = what.slice(0, 80) + '…';
  var cambios = '';
  if (a.operacion === 'UPDATE' && a.antes && a.despues) {
    cambios = Object.keys(a.despues).filter(function (k) { return JSON.stringify(a.antes[k]) !== JSON.stringify(a.despues[k]); }).join(', ');
  }
  return '<tr><td class="mono">' + esc(fdt(a.momento)) + '</td><td>' + esc(memberName(a.usuario)) + ' <span class="muted">' + esc(a.rol || '') + '</span></td><td>' + esc(OPS[a.operacion] || a.operacion) + '</td><td class="mono">' + esc(a.tabla) + '</td><td>' + esc(what) + (cambios ? '<div class="note">Cambió: ' + esc(cambios) + '</div>' : '') + '</td></tr>';
}
function vMiembros() {
  return '<div class="head"><div><h1>Miembros</h1><p>Solo las cuentas invitadas pueden entrar. No hay registro abierto.</p></div></div>' +
    '<section class="panel rows" aria-label="Miembros">' + DB.members.map(function (m) {
      var self = m.id === S.me.id;
      var sel = '<select data-rol="' + esc(m.id) + '" aria-label="Rol de ' + esc(m.email) + '"' + (self ? ' disabled title="No podés cambiar tu propio rol"' : '') + '>' + (m.rol ? '' : '<option value="" selected disabled>Sin rol</option>') + Object.keys(ROLES).map(function (k) { return '<option value="' + k + '"' + (m.rol === k ? ' selected' : '') + '>' + ROLES[k] + '</option>'; }).join('') + '</select>';
      return '<div class="mrow"><div class="who2"><b>' + esc(m.nombre || '—') + '</b>' + (self ? ' <span class="note">(vos)</span>' : '') + '</div><div class="mono wrapw">' + esc(m.email) + '</div><div>' + sel + '</div><div class="mono">' + esc(m.iniciales || '—') + '</div></div>';
    }).join('') + '</section>' +
    '<section class="panel" aria-labelledby="h-inv"><header><h2 id="h-inv">Invitar a una persona</h2></header><div class="body stack"><form class="form" id="invf">' +
    '<div class="row"><label for="ie">Correo<input id="ie" type="email" name="invitado" placeholder="nombre@ejemplo.com" maxlength="254" autocomplete="off" spellcheck="false" autocapitalize="off" required></label>' +
    '<label for="in">Nombre<input id="in" type="text" maxlength="120" autocomplete="off"></label>' +
    '<label for="ii">Iniciales<input id="ii" type="text" maxlength="8" autocomplete="off" spellcheck="false" autocapitalize="characters"></label>' +
    '<label for="ir">Rol<select id="ir"><option value="">Sin rol (lo asignás después)</option>' + Object.keys(ROLES).map(function (k) { return '<option value="' + k + '">' + ROLES[k] + '</option>'; }).join('') + '</select></label></div>' +
    '<div><button class="btn primary" type="submit">Enviar invitación</button></div></form>' +
    '<p class="note">La persona recibe un correo para crear su clave y configurar el segundo factor. Para dar de baja a alguien, borrarlo desde el panel de Supabase: Authentication, Users.</p></div></section>' +
    '<section class="panel" aria-labelledby="h-aud"><header><h2 id="h-aud">Registro de cambios</h2><span class="note">Últimos 50 · altas, cambios y borrados de todo el portal</span></header>' +
    (DB.audit === null ? emptyIn('El registro de cambios no está disponible en la base.') : DB.audit.length ? '<div class="tbox"><table class="t-log"><thead><tr><th scope="col">Cuándo</th><th scope="col">Quién</th><th scope="col">Qué</th><th scope="col">Tabla</th><th scope="col">Detalle</th></tr></thead><tbody>' + DB.audit.map(auditRow).join('') + '</tbody></table></div>' : emptyIn('Todavía no hay cambios registrados.')) + '</section>' +
    '<section class="panel" aria-labelledby="h-err"><header><h2 id="h-err">Errores de la página</h2><span class="note">Últimos 30 · sin datos de expedientes</span></header>' +
    (DB.errs === null ? emptyIn('El registro de errores no está disponible en la base.') : DB.errs.length ? '<div class="tbox"><table class="t-log"><thead><tr><th scope="col">Cuándo</th><th scope="col">Quién</th><th scope="col">Vista</th><th scope="col">Mensaje</th></tr></thead><tbody>' + DB.errs.map(function (x) { return '<tr><td class="mono">' + esc(fdt(x.momento)) + '</td><td>' + esc(memberName(x.usuario)) + '</td><td class="mono">' + esc(x.vista) + '</td><td class="wrapw">' + esc(x.mensaje) + '<div class="note">' + esc(x.navegador) + '</div></td></tr>'; }).join('') + '</tbody></table></div>' : emptyIn('Sin errores registrados.')) + '</section>';
}
function enrollHTML() {
  if (!S.enroll) return '<button class="btn primary" type="button" data-act="mfa-on">Empezar</button>';
  return '<ol class="steps"><li>Instalá una app de códigos en tu celular (Google Authenticator, Microsoft Authenticator u otra).</li>' +
      '<li>En la app, agregá una cuenta escaneando este código:' + (S.enroll.qr ? '<div class="qr"><img src="' + esc(S.enroll.qr) + '" alt="Código QR para agregar el Portal CE a la app de códigos" width="180" height="180"></div>' : '') +
      '<div class="note">Si no podés escanearlo, cargá esta clave a mano: <span class="mono secret">' + esc(S.enroll.secret) + '</span></div></li>' +
      '<li>Escribí el código de 6 números que muestra la app.</li></ol>' +
      '<form class="form" id="enrf"><label for="ec">Código de la app<input id="ec" type="text" inputmode="numeric" autocomplete="one-time-code" spellcheck="false" pattern="[0-9]{6}" maxlength="6" required></label>' +
      '<div class="chips"><button class="btn primary" type="submit">Confirmar y activar</button><button class="btn" type="button" data-act="mfa-cancel">Cancelar</button></div></form>';
}
function authWrap(inner, wide) { return '<main class="wrap"><div class="authtop">' + themeBtn() + '</div>' + inner + '</main>'; }
function vEnrollGate() {
  var em = S.session && S.session.user ? S.session.user.email : '';
  return authWrap('<section class="panel auth wide"><h1 class="mark">Portal CE</h1>' +
    '<p>Para entrar al portal hace falta el <b>segundo factor</b>: además de la clave, un código de 6 números que genera una app en tu celular. Se configura una sola vez.</p>' +
    '<p class="note">Cuenta: <span class="mono">' + esc(em) + '</span></p>' + enrollHTML() +
    '<button class="btn" type="button" data-act="logout">Salir</button></section>');
}
function vCuenta() {
  var u = S.me, pref = themePref();
  var mfa = '<p>' + st('ok', 'check', 'Activo') + ' Al ingresar se te pide la clave y el código de la app.</p>' +
    '<div><button class="btn" type="button" data-act="mfa-off">Cambiar de celular</button></div><p class="note">Se borra el código actual y, antes de seguir, configurás el celular nuevo.</p>';
  var tema = '<div class="chips" role="group" aria-label="Apariencia">' + [['', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(function (o) { return '<button class="chip" type="button" data-theme-set="' + o[0] + '" data-theme-opt="1" aria-pressed="' + (pref === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div><p class="note">Automático sigue la configuración del dispositivo. Se recuerda solo en este navegador.</p>';
  return '<div class="head"><div><h1>Mi cuenta</h1><p>Tus datos y la seguridad de tu ingreso.</p></div></div>' +
    (isAdmin() ? '<section class="panel adm"><div class="body evlist-row"><div><h2>Miembros</h2><p class="note">Roles, invitaciones y registros del portal.</p></div><button class="btn primary" type="button" data-v="miembros">Abrir Miembros</button></div></section>' : '') +
    '<section class="panel" aria-labelledby="h-dat"><header><h2 id="h-dat">Datos</h2></header><div class="body"><dl class="kv"><dt>Nombre</dt><dd>' + esc(u.nombre || '—') + '</dd><dt>Correo</dt><dd class="mono">' + esc(u.email) + '</dd><dt>Rol</dt><dd>' + esc(ROLES[u.rol] || '—') + '</dd><dt>Iniciales</dt><dd class="mono">' + esc(u.iniciales || '—') + '</dd></dl></div></section>' +
    '<section class="panel" aria-labelledby="h-mfa"><header><h2 id="h-mfa">Segundo factor (código en el celular)</h2></header><div class="body stack">' + mfa + '</div></section>' +
    '<section class="panel" aria-labelledby="h-tema"><header><h2 id="h-tema">Apariencia</h2></header><div class="body stack">' + tema + '</div></section>' +
    '<section class="panel" aria-labelledby="h-ses"><header><h2 id="h-ses">Sesión</h2></header><div class="body stack"><p>La sesión se cierra sola después de 30 minutos sin uso. Tocá <b>Salir</b> al terminar, sobre todo en una computadora compartida.</p><div><button class="btn" type="button" data-act="logout">Salir</button></div></div></section>';
}
var V = { inicio: vInicio, semana: vSemana, novedades: vNov, eventos: vEventos, miembros: vMiembros, cuenta: vCuenta };
var TITLES = { inicio: 'Inicio', semana: 'Semana', novedades: 'Novedades', eventos: 'Eventos', miembros: 'Miembros', cuenta: 'Mi cuenta' };

function vSetup() {
  return '<main class="wrap"><div class="panel auth"><h2>Falta configurar el portal</h2><p>Abrí <span class="mono">js/config.js</span> y pegá la clave pública del proyecto de Supabase (Project Settings, API Keys, clave publishable).</p></div></main>';
}
function vLogin() {
  return authWrap('<form class="panel auth form" id="lf"><h1 class="mark">Portal CE</h1><p class="muted">Ingresá con la cuenta que te dio el equipo.</p>' +
    (S.err ? '<div class="err" role="alert">' + esc(S.err) + '</div>' : '') +
    '<label for="lm">Correo<input id="lm" type="email" name="email" placeholder="nombre@ejemplo.com" autocomplete="username" spellcheck="false" autocapitalize="off" required></label>' +
    '<label for="lp">Clave<input id="lp" type="password" name="password" autocomplete="current-password" required></label>' +
    '<button class="btn primary" type="submit">Ingresar</button>' +
    '<button class="btn" type="button" data-act="forgot">Olvidé mi clave</button>' +
    '<p class="note">¿No tenés cuenta? Pedísela a quien administra el portal. No hay registro abierto.</p></form>');
}
/* Requisitos de clave: los mismos que exige Supabase (Authentication > Email): 12 caracteres,
   minúscula, mayúscula, número y símbolo. Se controlan antes de enviar para avisar en español. */
var PW_REQ = [
  ['len', 'Al menos 12 caracteres', function (p) { return p.length >= 12; }],
  ['low', 'Una letra minúscula (a-z)', function (p) { return /[a-z]/.test(p); }],
  ['up', 'Una letra mayúscula (A-Z)', function (p) { return /[A-Z]/.test(p); }],
  ['num', 'Un número (0-9)', function (p) { return /[0-9]/.test(p); }],
  ['sym', 'Un símbolo, por ejemplo ! ? # $ % & * -', function (p) { return /[!-\/:-@\[-`{-~]/.test(p); }]
];
function pwMissing(p) { return PW_REQ.filter(function (r) { return !r[2](p); }).map(function (r) { return r[1].charAt(0).toLowerCase() + r[1].slice(1); }); }
function pwReqHTML(p) {
  return PW_REQ.map(function (r) { var ok = r[2](p || ''); return '<li class="' + (ok ? 'ok' : '') + '"><span aria-hidden="true">' + (ok ? '✓' : '○') + '</span> ' + r[1] + '<span class="sr-only">' + (ok ? ': cumplido' : ': falta') + '</span></li>'; }).join('');
}
/* Error de validación junto al campo: mensaje debajo, aria-invalid y foco en el campo. */
function fieldErr(id, msg) {
  var el = $('#' + id); if (!el) { toast(msg); return; }
  var e = document.getElementById(id + '-err');
  if (!e) { e = document.createElement('p'); e.id = id + '-err'; e.className = 'ferr'; e.setAttribute('role', 'alert'); (el.closest('label') || el).after(e); }
  e.textContent = msg; e.hidden = false;
  el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', e.id); el.focus();
}
function clearFieldErr(el) {
  if (el.getAttribute('aria-invalid') !== 'true') return;
  el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby');
  var e = document.getElementById(el.id + '-err'); if (e) e.hidden = true;
}
function pwErr(msg) { var e = $('#pwerr'); if (e) { e.textContent = msg; e.hidden = !msg; } }
function vSetPw() {
  return authWrap('<form class="panel auth form" id="pwf" novalidate><h1 class="mark">Portal CE</h1><p class="muted">Elegí tu clave para entrar al portal.</p>' +
    '<div class="err" id="pwerr" role="alert"' + (S.err ? '' : ' hidden') + '>' + esc(S.err) + '</div>' +
    '<label for="np">Clave nueva<input id="np" type="password" minlength="12" autocomplete="new-password" aria-describedby="pwreq" required></label>' +
    '<div class="note">La clave tiene que tener:</div><ul class="pwreq" id="pwreq">' + pwReqHTML('') + '</ul>' +
    '<label for="np2">Repetir la clave<input id="np2" type="password" minlength="12" autocomplete="new-password" required></label>' +
    '<button class="btn primary" type="submit">Guardar clave</button></form>');
}
function vMfaCode() {
  return authWrap('<form class="panel auth form" id="mfaf"><h1 class="mark">Portal CE</h1><p class="muted">Escribí el código de 6 números que muestra la app de tu celular.</p>' +
    (S.err ? '<div class="err" role="alert">' + esc(S.err) + '</div>' : '') +
    '<label for="mc">Código<input id="mc" type="text" inputmode="numeric" autocomplete="one-time-code" spellcheck="false" pattern="[0-9]{6}" maxlength="6" required></label>' +
    '<button class="btn primary" type="submit">Verificar</button>' +
    '<button class="btn" type="button" data-act="logout">Salir</button>' +
    '<p class="note">¿Perdiste el celular? Pedile a quien administra que quite tu segundo factor desde el panel de Supabase.</p></form>');
}
function vNoRole() {
  return authWrap('<div class="panel auth"><h2>Tu cuenta todavía no tiene rol</h2><p>Pedile a quien administra el portal que te asigne un rol y volvé a ingresar.</p><div><button class="btn" type="button" data-act="logout">Salir</button></div></div>');
}
function vConnErr() {
  return authWrap('<div class="panel auth state-error" role="alert"><h2>No se pudo conectar con la base</h2><p>Revisá la conexión a internet y probá de nuevo.</p><div class="chips"><button class="btn primary" type="button" data-act="retry">Reintentar</button><button class="btn" type="button" data-act="logout">Salir</button></div></div>');
}
/* Navegación: barra superior en escritorio (todas las secciones) e inferior en celular (5 lugares; Miembros se abre desde Cuenta). */
var NAV_ICON = { inicio: 'home', semana: 'week', novedades: 'news', eventos: 'event', miembros: 'users', cuenta: 'user' };
var TABBAR = [['inicio', 'Inicio'], ['semana', 'Semana'], ['novedades', 'Novedades'], ['eventos', 'Eventos'], ['cuenta', 'Cuenta']];
function frame() {
  var u = S.me;
  var main = S.dataErr ? errorBox(S.dataErr) : V[S.view]();
  var curBottom = S.view === 'miembros' ? 'cuenta' : S.view;
  return '<a class="skip" href="#view">Ir al contenido</a><header class="bar"><div class="bar-in"><span class="brand">Portal CE <small>Comité Ejecutivo</small></span>' +
    '<nav class="nav-top" aria-label="Secciones">' + NAV.map(function (n) { return '<a class="' + (n[2] || '') + '" href="#' + n[0] + '" data-nav="top" data-to="' + n[0] + '"' + (S.view === n[0] ? ' aria-current="page"' : '') + '>' + n[1] + '</a>'; }).join('') + '</nav>' +
    '<div class="who"><span class="who-name">' + esc(u.nombre || u.email) + ' <span class="muted">· ' + esc(ROLES[u.rol] || '') + '</span></span>' + themeBtn() +
    '<button class="iconbtn" type="button" data-act="logout">' + ic('out') + '<span class="lbl">Salir</span></button></div></div></header>' +
    '<main class="wrap" id="view">' + main + '</main>' +
    '<nav class="tabbar" aria-label="Secciones">' + TABBAR.map(function (n) { return '<a href="#' + n[0] + '" data-nav="bottom" data-to="' + n[0] + '"' + (curBottom === n[0] ? ' aria-current="page"' : '') + '>' + ic(NAV_ICON[n[0]]) + '<span>' + n[1] + '</span></a>'; }).join('') + '</nav>';
}
/* Para devolver el foco al mismo control después de redibujar (teclado y lectores de pantalla). */
function focusSel(el) {
  if (!el || el === document.body || !el.closest || !el.closest('#app')) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  var a = [].slice.call(el.attributes).filter(function (x) { return x.name.indexOf('data-') === 0; });
  if (!a.length) return null;
  return el.tagName.toLowerCase() + a.map(function (x) { return '[' + x.name + '="' + CSS.escape(x.value) + '"]'; }).join('');
}
/* Borradores: lo escrito en un formulario sobrevive al redibujado y al cambio de sección.
   Solo en memoria (nunca en localStorage); se borra al guardar y al salir. Las claves no se guardan nunca. */
var DRAFTS = {};
function fieldDefault(el) {
  if (el.type === 'checkbox') return el.defaultChecked;
  if (el.tagName === 'SELECT') { var o = [].filter.call(el.options, function (x) { return x.defaultSelected; })[0] || el.options[0]; return o ? o.value : ''; }
  return el.defaultValue;
}
function fieldValue(el) { return el.type === 'checkbox' ? el.checked : el.value; }
function setField(el, v) { if (el.type === 'checkbox') el.checked = v; else el.value = v; }
function saveDrafts(root) {
  root.querySelectorAll('input[id], textarea[id], select[id]').forEach(function (el) {
    if (el.type === 'password' || el.dataset.cf || el.dataset.ci || el.dataset.rol || el.disabled) return;
    if (fieldValue(el) !== fieldDefault(el)) DRAFTS[el.id] = fieldValue(el); else delete DRAFTS[el.id];
  });
}
function restoreDrafts(root) {
  Object.keys(DRAFTS).forEach(function (id) { var el = root.querySelector('#' + CSS.escape(id)); if (el && !el.disabled) setField(el, DRAFTS[id]); });
}
function clearDrafts(ids) { ids.forEach(function (id) { delete DRAFTS[id]; var el = $('#' + id); if (el) setField(el, fieldDefault(el)); }); }
function hasDraftText() { saveDrafts($('#app')); return Object.keys(DRAFTS).some(function (k) { return typeof DRAFTS[k] === 'string' && DRAFTS[k].trim() !== ''; }); }
window.addEventListener('beforeunload', function (e) { if (S.session && hasDraftText()) { e.preventDefault(); e.returnValue = ''; } });
function paint(html) {
  var app = $('#app'), sel = focusSel(document.activeElement);
  saveDrafts(app);
  app.innerHTML = html;
  hydrate(app);
  restoreDrafts(app);
  if (sel) { var n = app.querySelector(sel); if (n) n.focus({ preventScroll: true }); }
}
function loadingView() { return '<div class="state" role="status">Cargando…</div>'; }
function render() {
  if (!configured) { paint(vSetup()); return; }
  if (S.loading) { paint(loadingView()); return; }
  if (S.setpw && S.session) { document.body.removeAttribute('data-role'); document.title = 'Elegir clave · Portal CE'; paint(vSetPw()); return; }
  if (!S.session) { document.body.removeAttribute('data-role'); document.title = 'Ingresar · Portal CE'; paint(vLogin()); return; }
  if (S.needCode) { document.body.removeAttribute('data-role'); document.title = 'Código · Portal CE'; paint(vMfaCode()); return; }
  if (S.needEnroll) { document.body.removeAttribute('data-role'); document.title = 'Segundo factor · Portal CE'; paint(vEnrollGate()); return; }
  if (S.connErr) { paint(vConnErr()); return; }
  if (S.noRole || !S.me) { paint(vNoRole()); return; }
  document.body.dataset.role = uiRole();
  if (!hasView(S.view) || (S.view === 'miembros' && !isAdmin())) S.view = 'inicio';
  document.title = TITLES[S.view] + ' · Portal CE';
  paint(frame());
}
function keepScroll(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }
/* La dirección refleja dónde se está: #semana, #eventos/<id>/<pestaña>. Así una sección o un evento se puede
   abrir en otra pestaña (Ctrl+clic, clic medio), compartir o volver con Atrás. */
var TAB_IDS = ['resumen', 'docs', 'tareas', 'novs', 'recursos'];
function hashFor() { return S.view === 'eventos' && S.ev ? 'eventos/' + encodeURIComponent(S.ev) + '/' + S.tab : S.view; }
function applyHash() {
  var h = (location.hash || '').slice(1).split('/'), v = h[0];
  S.view = hasView(v) ? v : 'inicio';
  if (S.view === 'eventos') {
    if (h[1]) { try { S.ev = decodeURIComponent(h[1]); } catch (e) { } }
    S.tab = TAB_IDS.indexOf(h[2]) > -1 ? h[2] : 'resumen';
  }
}
/* Cambiar de sección deja una entrada en el historial: el botón Atrás del celular vuelve a la anterior. */
function go(v) {
  S.view = hasView(v) ? v : 'inicio';
  if (location.hash.slice(1) !== hashFor()) history.pushState(null, '', '#' + hashFor());
  render(); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', function () {
  if (!S.me) return;
  var prev = S.view + S.ev + S.tab; applyHash();
  if (S.view === 'eventos' && !evById(S.ev)) S.ev = DB.eventos.length ? DB.eventos[0].id : null;
  if (prev !== S.view + S.ev + S.tab) { if (S.view !== 'eventos') S.f = { est: 'todos', rel: 'todos', g: 'todos' }; render(); window.scrollTo(0, 0); }
});
/* Salto al contenido: lleva el foco al área principal sin cambiar la dirección. */
document.addEventListener('click', function (e) {
  var a = e.target.closest('a.skip'); if (!a) return;
  e.preventDefault(); var v = $('#view'); if (v) { v.setAttribute('tabindex', '-1'); v.focus(); }
});
/* Tema: botón de la barra y opciones de Mi cuenta (solo interfaz, no toca datos). */
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-theme-set]'); if (!b) return;
  e.stopImmediatePropagation();
  applyTheme(b.getAttribute('data-theme-set'));
  render();
}, true);

/* ---------- acciones ---------- */
document.addEventListener('click', async function (e) {
  var b = e.target.closest('button'); if (!b) return;
  var d = b.dataset;
  if (d.ev) { S.ev = d.ev; S.tab = d.go || 'resumen'; S.f = { est: d.fest || 'todos', rel: 'todos', g: 'todos' }; go('eventos'); return; }
  if (d.v) { go(d.v); return; }
  if (d.tab) { S.tab = d.tab; history.replaceState(null, '', '#' + hashFor()); render(); return; }
  if (d.f) { S.f[d.f] = d.fv; keepScroll(render); return; }
  if (d.tf) { S.tf = d.tf; render(); return; }
  if (d.wk != null) { S.wk = d.wk === '0' ? 0 : S.wk + (+d.wk); render(); return; }
  if (d.tk) {
    var t = DB.tareas.filter(function (x) { return x.id === d.tk; })[0];
    if (t) await lock(b, async function () { var y = window.scrollY; await run(sb.from('tareas').update({ estado: (NEXT[t.estado] || NEXT.Pendiente)[1] }).eq('id', t.id)); window.scrollTo(0, y); });
    return;
  }
  if (d.doc) {
    var patch = { r: { recibido: true }, s: { sintesis: true }, n: { lleva_sintesis: false }, l: { lleva_sintesis: true } }[d.do];
    if (!patch) return;
    await lock(b, async function () { var y2 = window.scrollY; await run(sb.from('documentos').update(patch).eq('id', d.doc), 'Documento actualizado'); window.scrollTo(0, y2); });
    return;
  }
  if (d.del) {
    if (!DEL_CLS[d.del] || !confirm('¿Borrar ' + d.que + '?\n\nNo se puede deshacer desde el portal (queda copia en el registro de cambios).')) return;
    await lock(b, async function () {
      // Con .select() se sabe si la base borró algo: si las reglas no lo permiten, no da error, borra cero filas.
      var r = await sb.from(d.del).delete().eq('id', d.id).select('id');
      if (r.error) { saveFail(r, 'borrar'); return; }
      if (!r.data.length) { toast('No se borró: tu rol no lo permite o ya no existe.'); return; }
      if (d.del === 'eventos') S.ev = null;
      toast('Borrado');
      var y4 = window.scrollY; await reload(); window.scrollTo(0, y4);
    });
    return;
  }
  if (d.act) { await lock(b, function () { return act(d.act); }); return; }
  if (d.cal) { calAct(b); }
});
async function act(a) {
  if (a === 'logout') { clearAct(); S.err = ''; DRAFTS = {}; await sb.auth.signOut(); return; }
  if (a === 'retry') { await boot(S.session); return; }
  if (a === 'forgot') {
    var em = ($('#lm') || {}).value;
    if (!em) { fieldErr('lm', 'Escribí tu correo y volvé a tocar «Olvidé mi clave».'); return; }
    await sb.auth.resetPasswordForEmail(em.trim(), { redirectTo: location.origin + location.pathname });
    toast('Si el correo tiene cuenta, te llegará un enlace para elegir una clave nueva.');
    return;
  }
  if (a === 'addtask') {
    var n = $('#tn').value.trim(); if (!n) { fieldErr('tn', 'Escribí qué hay que hacer.'); return; }
    if (await run(sb.from('tareas').insert({ titulo: n, dia: $('#td').value || null, ad: $('#tad').value || null, prioridad: $('#tp').value }), 'Tarea agregada')) clearDrafts(['tn', 'tad', 'td', 'tp']);
    return;
  }
  if (a === 'addnov') {
    var t = $('#nt').value.trim(); if (!t) { fieldErr('nt', 'Escribí la novedad.'); return; }
    var ad = $('#nad').value; if (!ad) { fieldErr('nad', 'Elegí un expediente.'); return; }
    var f = $('#nf').value || ds(T0), withTask = $('#ntk') && $('#ntk').checked;
    var r1 = await sb.from('novedades').insert({ texto: t, ad: ad, fecha: f, autor: $('#ni').value || S.me.iniciales, qrx: $('#nq').checked });
    if (r1.error) { saveFail(r1); return; }
    if (withTask) {
      var r2 = await sb.from('tareas').insert({ titulo: 'Seguimiento: ' + t.slice(0, 60), dia: f, ad: ad, prioridad: 'media' });
      if (r2.error) { saveFail(r2, 'crear la tarea'); await reload(); return; }
    }
    toast(withTask ? 'Novedad y tarea guardadas' : 'Novedad guardada');
    clearDrafts(['nt', 'nad', 'nf', 'ni', 'nq', 'ntk']);
    await reload();
    return;
  }
  if (a === 'mfa-on') {
    /* Si quedó un alta a medias, se descarta antes de empezar otra. */
    var l = await sb.auth.mfa.listFactors();
    var pend = ((l.data && l.data.all) || []).filter(function (x) { return x.factor_type === 'totp' && x.status !== 'verified'; });
    for (var i = 0; i < pend.length; i++) { await sb.auth.mfa.unenroll({ factorId: pend[i].id }); }
    var en = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Portal CE ' + ds(new Date()) + ' ' + Date.now() % 10000 });
    if (en.error) { toast('No se pudo empezar. Probá de nuevo en un momento.'); report('mfa enroll: ' + en.error.message, true); return; }
    var qr = String(en.data.totp.qr_code || '');
    S.enroll = { id: en.data.id, qr: /^data:image\/svg\+xml/.test(qr) ? qr : '', secret: en.data.totp.secret };
    render();
    var c = $('#ec'); if (c) c.focus();
    return;
  }
  if (a === 'mfa-cancel') {
    if (S.enroll) { try { await sb.auth.mfa.unenroll({ factorId: S.enroll.id }); } catch (x) { } }
    S.enroll = null; render(); return;
  }
  if (a === 'mfa-off') {
    if (!S.factors.length || !confirm('¿Cambiar de celular?\n\nSe borra el código actual y, antes de seguir usando el portal, vas a configurar el celular nuevo.')) return;
    var un = await sb.auth.mfa.unenroll({ factorId: S.factors[0].id });
    if (un.error) { toast('No se pudo quitar. Salí, volvé a ingresar con el código y probá de nuevo.'); report('mfa unenroll: ' + un.error.message, true); return; }
    await sb.auth.refreshSession();
    toast('Configurá el celular nuevo');
    await rebootNow();
    return;
  }
}
function calAct(b) {
  var a = b.dataset.cal;
  if (a === 'new') { S.cal = newCal({}); render(); window.scrollTo(0, 0); }
  else if (a === 'from') { var n = DB.novs[+b.dataset.nv]; S.cal = newCal(n && n.cal); render(); window.scrollTo(0, 0); }
  else if (a === 'close') { S.cal = null; render(); }
  else if (a === 'tipo') { var k = b.dataset.k, c = S.cal; c.tipo = k; c.rem = TIPOS[k].rem.slice(); c.dur = TIPOS[k].dur || 60; render(); }
  else if (a === 'rem') { var m = +b.dataset.m, i = S.cal.rem.indexOf(m); if (i > -1) S.cal.rem.splice(i, 1); else S.cal.rem.push(m); render(); }
}
function loginError(err) {
  if (!err) return '';
  if (err.code === 'invalid_credentials' || /invalid login/i.test(err.message || '')) return 'Correo o clave incorrectos.';
  if (err.status === 429 || /rate limit/i.test(err.message || '')) return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.';
  if (err.code === 'email_not_confirmed') return 'Todavía no confirmaste tu correo. Buscá el mensaje de invitación.';
  return 'No se pudo conectar. Revisá la conexión y probá de nuevo.';
}
document.addEventListener('submit', async function (e) {
  var form = e.target, btn = form.querySelector('button[type=submit]');
  if (['lf', 'pwf', 'mfaf', 'enrf', 'invf'].indexOf(form.id) < 0) return;
  e.preventDefault();
  if (form.id === 'lf') {
    await lock(btn, async function () {
      S.fresh = true;
      var r = await sb.auth.signInWithPassword({ email: $('#lm').value.trim(), password: $('#lp').value });
      if (r.error) { S.fresh = false; S.err = loginError(r.error); render(); } else S.err = '';
    }, 'Ingresando…');
    return;
  }
  if (form.id === 'pwf') {
    var p1 = $('#np').value, p2 = $('#np2').value, falta = pwMissing(p1);
    /* Los errores se muestran sin redibujar, para no borrar lo que la persona escribió. */
    if (falta.length) { pwErr('A la clave le falta: ' + falta.join(', ') + '.'); $('#np').focus(); return; }
    if (p1 !== p2) { pwErr('Las dos claves no coinciden.'); $('#np2').focus(); return; }
    pwErr('');
    await lock(btn, async function () {
      var u = await sb.auth.updateUser({ password: p1 });
      if (u.error) {
        var c = u.error.code;
        pwErr(c === 'weak_password' ? 'Supabase rechazó la clave por débil. Revisá que cumpla los cinco requisitos (los símbolos válidos son los del teclado en inglés, como ! ? # $ % & * -).'
          : c === 'same_password' ? 'La clave nueva tiene que ser distinta de la anterior.'
          : c === 'reauthentication_needed' ? 'Por seguridad, salí y volvé a ingresar antes de cambiar la clave.'
          : 'No se pudo guardar la clave. Probá de nuevo en un momento.');
        report('clave: ' + (c || '') + ' ' + u.error.message, true);
        return;
      }
      S.setpw = false; S.err = ''; history.replaceState(null, '', location.pathname);
      toast('Clave guardada');
      await boot(S.session);
    }, 'Guardando…');
    return;
  }
  if (form.id === 'mfaf') {
    var code = $('#mc').value.trim();
    await lock(btn, async function () {
      var f = await sb.auth.mfa.listFactors();
      var tf = f.data && f.data.totp && f.data.totp[0];
      if (!tf) { S.err = 'No se encontró el segundo factor de tu cuenta.'; render(); return; }
      var v = await sb.auth.mfa.challengeAndVerify({ factorId: tf.id, code: code });
      if (v.error) { S.err = 'Código incorrecto o vencido. Probá con el código nuevo que muestra la app.'; render(); return; }
      S.err = ''; S.needCode = false; touch();
      await rebootNow();
    }, 'Verificando…');
    return;
  }
  if (form.id === 'enrf') {
    var ec = $('#ec').value.trim();
    await lock(btn, async function () {
      var v = await sb.auth.mfa.challengeAndVerify({ factorId: S.enroll.id, code: ec });
      if (v.error) { toast('Código incorrecto o vencido. Probá con el código nuevo.'); return; }
      S.enroll = null;
      toast('Segundo factor activado');
      await rebootNow();
    }, 'Verificando…');
    return;
  }
  if (form.id === 'invf') {
    if (!isAdmin()) return;
    var body = { email: $('#ie').value.trim(), nombre: $('#in').value.trim(), iniciales: $('#ii').value.trim(), rol: $('#ir').value, redirectTo: location.origin + location.pathname };
    await lock(btn, async function () {
      var res = await sb.functions.invoke('invitar', { body: body });
      if (res.error) {
        var msg = 'No se pudo invitar: ' + res.error.message;
        try { msg = (await res.error.context.json()).error || msg; } catch (x) { }
        toast(msg); return;
      }
      toast('Invitación enviada a ' + body.email);
      clearDrafts(['ie', 'in', 'ii', 'ir']);
      var y3 = window.scrollY; await reload(); window.scrollTo(0, y3);
    }, 'Enviando…');
  }
});
document.addEventListener('input', function (e) {
  var t = e.target;
  clearFieldErr(t);
  if (t.id === 'np') { var l = $('#pwreq'); if (l) l.innerHTML = pwReqHTML(t.value); return; }
  if (!S.cal) return;
  if (t.dataset.cf) { S.cal[t.dataset.cf] = t.dataset.cf === 'dur' ? +t.value : t.value; var p = document.getElementById('calprev'); if (p) p.innerHTML = calPrev(); }
  else if (t.dataset.ci) { S.cal.inv[t.dataset.ci] = t.checked ? 1 : 0; var q = document.getElementById('calprev'); if (q) q.innerHTML = calPrev(); }
});
document.addEventListener('change', async function (e) {
  var t = e.target;
  if (t.dataset && t.dataset.rol && isAdmin()) {
    t.disabled = true;
    /* si la base lo rechaza, se redibuja para que el selector vuelva al rol real */
    if (!await run(sb.from('members').update({ rol: t.value }).eq('id', t.dataset.rol), 'Rol actualizado')) render();
  }
});

/* ---------- arranque ---------- */
var bootedFor = null;
if (configured) {
  sb.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_OUT') { bootedFor = null; DRAFTS = {}; S.session = null; S.me = null; S.setpw = false; S.needCode = false; S.needEnroll = false; S.enroll = null; S.loading = false; S.aal = 'aal1'; DB = emptyDB(); render(); return; }
    /* Sesión guardada de hace más de 30 minutos sin uso: no se retoma. */
    if (session && !S.fresh && stale()) { setTimeout(idleLogout, 0); return; }
    if (S.fresh && session) { S.fresh = false; touch(); }
    if (event === 'PASSWORD_RECOVERY') S.setpw = true;
    /* supabase-js puede avisar SIGNED_IN e INITIAL_SESSION (en cualquier orden) para la misma sesión, y SIGNED_IN otra vez al volver a la pestaña:
       si ya se está cargando o se cargó para esa cuenta, no se repite la carga. */
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session && bootedFor === session.user.id && !S.setpw) return;
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
      /* diferido: no se hacen llamadas a Supabase dentro del propio evento */
      bootedFor = session ? session.user.id : null;
      setTimeout(function () { boot(session); }, 0);
    }
  });
  applyHash();
} else { S.loading = false; render(); }
})();
