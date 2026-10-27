// Pantalla 5: detalle de un reporte, con confirmación, aviso de error y actualización en tiempo real.
const ESTADO = {1: '#d98200', 2: '#2e9e4f', 3: '#7a8580', 4: '#fb8c00', 5: '#0f5c4d', 6: '#1e88e5'};
const GRAV = {baja: ['Baja', '#2e9e4f'], media: ['Media', '#d99a00'], alta: ['Alta', '#e53935']};
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esVideo = u => /\.mp4(\?|$)/i.test(u);
let datos = null, mapaDet = null, marca = null, avisoEnviado = false;

const pin = (color, tipo) => pinTipo(color, tipo);

const medio = (url, grande) => esVideo(url)
  ? `<video src="${esc(url)}" ${grande ? 'controls' : 'muted preload="metadata"'}></video>`
  : `<img src="${esc(url)}" alt="Evidencia del reporte">`;

function mostrar(url) {
  $('#principal').innerHTML = medio(url, true);
  $('#principal').dataset.u = url;
  document.querySelectorAll('.evid button').forEach(b => b.classList.toggle('on', b.dataset.u === url));
}
function mensaje(txt, bueno) {
  const e = $('#acc-msg'); e.textContent = txt; e.className = bueno ? 'msg-ok' : 'msg-e'; e.hidden = false;
}

async function cargar() {
  const r = await fetch(`/api/reportes/${RID}`), j = await r.json();
  if (!r.ok) { $('#carga').textContent = j.error || 'No se pudo cargar el reporte.'; return; }
  datos = j; pintar();
}

function pintar() {
  const r = datos;
  $('#carga').hidden = true; $('#cuerpo').hidden = false;

  const b = $('#badge'); b.textContent = r.estados.nombre; b.style.background = ESTADO[r.estado_id]; b.hidden = false;
  $('#d-tipo').textContent = r.tipos_contaminacion.nombre;
  $('#d-zona').textContent = r.zonas.nombre;
  $('#d-desc').textContent = r.descripcion;
  const [gt, gc] = GRAV[r.gravedad];
  $('#d-grav').innerHTML = `<i class="punto" style="background:${gc}"></i><span style="color:${gc};font-weight:500">${gt}</span>`;
  const f = new Date(r.created_at);
  $('#d-fecha').textContent = f.toLocaleDateString('es-BO', {day: '2-digit', month: '2-digit', year: 'numeric'})
    + ' - ' + f.toLocaleTimeString('es-BO', {hour: '2-digit', minute: '2-digit', hour12: false});
  $('#d-ubi').textContent = `${r.latitud}, ${r.longitud}`;
  $('#ver-mapa').href = `/?lat=${r.latitud}&lng=${r.longitud}`;

  // Mapa pequeño con el punto del reporte
  if (!mapaDet) {
    mapaDet = L.map('mapa-det', {zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
                                 touchZoom: false, boxZoom: false, keyboard: false});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap contributors'}).addTo(mapaDet);
  }
  mapaDet.setView([r.latitud, r.longitud], 16); mapaDet.invalidateSize();
  const icono = pin(COLOR_ESTADO[r.estado_id], r.tipos_contaminacion.nombre);
  marca ? marca.setLatLng([r.latitud, r.longitud]).setIcon(icono) : marca = L.marker([r.latitud, r.longitud], {icon: icono}).addTo(mapaDet);

  // Confirmaciones
  const n = r.confirmaciones?.[0]?.count ?? 0;
  $('#d-conf').textContent = n === 0 ? 'Aún nadie ha confirmado este reporte'
    : n === 1 ? '1 persona ha confirmado este reporte' : `${n} personas han confirmado este reporte`;

  // Evidencias
  const urls = (r.evidencias || []).map(e => e.archivo_url);
  if (!urls.length) {
    $('#principal').innerHTML = 'Este reporte no tiene evidencia'; $('#principal').dataset.u = '';
    $('#evid').innerHTML = '<p class="mu">Sin evidencias.</p>';
  } else {
    $('#evid').innerHTML = urls.map(u => `<button type="button" data-u="${esc(u)}">${medio(u, false)}</button>`).join('');
    document.querySelectorAll('.evid button').forEach(btn => btn.onclick = () => mostrar(btn.dataset.u));
    const actual = $('#principal').dataset.u;
    mostrar(urls.includes(actual) ? actual : urls[0]);
  }

  // Botones según quién mira
  const bc = $('#b-conf'), be = $('#b-err');
  bc.textContent = 'Confirmar'; bc.disabled = false; be.disabled = avisoEnviado; $('#acc-nota').textContent = '';
  if (r.es_autor) {
    bc.disabled = be.disabled = true;
    $('#acc-nota').textContent = 'Este es tu reporte: no puedes confirmarlo ni denunciarlo.';
  } else if (r.ya_confirmo) {
    bc.textContent = 'Ya confirmaste';
  }
  if (avisoEnviado) $('#acc-nota').textContent = 'Tu aviso sobre este reporte ya fue enviado.';
}

