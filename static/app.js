// Mapa + filtros + formulario + Realtime. Los datos siempre llegan por la API de Flask.
const COLOR = {1:'#8a8f98',2:'#e03e3e',3:'#444',4:'#7b1fa2',5:'#f59e0b',6:'#2e7d32'};
const ICONO = {1:'🗑️',2:'💧',3:'🪧',4:'🔥',5:'🧱',6:'🚧',7:'⚠️'};
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let cat = {}, datos = [], capa, mapa, pick = null, pickMk = null, form = {tipo: null, grav: null};

async function api(url, opt) {
  const r = await fetch(url, opt && {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(opt)});
  const j = await r.json();
  if (r.status === 401) location.href = '/acceso';
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
}
function toast(titulo, txt) {
  const t = $('#toast'); t.innerHTML = `<b>${esc(titulo)}</b>${esc(txt || '')}`; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 4500);
}
function vista(v) { for (const x of ['lista', 'detalle', 'form']) $('#v-' + x).hidden = x !== v; }
const chip = (id, txt) => `<span class="chip" style="background:${COLOR[id]}">${esc(txt)}</span>`;
const fecha = d => new Date(d).toLocaleString('es-BO', {dateStyle: 'short', timeStyle: 'short'});
const conf = r => r.confirmaciones?.[0]?.count ?? 0;

