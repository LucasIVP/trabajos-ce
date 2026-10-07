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
var NOW = new Date(), T0 = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
function pd(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function ds(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function addD(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function fm(s) { var d = pd(s); return d.getDate() + ' ' + MON[d.getMonth()]; }
function days(s) { return Math.round((pd(s) - T0) / 864e5); }
function range(e) { return e.desde === e.hasta ? fm(e.desde) : fm(e.desde) + ' al ' + fm(e.hasta); }
function monday(off) { return addD(T0, -((T0.getDay() + 6) % 7) + 7 * off); }
function safeUrl(u) { return /^https:\/\//i.test(u || '') ? u : null; }
function toast(m) { var t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 3200); }
function fdt(s) { var d = new Date(s); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

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
  if (isAdmin()) {
    qs.push(sb.from('auditoria').select('*').order('momento', { ascending: false }).limit(50));
    qs.push(sb.from('errores').select('*').order('momento', { ascending: false }).limit(30));
  }
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
  DB.audit = q[7] ? q[7].data : [];
  DB.errs = q[8] ? q[8].data : [];
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
function saveFail(r, que) {
  toast('No se pudo ' + (que || 'guardar') + ': ' + r.error.message);
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
function evById(id) { return DB.eventos.filter(function (e) { return e.id === id; })[0]; }
/* Estado de un documento: falta (no recibido), ok (con Síntesis), na (recibido y no lleva Síntesis), sin (recibido, falta la Síntesis) */
function docStat(d) { return !d.recibido ? 'falta' : d.sintesis ? 'ok' : d.lleva_sintesis === false ? 'na' : 'sin'; }
function pill(p) { return '<span class="pill p-' + esc(p) + '">' + esc(p.charAt(0).toUpperCase() + p.slice(1)) + '</span>'; }
function docPill(d) { var s = docStat(d); return s === 'ok' ? '<span class="pill p-baja">Con Síntesis</span>' : s === 'na' ? '<span class="pill p-neutral">No lleva Síntesis</span>' : s === 'sin' ? '<span class="pill p-media">Falta Síntesis</span>' : '<span class="pill p-alta">No disponible</span>'; }
/* listo = con Síntesis o recibido sin necesidad de Síntesis */
function docCounts(list) { var ok = 0, na = 0, sin = 0, no = 0; list.forEach(function (d) { var s = docStat(d); if (s === 'ok') ok++; else if (s === 'na') na++; else if (s === 'sin') sin++; else no++; }); return { ok: ok, na: na, listo: ok + na, sin: sin, no: no, t: list.length }; }
function meter(c) { return c.t ? '<div class="meter" role="img" aria-label="Avance de documentos: ' + c.listo + ' listos de ' + c.t + '"><i class="m-ok" style="width:' + c.listo / c.t * 100 + '%"></i><i class="m-mid" style="width:' + c.sin / c.t * 100 + '%"></i><i class="m-no" style="width:' + c.no / c.t * 100 + '%"></i></div>' : ''; }
function evCard(e) {
  var n = days(e.desde), cnt = days(e.hasta) < 0 ? '<span class="days" style="font-size:16px">Finalizado</span>' : '<span class="days">' + Math.max(n, 0) + '<small>' + (n > 0 ? 'días' : 'en curso') + '</small></span>';
  return '<button type="button" class="ev-card" data-ev="' + esc(e.id) + '">' + cnt + '<b>' + esc(e.n) + '</b><span class="meta">' + esc(e.lugar) + ' · ' + range(e) + '</span><span><span class="pill p-neutral">' + esc(e.st) + '</span> <span class="mono muted">#' + esc(e.ad || '') + '</span></span></button>';
}
/* Borrar: tareas y novedades, edición y admin; el resto, solo admin (lo mismo que exigen las reglas de la base). */
var DEL_CLS = { tareas: 'edit', novedades: 'edit', documentos: 'adm', recursos: 'adm', eventos: 'adm' };
function delBtn(tabla, id, que) { return '<button type="button" class="btn ghost del ' + DEL_CLS[tabla] + '" data-del="' + tabla + '" data-id="' + esc(id) + '" data-que="' + esc(que) + '">Borrar</button>'; }
var NEXT = { 'Pendiente': ['Empezar', 'En Proceso'], 'En Proceso': ['Completar', 'Completadas'], 'Completadas': ['Reabrir', 'Pendiente'] };
function taskHTML(t) {
  var p = ['alta', 'media', 'baja'].indexOf(t.prioridad) > -1 ? t.prioridad : 'media';
  var nx = NEXT[t.estado] || NEXT.Pendiente;
  return '<div class="tk ' + p + (t.estado === 'Completadas' ? ' done' : '') + '"><div class="t">' + esc(t.titulo) + '</div><div class="m"><span class="mono">#' + esc(t.ad || '—') + '</span>' + (t.estado === 'En Proceso' ? '<span class="pill p-neutral">En proceso</span>' : '') + (t.estado === 'Completadas' ? '<span class="pill p-baja">Hecha</span>' : '') + '<button type="button" class="btn ghost edit" data-tk="' + esc(t.id) + '">' + nx[0] + '</button>' + delBtn('tareas', t.id, 'la tarea "' + t.titulo + '"') + '</div></div>';
}
function novHTML(n) {
  var d = pd(n.fecha), i = DB.novs.indexOf(n);
  return '<div class="nv"><div class="dt"><b>' + d.getDate() + '</b><span>' + MON[d.getMonth()] + '</span></div><div><p>' + esc(n.texto) + '</p><span class="muted">' + esc(n.autor) + '</span> ' + (n.qrx ? '<span class="pill p-media">En espera (Qrx)</span>' : '') + (n.cal ? ' <button class="btn ghost edit" type="button" data-cal="from" data-nv="' + i + '">Preparar evento de Calendar</button>' : '') + ' ' + delBtn('novedades', n.id, 'la novedad del ' + fm(n.fecha) + ' (#' + n.ad + ')') + '</div></div>';
}
function expOptions() { return DB.expList.map(function (x) { return '<option value="' + esc(x.ad) + '">#' + esc(x.ad) + ' ' + esc(x.nombre) + '</option>'; }).join(''); }
function empty(msg) { return '<div class="panel empty-box">' + msg + '</div>'; }
function memberName(id) { var m = DB.members.filter(function (x) { return x.id === id; })[0]; return m ? (m.nombre || m.email) : (id ? 'cuenta borrada' : 'sistema'); }

/* ---------- vistas ---------- */
function vInicio() {
  var next = DB.eventos.filter(function (e) { return days(e.hasta) >= 0; }).sort(function (a, b) { return a.desde < b.desde ? -1 : 1; });
  var q = DB.novs.filter(function (n) { return n.qrx; });
  var cur = next[0], cn = docCounts(cur ? (DB.docs[cur.id] || []) : []);
  var m0 = ds(monday(0)), m1 = ds(addD(monday(0), 6));
  var wk = DB.tareas.filter(function (t) { return t.dia && t.dia >= m0 && t.dia <= m1 && t.estado !== 'Completadas'; }).sort(function (a, b) { return a.dia < b.dia ? -1 : 1; }).slice(0, 6);
  var name = S.me.nombre || S.me.email;
  return '<div class="head"><div><h1>Buen día, ' + esc(name) + '</h1><p>Esto es lo que hay para el Comité Ejecutivo hoy.</p></div></div>' +
    '<section><div class="head" style="margin-bottom:10px"><h2>Próximos eventos</h2><button class="btn" data-v="eventos" type="button">Ver todos</button></div>' + (next.length ? '<div class="grid3">' + next.slice(0, 3).map(evCard).join('') + '</div>' : empty('Todavía no hay eventos cargados.')) + '</section>' +
    '<div class="grid2">' +
    '<section class="panel"><header><h2>Esta semana, por hacer</h2><button class="btn" data-v="semana" type="button">Abrir semana</button></header><div class="body">' +
    (wk.length ? wk.map(taskHTML).join('') : '<div class="empty-box">No hay tareas pendientes esta semana.</div>') + '</div></section>' +
    '<div style="display:flex;flex-direction:column;gap:20px;min-width:0">' +
    '<section class="panel"><header><h2>' + (cur ? esc(cur.n) + ': documentos' : 'Documentos') + '</h2>' + (cur ? '<button class="btn" data-ev="' + esc(cur.id) + '" data-go="docs" type="button">Abrir</button>' : '') + '</header><div class="body" style="display:grid;gap:10px">' +
    '<div><b class="mono" style="font-size:22px">' + cn.listo + '</b> <span class="muted">de ' + cn.t + ' listos</span></div>' + meter(cn) +
    '<div class="note">' + cn.ok + ' con Síntesis · ' + (cn.na ? cn.na + ' no la llevan · ' : '') + cn.sin + ' recibidos sin Síntesis · ' + cn.no + ' aún no disponibles</div></div></section>' +
    '<section class="panel"><header><h2>En espera (Qrx)</h2><span class="pill p-media">' + q.length + '</span></header><div class="body">' + (q.length ? q.map(function (n) { return '<div style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="mono muted">#' + esc(n.ad) + ' · ' + fm(n.fecha) + '</span><div class="wrapw">' + esc(n.texto) + '</div></div>'; }).join('') : '<div class="empty-box">Nada en espera.</div>') + '</div></section>' +
    '</div></div>';
}
function vSemana() {
  var base = monday(S.wk), names = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'], tds = ds(T0);
  var cols = names.map(function (nm, i) {
    var d = addD(base, i), k = ds(d), list = DB.tareas.filter(function (t) { return t.dia === k && (S.tf === 'todas' || t.prioridad === 'alta'); });
    return '<section class="day' + (k === tds ? ' today' : '') + '"><span class="dn">' + d.getDate() + ' ' + MON[d.getMonth()] + (k === tds ? ' · Hoy' : '') + '</span><h3>' + nm + '</h3>' + (list.length ? list.map(taskHTML).join('') : '<p class="empty">Libre</p>') + '</section>';
  }).join('');
  var sin = DB.tareas.filter(function (t) { return !t.dia; }), end = addD(base, 6);
  var form = '<section class="panel edit"><header><h2>Nueva tarea</h2><span class="note">Se guarda para todo el equipo</span></header><div class="body form">' +
    '<label for="tn">Tarea<input id="tn" type="text" maxlength="300" placeholder="Qué hay que hacer"></label>' +
    '<div class="row"><label for="tad">Expediente<select id="tad"><option value="">Sin expediente</option>' + expOptions() + '</select></label>' +
    '<label for="td">Día<input id="td" type="date" value="' + ds(T0) + '"></label>' +
    '<label for="tp">Prioridad<select id="tp"><option value="alta">Alta</option><option value="media" selected>Media</option><option value="baja">Baja</option></select></label></div>' +
    '<div><button class="btn primary" type="button" data-act="addtask">Agregar tarea</button></div></div></section>';
  return '<div class="head"><div><h1>Semana de trabajo</h1><p>Del ' + fm(ds(base)) + ' al ' + fm(ds(end)) + ' de ' + end.getFullYear() + '.</p></div>' +
    '<div class="chips"><button class="btn" type="button" data-wk="-1">Semana anterior</button><button class="btn" type="button" data-wk="0">Esta semana</button><button class="btn" type="button" data-wk="1">Semana siguiente</button></div></div>' +
    '<div class="chips"><span class="gl">Mostrar</span><button class="chip" data-tf="todas" aria-pressed="' + (S.tf === 'todas') + '" type="button">Todas</button><button class="chip" data-tf="alta" aria-pressed="' + (S.tf === 'alta') + '" type="button">Solo prioridad alta</button></div>' +
    '<div class="board">' + cols + '</div>' +
    '<section><h2 style="margin-bottom:10px">Sin día asignado</h2>' + (sin.length ? '<div class="grid3">' + sin.map(taskHTML).join('') + '</div>' : empty('Todas las tareas tienen día.')) + '</section>' + form;
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
  var when = DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + (allDay ? ' · todo el día' : ' · ' + esc(c.hora) + ' a ' + hhmm(c.hora, c.dur || 60) + ' (hora de Argentina)');
  return '<div class="prev"><span class="note">Así quedará en Google Calendar</span><h3>' + esc(c.titulo || 'Sin título') + '</h3><dl>' +
    '<dt>Cuándo</dt><dd>' + when + '</dd><dt>Calendario</dt><dd>Calendario institucional</dd>' +
    '<dt>Videollamada</dt><dd>' + (c.link ? esc(c.link) : 'Sin link') + '</dd>' +
    '<dt>Invitados</dt><dd>' + (who.length ? who.join(', ') : 'Nadie') + '</dd>' +
    '<dt>Avisos</dt><dd>' + (c.rem.length ? c.rem.slice().sort(function (a, b) { return b - a; }).map(remLabel).join(' · ') + ' antes' : 'Sin avisos') + '</dd></dl>' +
    (c.tipo === 'reunion' && !c.link ? '<div class="warn">Sin link, el evento se crea sin videollamada. Cuando llegue el link oficial, se agrega en el mismo evento.</div>' : '') + '</div>';
}
function calPanel() {
  var c = S.cal; if (!c) return '';
  var head = '<header><h2>Evento de Google Calendar</h2><div class="status"><span>Vista previa · la creación en Calendar se conecta más adelante</span><button class="btn ghost" type="button" data-cal="close">Cerrar</button></div></header>';
  var types = '<div class="types" role="group" aria-label="Tipo de evento">' + Object.keys(TIPOS).map(function (k) { return '<button type="button" data-cal="tipo" data-k="' + k + '" aria-pressed="' + (c.tipo === k) + '"><b>' + TIPOS[k].n + '</b><span>' + TIPOS[k].d + '</span></button>'; }).join('') + '</div>';
  var rem = c.tipo === 'custom'
    ? '<div class="chips">' + REMALL.map(function (r) { return '<button class="chip" type="button" data-cal="rem" data-m="' + r[0] + '" aria-pressed="' + (c.rem.indexOf(r[0]) > -1) + '">' + r[1] + '</button>'; }).join('') + '</div>'
    : '<div class="chips">' + c.rem.map(function (m) { return '<span class="pill p-neutral">' + remLabel(m) + ' antes</span>'; }).join('') + '<span class="note">Avisos fijos de este tipo</span></div>';
  var form = '<div class="form"><div class="note">Tipo de evento</div>' + types +
    '<label for="cf-titulo">Título<input id="cf-titulo" type="text" data-cf="titulo" value="' + esc(c.titulo) + '"></label>' +
    '<div class="row"><label for="cf-fecha">Fecha<input id="cf-fecha" type="date" data-cf="fecha" value="' + esc(c.fecha) + '"></label>' +
    (c.tipo === 'fecha' ? '' : '<label for="cf-hora">Hora (Argentina)<input id="cf-hora" type="time" data-cf="hora" value="' + esc(c.hora) + '"></label><label for="cf-dur">Duración<select id="cf-dur" data-cf="dur">' + [30, 60, 90, 120, 480].map(function (m) { return '<option value="' + m + '"' + (c.dur === m ? ' selected' : '') + '>' + (m < 60 ? m + ' min' : m / 60 + ' h') + '</option>'; }).join('') + '</select></label>') + '</div>' +
    (c.tipo === 'fecha' ? '' : '<label for="cf-link">Link de la videollamada (opcional)<input id="cf-link" type="text" data-cf="link" placeholder="Pegar el link oficial. Si queda vacío, no se agrega ninguno." value="' + esc(c.link) + '"></label>') +
    '<div><div class="note" style="margin-bottom:6px">Invitar a</div><div class="checks">' + invList().map(function (i) { return '<label><input type="checkbox" data-ci="' + esc(i[0]) + '"' + (c.inv[i[0]] ? ' checked' : '') + '> ' + esc(i[1]) + '</label>'; }).join('') + '</div></div>' +
    '<div><div class="note" style="margin-bottom:6px">Avisos</div>' + rem + '</div></div>';
  return '<section class="panel cal edit">' + head + '<div class="body cal-grid"><div>' + form + '</div><div style="display:grid;gap:12px"><div id="calprev">' + calPrev() + '</div><div><button class="btn primary" type="button" disabled>Crear evento y enviar invitaciones</button><p class="note" style="margin:6px 0 0">Todavía no crea nada en Google Calendar. Hasta entonces, cargá el evento a mano con estos datos.</p></div></div></div></section>';
}
function vNov() {
  var g = {}, order = [];
  DB.novs.forEach(function (n) { if (!g[n.ad]) { g[n.ad] = []; order.push(n.ad); } g[n.ad].push(n); });
  var form = '<section class="panel edit"><header><h2>Cargar novedad</h2><span class="note">Se guarda para todo el equipo</span></header><div class="body form">' +
    '<label for="nt">Novedad<textarea id="nt" maxlength="2000" placeholder="Qué pasó. Ej.: Se envió la confirmación de preferencia."></textarea></label>' +
    '<div class="row"><label for="nad">Expediente<select id="nad">' + expOptions() + '</select></label>' +
    '<label for="nf">Fecha<input id="nf" type="date" value="' + ds(T0) + '"></label><label for="ni">Iniciales<input id="ni" type="text" value="' + esc(S.me.iniciales) + '" maxlength="6"></label></div>' +
    '<div class="chips"><label style="display:flex;gap:6px;align-items:center;color:var(--ink)"><input type="checkbox" id="nq"> Queda en espera (Qrx)</label><label style="display:flex;gap:6px;align-items:center;color:var(--ink)"><input type="checkbox" id="ntk"> Crear también una tarea</label></div>' +
    '<div><button class="btn primary" type="button" data-act="addnov">Guardar novedad</button></div></div></section>';
  return '<div class="head"><div><h1>Novedades</h1><p>Novedades por expediente, de la más reciente a la más antigua.</p></div><div class="chips"><button class="btn edit" type="button" data-cal="new">Preparar evento de Calendar</button></div></div>' + calPanel() + form +
    (order.length ? order.map(function (ad) { return '<section class="grp"><h3>#' + esc(ad) + ' <small>' + esc(DB.exp[ad] || '') + '</small></h3>' + g[ad].map(novHTML).join('') + '</section>'; }).join('') : empty('Todavía no hay novedades.'));
}
function docsTable(list) {
  var f = S.f;
  var rows = list.filter(function (d) {
    if (f.est !== 'todos' && docStat(d) !== f.est) return false;
    if (f.rel !== 'todos' && d.relevancia !== f.rel) return false;
    if (f.g !== 'todos' && d.grupo !== f.g) return false; return true;
  });
  function ch(k, label, opts) { return '<div class="chips"><span class="gl">' + label + '</span>' + opts.map(function (o) { return '<button class="chip" type="button" data-f="' + k + '" data-fv="' + o[0] + '" aria-pressed="' + (f[k] === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
  function link(u, txt) { var s = safeUrl(u); return s ? '<a class="lnk" href="' + esc(s) + '" target="_blank" rel="noopener noreferrer">' + txt + '</a>' : null; }
  return '<div style="display:flex;flex-wrap:wrap;gap:12px 24px">' + ch('est', 'Estado', [['todos', 'Todos'], ['ok', 'Con Síntesis'], ['sin', 'Sin Síntesis'], ['na', 'No lleva Síntesis'], ['falta', 'No disponible']]) + ch('rel', 'Relevancia', [['todos', 'Todas'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']]) + ch('g', 'Grupo', [['todos', 'Todos'], ['P', 'Plenario'], ['S', 'Subcomités'], ['I', 'Informativos']]) + '</div>' +
    '<div class="note" style="margin:8px 0" role="status">Mostrando ' + rows.length + ' de ' + list.length + ' documentos</div>' +
    '<div class="panel tbox"><table><thead><tr><th>Punto</th><th>Documento</th><th>Asunto</th><th>Relevancia</th><th>Idioma</th><th>Estado</th><th>Documento</th><th>Síntesis (Doc)</th></tr></thead><tbody>' +
    (rows.length ? rows.map(function (d) {
      var lleva = d.lleva_sintesis !== false;
      var act = !d.recibido ? '<button class="btn ghost" type="button" data-doc="' + esc(d.id) + '" data-do="r">Marcar recibido</button>' : !d.sintesis && lleva ? '<button class="btn ghost" type="button" data-doc="' + esc(d.id) + '" data-do="s">Marcar Síntesis lista</button>' : '';
      if (!d.sintesis) act += ' <button class="btn ghost adm" type="button" data-doc="' + esc(d.id) + '" data-do="' + (lleva ? 'n">No lleva Síntesis' : 'l">Sí lleva Síntesis') + '</button>';
      var a = d.recibido ? (link(d.url_doc, 'Abrir') || '<span class="muted">Sin link</span>') : '<span class="muted">Sin archivo</span>';
      var b = d.sintesis ? (link(d.url_sintesis, 'Abrir Síntesis') || '<span class="muted">Sin link</span>') : !lleva ? '<span class="muted">No lleva</span>' : (d.recibido ? '<span class="muted">Falta</span>' : '<span class="muted">—</span>');
      return '<tr><td class="mono muted">' + esc(d.punto) + '</td><td class="code">' + esc(d.codigo) + '<div style="margin-top:4px">' + delBtn('documentos', d.id, 'el documento ' + d.codigo) + '</div></td><td>' + esc(d.asunto) + '</td><td>' + pill(d.relevancia) + '</td><td class="mono">' + (d.recibido ? esc(d.idioma || '—') : '—') + '</td><td>' + docPill(d) + (act ? '<div class="edit" style="margin-top:4px">' + act + '</div>' : '') + '</td><td>' + a + '</td><td>' + b + '</td></tr>';
    }).join('') : '<tr><td colspan="8" class="empty-box">Ningún documento coincide con los filtros.</td></tr>') +
    '</tbody></table></div>';
}
function vEventos() {
  if (!DB.eventos.length) return '<div class="head"><div><h1>Eventos</h1></div></div>' + empty('Todavía no hay eventos cargados. Quien administra los carga desde el panel de la base.');
  var e = evById(S.ev), list = DB.docs[e.id] || [], c = docCounts(list);
  var tabs = [['resumen', 'Resumen'], ['docs', 'Documentos'], ['tareas', 'Tareas'], ['novs', 'Novedades'], ['recursos', 'Recursos']];
  var tb = '<div class="tabs" role="tablist" aria-label="Secciones del evento">' + tabs.map(function (t) { return '<button type="button" role="tab" id="tab-' + t[0] + '" aria-controls="tabpanel" data-tab="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
  var body = '';
  if (S.tab === 'resumen') {
    body = '<div class="kpis"><div class="kpi"><div class="n">' + Math.max(days(e.desde), 0) + '</div><div class="l">días para el inicio</div></div><div class="kpi"><div class="n">' + c.t + '</div><div class="l">documentos en seguimiento</div></div><div class="kpi"><div class="n">' + c.listo + '</div><div class="l">listos (con Síntesis o sin necesidad)</div></div><div class="kpi"><div class="n">' + DB.tareas.filter(function (t) { return t.ad === e.ad && t.estado !== 'Completadas'; }).length + '</div><div class="l">tareas abiertas</div></div></div>' +
      (c.t ? '<div>' + meter(c) + '<div class="note" style="margin-top:6px">Verde: con Síntesis o no la lleva · Ámbar: recibido sin Síntesis · Rojo: aún no disponible</div></div>' : '') +
      '<div class="panel"><div class="body"><h3>Datos del evento</h3><p style="margin:6px 0 0" class="muted">' + esc(e.lugar) + ' · ' + range(e) + ' · Expediente <span class="mono">#' + esc(e.ad || '—') + '</span></p></div></div>';
  } else if (S.tab === 'docs') {
    body = list.length ? docsTable(list) : empty('Todavía no hay documentos para este evento.<br>Se cargan a medida que llegan, con su link a Drive.');
  } else if (S.tab === 'tareas') {
    var ts = DB.tareas.filter(function (t) { return t.ad === e.ad; });
    body = ts.length ? '<div class="grid3">' + ts.map(taskHTML).join('') + '</div>' : empty('No hay tareas para este evento.');
  } else if (S.tab === 'novs') {
    var ns = DB.novs.filter(function (n) { return n.ad === e.ad; });
    body = ns.length ? '<div class="panel"><div class="body">' + ns.map(novHTML).join('') + '</div></div>' : empty('Todavía no hay novedades de este evento.');
  } else {
    var rs = DB.recursos.filter(function (r) { return r.evento_id === e.id; });
    body = rs.length ? '<div class="grid3">' + rs.map(function (r) { var u = safeUrl(r.url); return '<div class="panel"><div class="body"><h3>' + esc(r.titulo) + '</h3><p class="note" style="margin:6px 0 10px">Link a Drive. Quien no tiene permiso en Drive no puede abrirlo.</p>' + (u ? '<a class="lnk" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">Abrir en Drive</a>' : '<span class="muted">Sin link</span>') + ' ' + delBtn('recursos', r.id, 'el recurso "' + r.titulo + '"') + '</div></div>'; }).join('') + '</div>' : empty('Todavía no hay recursos cargados para este evento.');
  }
  return '<div class="head"><div><h1>Eventos</h1><p>Cada evento reúne sus documentos, tareas, novedades y recursos.</p></div></div>' +
    '<div class="ev-layout"><div class="ev-list">' + DB.eventos.map(function (x) { return '<button type="button" data-ev="' + esc(x.id) + '"' + (x.id === S.ev ? ' aria-current="true"' : '') + '><b>' + esc(x.n) + '</b><span>' + range(x) + ' · ' + esc(x.lugar) + '</span></button>'; }).join('') + '</div>' +
    '<div style="display:flex;flex-direction:column;gap:16px;min-width:0"><div><h2 style="font-size:20px">' + esc(e.n) + '</h2><div class="muted" style="margin-top:2px">' + esc(e.lugar) + ' · ' + range(e) + ' · <span class="pill p-neutral">' + esc(e.st) + '</span> ' + delBtn('eventos', e.id, 'el evento "' + e.n + '" junto con sus ' + list.length + ' documentos y sus recursos') + '</div></div>' + tb + '<div id="tabpanel" role="tabpanel" aria-labelledby="tab-' + S.tab + '" style="display:flex;flex-direction:column;gap:16px;min-width:0">' + body + '</div></div></div>';
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
    '<div class="panel tbox"><table style="min-width:640px"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Iniciales</th></tr></thead><tbody>' + DB.members.map(function (m) {
      var self = m.id === S.me.id;
      var sel = '<select data-rol="' + esc(m.id) + '" aria-label="Rol de ' + esc(m.email) + '"' + (self ? ' disabled title="No podés cambiar tu propio rol"' : '') + '>' + (m.rol ? '' : '<option value="" selected disabled>Sin rol</option>') + Object.keys(ROLES).map(function (k) { return '<option value="' + k + '"' + (m.rol === k ? ' selected' : '') + '>' + ROLES[k] + '</option>'; }).join('') + '</select>';
      return '<tr><td>' + esc(m.nombre || '—') + '</td><td class="mono">' + esc(m.email) + '</td><td>' + sel + '</td><td class="mono">' + esc(m.iniciales || '—') + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<section class="panel"><header><h2>Invitar a una persona</h2></header><div class="body"><form class="form" id="invf">' +
    '<div class="row"><label for="ie">Correo<input id="ie" type="email" placeholder="nombre@ejemplo.com" maxlength="254" required></label>' +
    '<label for="in">Nombre<input id="in" type="text" maxlength="120"></label>' +
    '<label for="ii">Iniciales<input id="ii" type="text" maxlength="8"></label>' +
    '<label for="ir">Rol<select id="ir"><option value="">Sin rol (lo asignás después)</option>' + Object.keys(ROLES).map(function (k) { return '<option value="' + k + '">' + ROLES[k] + '</option>'; }).join('') + '</select></label></div>' +
    '<div><button class="btn primary" type="submit">Enviar invitación</button></div></form>' +
    '<p class="note" style="margin:8px 0 0">La persona recibe un correo para crear su clave (mínimo 12 caracteres). Para dar de baja a alguien, borrarlo desde el panel de Supabase: Authentication, Users.</p></div></section>' +
    '<section class="panel"><header><h2>Registro de cambios</h2><span class="note">Últimos 50 · altas, cambios y borrados de todo el portal</span></header>' +
    (DB.audit.length ? '<div class="tbox"><table style="min-width:720px"><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Tabla</th><th>Detalle</th></tr></thead><tbody>' + DB.audit.map(auditRow).join('') + '</tbody></table></div>' : '<div class="empty-box">Todavía no hay cambios registrados.</div>') + '</section>' +
    '<section class="panel"><header><h2>Errores de la página</h2><span class="note">Últimos 30 · sin datos de expedientes</span></header>' +
    (DB.errs.length ? '<div class="tbox"><table style="min-width:720px"><thead><tr><th>Cuándo</th><th>Quién</th><th>Vista</th><th>Mensaje</th></tr></thead><tbody>' + DB.errs.map(function (x) { return '<tr><td class="mono">' + esc(fdt(x.momento)) + '</td><td>' + esc(memberName(x.usuario)) + '</td><td class="mono">' + esc(x.vista) + '</td><td class="wrapw">' + esc(x.mensaje) + '<div class="note">' + esc(x.navegador) + '</div></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty-box">Sin errores registrados.</div>') + '</section>';
}
function enrollHTML() {
  if (!S.enroll) return '<button class="btn primary" type="button" data-act="mfa-on">Empezar</button>';
  return '<ol class="steps"><li>Instalá una app de códigos en tu celular (Google Authenticator, Microsoft Authenticator u otra).</li>' +
      '<li>En la app, agregá una cuenta escaneando este código:' + (S.enroll.qr ? '<div class="qr"><img src="' + esc(S.enroll.qr) + '" alt="Código QR para agregar el Portal CE a la app de códigos" width="180" height="180"></div>' : '') +
      '<div class="note">Si no podés escanearlo, cargá esta clave a mano: <span class="mono secret">' + esc(S.enroll.secret) + '</span></div></li>' +
      '<li>Escribí el código de 6 números que muestra la app.</li></ol>' +
      '<form class="form" id="enrf"><label for="ec">Código de la app<input id="ec" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>' +
      '<div class="chips"><button class="btn primary" type="submit">Confirmar y activar</button><button class="btn" type="button" data-act="mfa-cancel">Cancelar</button></div></form>';
}
function vEnrollGate() {
  var em = S.session && S.session.user ? S.session.user.email : '';
  return '<main class="wrap"><section class="panel login" style="max-width:520px"><h1 class="mark">Portal CE</h1>' +
    '<p style="margin:0">Para entrar al portal hace falta el <b>segundo factor</b>: además de la clave, un código de 6 números que genera una app en tu celular. Se configura una sola vez.</p>' +
    '<p class="note" style="margin:0">Cuenta: <span class="mono">' + esc(em) + '</span></p>' + enrollHTML() +
    '<button class="btn ghost" type="button" data-act="logout">Salir</button></section></main>';
}
function vCuenta() {
  var u = S.me;
  var mfa = '<p><span class="pill p-baja">Activo</span> Al ingresar se te pide la clave y el código de la app.</p>' +
    '<button class="btn" type="button" data-act="mfa-off">Cambiar de celular</button><p class="note">Se borra el código actual y, antes de seguir, configurás el celular nuevo.</p>';
  return '<div class="head"><div><h1>Mi cuenta</h1><p>Tus datos y la seguridad de tu ingreso.</p></div></div>' +
    '<section class="panel"><header><h2>Datos</h2></header><div class="body"><dl class="kv"><dt>Nombre</dt><dd>' + esc(u.nombre || '—') + '</dd><dt>Correo</dt><dd class="mono">' + esc(u.email) + '</dd><dt>Rol</dt><dd>' + esc(ROLES[u.rol] || '—') + '</dd><dt>Iniciales</dt><dd class="mono">' + esc(u.iniciales || '—') + '</dd></dl></div></section>' +
    '<section class="panel"><header><h2>Segundo factor (código en el celular)</h2></header><div class="body">' + mfa + '</div></section>' +
    '<section class="panel"><header><h2>Sesión</h2></header><div class="body"><p style="margin-top:0">La sesión se cierra sola después de 30 minutos sin uso. Tocá <b>Salir</b> al terminar, sobre todo en una computadora compartida.</p><button class="btn" type="button" data-act="logout">Salir</button></div></section>';
}
var V = { inicio: vInicio, semana: vSemana, novedades: vNov, eventos: vEventos, miembros: vMiembros, cuenta: vCuenta };
var TITLES = { inicio: 'Inicio', semana: 'Semana', novedades: 'Novedades', eventos: 'Eventos', miembros: 'Miembros', cuenta: 'Mi cuenta' };

function vSetup() {
  return '<main class="wrap"><div class="panel setup"><h2>Falta configurar el portal</h2><p>Abrí <span class="mono">js/config.js</span> y pegá la clave pública del proyecto de Supabase (Project Settings, API Keys, clave publishable).</p></div></main>';
}
function vLogin() {
  return '<main class="wrap"><form class="panel login form" id="lf"><h1 class="mark">Portal CE</h1><div class="muted">Ingresá con la cuenta que te dio el equipo.</div>' +
    (S.err ? '<div class="err" role="alert">' + esc(S.err) + '</div>' : '') +
    '<label for="lm">Correo<input id="lm" type="email" placeholder="nombre@ejemplo.com" autocomplete="username" required></label>' +
    '<label for="lp">Clave<input id="lp" type="password" placeholder="••••••••" autocomplete="current-password" required></label>' +
    '<button class="btn primary" type="submit" style="padding:10px">Ingresar</button>' +
    '<button class="btn ghost" type="button" data-act="forgot">Olvidé mi clave</button>' +
    '<p class="note" style="margin:0">¿No tenés cuenta? Pedísela a quien administra el portal. No hay registro abierto.</p></form></main>';
}
function vSetPw() {
  return '<main class="wrap"><form class="panel login form" id="pwf"><h1 class="mark">Portal CE</h1><div class="muted">Elegí tu clave para entrar al portal.</div>' +
    (S.err ? '<div class="err" role="alert">' + esc(S.err) + '</div>' : '') +
    '<label for="np">Clave nueva (mínimo 12 caracteres)<input id="np" type="password" minlength="12" autocomplete="new-password" required></label>' +
    '<label for="np2">Repetir la clave<input id="np2" type="password" minlength="12" autocomplete="new-password" required></label>' +
    '<button class="btn primary" type="submit" style="padding:10px">Guardar clave</button></form></main>';
}
function vMfaCode() {
  return '<main class="wrap"><form class="panel login form" id="mfaf"><h1 class="mark">Portal CE</h1><div class="muted">Escribí el código de 6 números que muestra la app de tu celular.</div>' +
    (S.err ? '<div class="err" role="alert">' + esc(S.err) + '</div>' : '') +
    '<label for="mc">Código<input id="mc" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>' +
    '<button class="btn primary" type="submit" style="padding:10px">Verificar</button>' +
    '<button class="btn ghost" type="button" data-act="logout">Salir</button>' +
    '<p class="note" style="margin:0">¿Perdiste el celular? Pedile a quien administra que quite tu segundo factor desde el panel de Supabase.</p></form></main>';
}
function vNoRole() {
  return '<main class="wrap"><div class="panel setup"><h2>Tu cuenta todavía no tiene rol</h2><p>Pedile a quien administra el portal que te asigne un rol y volvé a ingresar.</p><button class="btn" type="button" data-act="logout">Salir</button></div></main>';
}
function vConnErr() {
  return '<main class="wrap"><div class="panel setup" role="alert"><h2>No se pudo conectar con la base</h2><p>Revisá la conexión a internet y probá de nuevo.</p><div class="chips"><button class="btn primary" type="button" data-act="retry">Reintentar</button><button class="btn" type="button" data-act="logout">Salir</button></div></div></main>';
}
function frame() {
  var u = S.me;
  var main = S.dataErr
    ? '<div class="panel empty-box" role="alert">' + esc(S.dataErr) + '<div style="margin-top:12px"><button class="btn primary" type="button" data-act="retry">Reintentar</button></div></div>'
    : V[S.view]();
  return '<div class="bar"><div class="bar-in"><div class="brand">Portal CE <small>Comité Ejecutivo</small></div><nav class="nav" aria-label="Secciones">' +
    NAV.map(function (n) { return '<button type="button" class="' + (n[2] || '') + '" data-v="' + n[0] + '"' + (S.view === n[0] ? ' aria-current="page"' : '') + '>' + n[1] + '</button>'; }).join('') +
    '</nav><div class="who"><span class="avatar" aria-hidden="true">' + esc((u.nombre || u.email).slice(0, 2).toUpperCase()) + '</span><span>' + esc(u.nombre || u.email) + ' <span class="muted">· ' + esc(ROLES[u.rol] || '') + '</span></span><button class="btn ghost" type="button" data-act="logout">Salir</button></div></div></div>' +
    '<main class="wrap" id="view">' + main + '</main>';
}
/* Para devolver el foco al mismo control después de redibujar (teclado y lectores de pantalla). */
function focusSel(el) {
  if (!el || el === document.body || !el.closest || !el.closest('#app')) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  var a = [].slice.call(el.attributes).filter(function (x) { return x.name.indexOf('data-') === 0; });
  if (!a.length) return null;
  return el.tagName.toLowerCase() + a.map(function (x) { return '[' + x.name + '="' + CSS.escape(x.value) + '"]'; }).join('');
}
function paint(html) {
  var app = $('#app'), sel = focusSel(document.activeElement);
  app.innerHTML = html;
  if (sel) { var n = app.querySelector(sel); if (n) n.focus({ preventScroll: true }); }
}
function render() {
  if (!configured) { paint(vSetup()); return; }
  if (S.loading) { paint('<div class="loading" role="status">Cargando…</div>'); return; }
  if (S.setpw && S.session) { document.body.removeAttribute('data-role'); document.title = 'Elegir clave · Portal CE'; paint(vSetPw()); return; }
  if (!S.session) { document.body.removeAttribute('data-role'); document.title = 'Ingresar · Portal CE'; paint(vLogin()); return; }
  if (S.needCode) { document.body.removeAttribute('data-role'); document.title = 'Código · Portal CE'; paint(vMfaCode()); return; }
  if (S.needEnroll) { document.body.removeAttribute('data-role'); document.title = 'Segundo factor · Portal CE'; paint(vEnrollGate()); return; }
  if (S.connErr) { paint(vConnErr()); return; }
  if (S.noRole || !S.me) { paint(vNoRole()); return; }
  document.body.dataset.role = uiRole();
  if (!V[S.view] || (S.view === 'miembros' && !isAdmin())) S.view = 'inicio';
  document.title = TITLES[S.view] + ' · Portal CE';
  paint(frame());
}
function keepScroll(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }
/* Cambiar de sección deja una entrada en el historial: el botón Atrás del celular vuelve a la anterior. */
function go(v) {
  S.view = v;
  if (location.hash.slice(1) !== v) history.pushState(null, '', '#' + v);
  render(); window.scrollTo(0, 0);
}
window.addEventListener('popstate', function () { var h = location.hash.slice(1); if (V[h] && S.me) { S.view = h; render(); } });

/* ---------- acciones ---------- */
document.addEventListener('click', async function (e) {
  var b = e.target.closest('button'); if (!b) return;
  var d = b.dataset;
  if (d.ev) { S.ev = d.ev; S.tab = d.go || 'resumen'; S.f = { est: 'todos', rel: 'todos', g: 'todos' }; go('eventos'); return; }
  if (d.v) { go(d.v); return; }
  if (d.tab) { S.tab = d.tab; render(); return; }
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
  if (a === 'logout') { clearAct(); S.err = ''; await sb.auth.signOut(); return; }
  if (a === 'retry') { await boot(S.session); return; }
  if (a === 'forgot') {
    var em = ($('#lm') || {}).value;
    if (!em) { toast('Escribí tu correo y volvé a tocar el botón'); return; }
    await sb.auth.resetPasswordForEmail(em.trim(), { redirectTo: location.origin + location.pathname });
    toast('Si el correo tiene cuenta, te llegará un enlace para elegir una clave nueva.');
    return;
  }
  if (a === 'addtask') {
    var n = $('#tn').value.trim(); if (!n) { toast('Escribí qué hay que hacer'); return; }
    await run(sb.from('tareas').insert({ titulo: n, dia: $('#td').value || null, ad: $('#tad').value || null, prioridad: $('#tp').value }), 'Tarea agregada');
    return;
  }
  if (a === 'addnov') {
    var t = $('#nt').value.trim(); if (!t) { toast('Escribí la novedad'); return; }
    var ad = $('#nad').value; if (!ad) { toast('Elegí un expediente'); return; }
    var f = $('#nf').value || ds(T0), withTask = $('#ntk') && $('#ntk').checked;
    var r1 = await sb.from('novedades').insert({ texto: t, ad: ad, fecha: f, autor: $('#ni').value || S.me.iniciales, qrx: $('#nq').checked });
    if (r1.error) { saveFail(r1); return; }
    if (withTask) {
      var r2 = await sb.from('tareas').insert({ titulo: 'Seguimiento: ' + t.slice(0, 60), dia: f, ad: ad, prioridad: 'media' });
      if (r2.error) { saveFail(r2, 'crear la tarea'); await reload(); return; }
    }
    toast(withTask ? 'Novedad y tarea guardadas' : 'Novedad guardada');
    await reload();
    return;
  }
  if (a === 'mfa-on') {
    /* Si quedó un alta a medias, se descarta antes de empezar otra. */
    var l = await sb.auth.mfa.listFactors();
    var pend = ((l.data && l.data.all) || []).filter(function (x) { return x.factor_type === 'totp' && x.status !== 'verified'; });
    for (var i = 0; i < pend.length; i++) { await sb.auth.mfa.unenroll({ factorId: pend[i].id }); }
    var en = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Portal CE ' + ds(new Date()) + ' ' + Date.now() % 10000 });
    if (en.error) { toast('No se pudo empezar: ' + en.error.message); report('mfa enroll: ' + en.error.message, true); return; }
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
    if (un.error) { toast('No se pudo quitar: ' + un.error.message); return; }
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
    var p1 = $('#np').value, p2 = $('#np2').value;
    if (p1 !== p2) { S.err = 'Las claves no coinciden.'; render(); return; }
    if (p1.length < 12) { S.err = 'La clave debe tener al menos 12 caracteres.'; render(); return; }
    await lock(btn, async function () {
      var u = await sb.auth.updateUser({ password: p1 });
      if (u.error) { S.err = 'No se pudo guardar la clave: ' + u.error.message; render(); return; }
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
      var y3 = window.scrollY; await reload(); window.scrollTo(0, y3);
    }, 'Enviando…');
  }
});
document.addEventListener('input', function (e) {
  var t = e.target; if (!S.cal) return;
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
if (configured) {
  sb.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_OUT') { S.session = null; S.me = null; S.setpw = false; S.needCode = false; S.needEnroll = false; S.enroll = null; S.loading = false; S.aal = 'aal1'; DB = emptyDB(); render(); return; }
    /* Sesión guardada de hace más de 30 minutos sin uso: no se retoma. */
    if (session && !S.fresh && stale()) { setTimeout(idleLogout, 0); return; }
    if (S.fresh && session) { S.fresh = false; touch(); }
    if (event === 'PASSWORD_RECOVERY') S.setpw = true;
    if (event === 'SIGNED_IN' && S.me && session && S.me.id === session.user.id && !S.setpw) return; /* volver a la pestaña no recarga todo */
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
      /* diferido: no se hacen llamadas a Supabase dentro del propio evento */
      setTimeout(function () { boot(session); }, 0);
    }
  });
  var h = (location.hash || '').slice(1); if (V[h]) S.view = h;
} else { S.loading = false; render(); }
})();