// ---------- Confirmar (ventana de la pantalla 7) ----------
function abrirConfirmar() {
  if (!CFG.user) return location.href = '/acceso';
  const r = datos, urls = (r.evidencias || []).map(e => e.archivo_url);
  $('#c-img').innerHTML = urls.length ? medio(urls[0], false) : 'Sin foto';
  $('#c-titulo').textContent = `#${r.id} - ${r.tipos_contaminacion.nombre}`;
  $('#c-zona').textContent = r.zonas.nombre;
  const f = new Date(r.created_at);
  $('#c-fecha').textContent = f.toLocaleDateString('es-BO', {day: '2-digit', month: '2-digit', year: 'numeric'})
    + ' - ' + f.toLocaleTimeString('es-BO', {hour: '2-digit', minute: '2-digit', hour12: false});
  $('#c-alerta-txt').textContent = r.ya_confirmo
    ? 'Ya confirmaste este reporte. Solo puedes confirmar una vez por reporte.'
    : 'Solo puedes confirmar una vez por reporte.';
  $('#c-ok').disabled = r.ya_confirmo;
  $('#c-err').hidden = true;
  $('#m-conf').hidden = false;
}
const cerrarConfirmar = () => $('#m-conf').hidden = true;

$('#b-conf').onclick = abrirConfirmar;
$('#c-x').onclick = cerrarConfirmar;
$('#c-cancel').onclick = cerrarConfirmar;
$('#m-conf').onclick = e => { if (e.target.id === 'm-conf') cerrarConfirmar(); };  // clic fuera de la ventana
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarConfirmar(); });

// ---------- Reportar un error ----------
function abrirError() {
  if (!CFG.user) return location.href = '/acceso';
  $('#e-tipo').value = '';
  $('#e-det').value = '';
  $('#e-msg').hidden = true;
  $('#m-error').hidden = false;
  $('#e-tipo').focus();
}

const cerrarError = () => $('#m-error').hidden = true;

$('#b-err').onclick = abrirError;
$('#e-cancel').onclick = cerrarError;
$('#m-error').onclick = e => { if (e.target.id === 'm-error') cerrarError(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarError(); });

$('#e-enviar').onclick = async () => {
  const boton = $('#e-enviar'), em = $('#e-msg');
  const tipo = $('#e-tipo').value;
  if (!tipo) {
    em.textContent = 'Selecciona qué problema tiene el reporte.';
    em.hidden = false;
    return;
  }

  boton.disabled = true;
  try {
    const r = await fetch(`/api/reportes/${RID}/error`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({tipo, detalle: $('#e-det').value.trim()})
    });
    if (r.status === 401) return location.href = '/acceso';
    const j = await r.json();
    if (!r.ok) {
      em.textContent = j.error || 'No se pudo enviar el aviso.';
      em.hidden = false;
      return;
    }

    avisoEnviado = true;
    cerrarError();
    $('#b-err').disabled = true;
    $('#acc-nota').textContent = 'Gracias. Tu aviso fue enviado al administrador.';
    mensaje('Gracias. Tu aviso fue enviado al administrador.', true);
  } catch (e) {
    em.textContent = 'No se pudo enviar el aviso. Inténtalo de nuevo.';
    em.hidden = false;
  } finally {
    boton.disabled = false;
  }
};

$('#c-ok').onclick = async () => {
  const b = $('#c-ok'), em = $('#c-err');
  b.disabled = true;
  const r = await fetch(`/api/reportes/${RID}/confirmar`, {method: 'POST'});
  if (r.status === 401) return location.href = '/acceso';
  const j = await r.json();
  if (!r.ok) { em.textContent = j.error; em.hidden = false; b.disabled = false; return; }
  cerrarConfirmar();
  mensaje('Gracias. Tu confirmación quedó registrada.', true);
  cargar();
};

// ---------- Tiempo real: el detalle se actualiza solo ----------
function realtime() {
  const rt = supabase.createClient(CFG.url, CFG.key);
  rt.channel('detalle-' + RID)
    .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'confirmaciones', filter: `reporte_id=eq.${RID}`}, cargar)
    .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'reportes_ambientales', filter: `id=eq.${RID}`}, cargar)
    .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'evidencias', filter: `reporte_id=eq.${RID}`}, cargar)
    .subscribe();
}
cargar(); realtime();