async function iniciar() {
  cat = await api('/api/catalogos');
  const llenar = (id, lista) => lista.forEach(o => $(id).insertAdjacentHTML('beforeend', `<option value="${o.id}">${esc(o.nombre)}</option>`));
  llenar('#f-tipo', cat.tipos); llenar('#f-zona', cat.zonas); llenar('#f-estado', cat.estados); llenar('#n-zona', cat.zonas);
  $('#f-cats').innerHTML = cat.tipos.map(t => `<button data-t="${t.id}"><span>${ICONO[t.id] || '⚠️'}</span>${esc(t.nombre.split(' ')[0])}</button>`).join('');
  mapa = L.map('map').setView([-16.5047, -68.1635], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap contributors'}).addTo(mapa);
  capa = L.layerGroup().addTo(mapa);
  mapa.on('click', e => {
    if ($('#v-form').hidden) return;
    pick = e.latlng; if (pickMk) pickMk.remove(); pickMk = L.marker(pick).addTo(mapa);
    $('#ubic').textContent = `📍 ${pick.lat.toFixed(5)}, ${pick.lng.toFixed(5)}`;
  });
  ['#f-tipo', '#f-zona', '#f-estado', '#f-grav', '#f-desde'].forEach(s => $(s).onchange = cargar);
  $('#f-cats').onclick = e => { const b = e.target.closest('button'); if (!b) return; form.tipo = b.dataset.t; [...$('#f-cats').children].forEach(x => x.classList.toggle('on', x === b)); };
  document.querySelector('.grav').onclick = e => { const b = e.target.closest('button'); if (!b) return; form.grav = b.dataset.g; [...b.parentNode.children].forEach(x => x.classList.toggle('on', x === b)); };
  $('#n-desc').oninput = e => $('#cnt').textContent = e.target.value.length;
  $('#fab').onclick = () => CFG.user ? vista('form') : location.href = '/acceso';
  $('#enviar-rep').onclick = enviar;
  if ($('#nav-pend')) $('#nav-pend').onclick = e => { e.preventDefault(); $('#f-estado').value = '1'; cargar(); vista('lista'); };

  $('#n-fotos').onchange = e => {
  const fs = [...e.target.files].slice(0, 5);
  $('#prev').innerHTML = fs.map(f => `<img src="${URL.createObjectURL(f)}" alt="Vista previa">`).join('');
};
  await Promise.all([cargar(), estadisticas()]);
  realtime();
}

async function cargar() {
  const p = new URLSearchParams();
  [['tipo_id', '#f-tipo'], ['zona_id', '#f-zona'], ['estado_id', '#f-estado'], ['gravedad', '#f-grav'], ['desde', '#f-desde']]
    .forEach(([k, s]) => $(s).value && p.set(k, $(s).value));
  datos = await api('/api/reportes?' + p);
  pintar();
}

function pintar() {
  capa.clearLayers();
  datos.forEach(r => L.marker([r.latitud, r.longitud], {icon: L.divIcon({className: '', iconSize: [34, 34], iconAnchor: [17, 17],
    html: `<div class="pin" style="background:${COLOR[r.estado_id]}">${ICONO[r.tipo_id] || '⚠️'}</div>`})}).on('click', () => detalle(r.id)).addTo(capa));
  const n = id => datos.filter(r => r.estado_id === id).length;
  $('#cards').innerHTML = [['Total de reportes', datos.length], ['Pendientes', n(1)], ['En atención', n(5) + n(4)], ['Solucionados', n(6)]]
    .map(([t, v]) => `<div class="card"><small>${t}</small><b>${v}</b></div>`).join('');
  $('#leyenda').innerHTML = cat.estados.filter(e => e.id !== 3).map(e => `<span><i style="background:${COLOR[e.id]}"></i>${esc(e.nombre)}: ${n(e.id)}</span>`).join('');
  $('#n').textContent = `(${datos.length})`;
  if ($('#badge') && !$('#f-estado').value) $('#badge').textContent = n(1) || '';
  $('#lista').innerHTML = datos.map(r => `<div class="item" onclick="detalle(${r.id})">
    ${chip(r.estado_id, r.estados.nombre)}${chip({baja: 6, media: 5, alta: 2}[r.gravedad], r.gravedad)}
    <p><b>${ICONO[r.tipo_id] || ''} ${esc(r.tipos_contaminacion.nombre)}</b> · ${esc(r.zonas.nombre)}</p>
    <p>${esc(r.descripcion.slice(0, 90))}</p></div>`).join('') || '<p class="mu">Aún no hay reportes con estos filtros.</p>';
}

function detalle(id) {
  const r = datos.find(x => x.id === id); if (!r) return;
  mapa.setView([r.latitud, r.longitud], 15);
  const admin = CFG.rol === 'admin';
  const nombreEstado = eid => (cat.estados.find(e => e.id === eid) || {}).nombre || '';
  const hist = [...(r.seguimientos || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  $('#v-detalle').innerHTML = `<button class="link" onclick="vista('lista')">← Volver</button><h3>Detalle del reporte #${r.id}</h3>
    ${r.estado_id === 1 ? '<div class="aviso">⏳ Pendiente de verificación: todavía no fue revisado por el administrador.</div>' : ''}
    ${r.estado_id === 3 ? '<div class="aviso rojo">❌ Este reporte fue rechazado.</div>' : ''}
    <table><tr><td>Tipo</td><td>${esc(r.tipos_contaminacion.nombre)}</td></tr>
    <tr><td>Estado</td><td>${chip(r.estado_id, r.estados.nombre)}</td></tr>
    <tr><td>Gravedad</td><td>${esc(r.gravedad)}</td></tr><tr><td>Zona</td><td>${esc(r.zonas.nombre)}</td></tr>
    <tr><td>Fecha</td><td>${fecha(r.created_at)}</td></tr><tr><td>Confirmaciones</td><td>👍 ${conf(r)}</td></tr>
    <tr><td>Coordenadas</td><td>${r.latitud}, ${r.longitud}</td></tr></table>
    ${(r.evidencias || []).length ? `<div class="fotos">${r.evidencias.map(e => `<a href="${esc(e.archivo_url)}" target="_blank"><img src="${esc(e.archivo_url)}" alt="Evidencia"></a>`).join('')}</div>` : '<p class="mu">Este reporte no tiene fotos.</p>'}
    <p>${esc(r.descripcion)}</p>
    <button class="btn" onclick="confirmar(${r.id})">👍 Yo también lo vi</button>
    <label>Historial de seguimiento</label>
    <div class="hist">${hist.map(h => `<div><b>${esc(nombreEstado(h.estado_id))}</b> · ${fecha(h.created_at)}${h.observacion ? `<br><small>${esc(h.observacion)}</small>` : ''}</div>`).join('') || '<p class="mu">Sin movimientos.</p>'}</div>
    ${admin ? `<label>Verificación (administrador)</label>
      <textarea id="obs" placeholder="Motivo u observación (obligatorio al rechazar)"></textarea>
      <div class="grav"><button onclick="decidir(${r.id},2)">✅ Confirmar</button><button onclick="decidir(${r.id},3)">❌ Rechazar</button></div>
      <label>Otro estado de seguimiento</label>
      <select id="ne">${cat.estados.filter(e => e.id > 3).map(e => `<option value="${e.id}" ${e.id === r.estado_id ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select>
      <button class="btn sec" onclick="decidir(${r.id},$('#ne').value)">Guardar estado</button>` : ''}`;
  vista('detalle');
}

async function confirmar(id) {
  if (!CFG.user) return location.href = '/acceso';
  try { await api(`/api/reportes/${id}/confirmar`, {}); toast('Confirmación registrada'); } catch (e) { toast('No se pudo confirmar', e.message); }
}
async function decidir(id, estado) {
  try {
    await api(`/api/reportes/${id}/estado`, {estado_id: estado, observacion: ($('#obs') || {}).value || ''});
    toast('Estado actualizado');
    await cargar(); vista('lista');
  } catch (e) { toast('No se pudo cambiar', e.message); }
}

async function enviar() {
  const d = {tipo_id: form.tipo, gravedad: form.grav, zona_id: $('#n-zona').value, descripcion: $('#n-desc').value};
  if (!d.tipo_id || !d.gravedad || d.descripcion.trim().length < 10 || !pick) { $('#err').textContent = 'Elige categoría y gravedad, escribe al menos 10 caracteres y marca el lugar en el mapa.'; return; }
  const fotos = [...$('#n-fotos').files].slice(0, 5);
  try {
    $('#enviar-rep').disabled = true;
    const rep = await api('/api/reportes', {...d, latitud: pick.lat, longitud: pick.lng});
    for (const f of fotos) {
      const fd = new FormData(); fd.append('foto', f);
      const r = await fetch(`/api/reportes/${rep.id}/evidencia`, {method: 'POST', body: fd});
      if (!r.ok) toast('Una foto no se subió', (await r.json()).error);
    }
    $('#err').textContent = ''; $('#n-desc').value = ''; $('#cnt').textContent = 0;
    $('#n-fotos').value = ''; $('#prev').innerHTML = '';
    pick = null; if (pickMk) pickMk.remove();
    $('#ubic').textContent = '📍 Haz clic en el mapa para marcar el lugar'; vista('lista');
  } catch (e) { $('#err').textContent = e.message; }
  finally { $('#enviar-rep').disabled = false; }
}

async function estadisticas() {
  const s = await api('/api/stats'), max = Math.max(1, ...s.tipos.map(x => x[1]), ...s.zonas.map(x => x[1]));
  const barras = l => l.map(([n, v]) => `<div class="bar"><span>${esc(n)}</span><div style="width:${v / max * 55}%"></div><b>${v}</b></div>`).join('') || '<p class="mu">Sin datos todavía.</p>';
  $('#s-tipos').innerHTML = barras(s.tipos); $('#s-zonas').innerHTML = barras(s.zonas);
}

// Realtime: Supabase avisa cuando cambian las tablas y se refresca la vista sin recargar la página.
function realtime() {
  const rt = supabase.createClient(CFG.url, CFG.key);
  const refrescar = () => { cargar(); estadisticas(); };
  rt.channel('cambios')
    .on('postgres_changes', {event: '*', schema: 'public', table: 'reportes_ambientales'}, p => {
      toast(p.eventType === 'INSERT' ? 'Nuevo reporte' : 'Reporte actualizado', p.eventType === 'INSERT' ? 'Alguien registró un foco de contaminación' : 'Cambió el estado de un reporte'); refrescar(); })
    .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'confirmaciones'}, () => { toast('Nueva confirmación', 'Un vecino confirmó un reporte'); refrescar(); })
        .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'evidencias'}, refrescar)
    .subscribe();
}
iniciar();