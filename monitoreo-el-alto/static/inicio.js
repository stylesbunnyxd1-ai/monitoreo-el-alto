// Pantalla 1: mapa público con filtros, buscador y actualización en tiempo real.
const ESTADOS = {
  1: {n: 'Reportado',   c: '#e53935'},
  2: {n: 'Confirmado',  c: '#2e9e4f'},
  3: {n: 'Rechazado',   c: '#7a8580'},
  4: {n: 'Prioritario', c: '#fb8c00'},
  5: {n: 'En atención', c: '#0f5c4d'},
  6: {n: 'Solucionado', c: '#1e88e5'},
};
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mapa, capa, datos = [];

async function api(url) {
  const r = await fetch(url), j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
}

// Pin con forma de gota, del color del estado
const pin = (color, tipo) => pinTipo(color, tipo);

const popup = r => `<div class="pop"><b>${esc(r.tipos_contaminacion.nombre)}</b>
  <span>${esc(r.zonas.nombre)} · Gravedad ${esc(r.gravedad)}</span>
  <em style="background:${ESTADOS[r.estado_id].c}">${ESTADOS[r.estado_id].n}</em>
  <p>${esc(r.descripcion.slice(0, 110))}</p><a href="/reporte/${r.id}">Ver detalle</a></div>`;

async function iniciar() {
  const cat = await api('/api/catalogos');
  const llenar = (id, lista, texto) => lista.forEach(o => $(id).insertAdjacentHTML('beforeend', `<option value="${o.id}">${esc(texto(o))}</option>`));
  llenar('#f-tipo', cat.tipos, o => o.nombre);
  llenar('#f-zona', cat.zonas, o => o.nombre);
  llenar('#f-estado', cat.estados.filter(e => e.id !== 3), o => ESTADOS[o.id].n);

  $('#leyenda').innerHTML = [1, 2, 4, 5, 6].map(id =>
    `<span><i style="background:radial-gradient(circle,#fff 0 30%,${ESTADOS[id].c} 33%)"></i>${ESTADOS[id].n}</span>`).join('');

  mapa = L.map('mapa', {zoomControl: false}).setView([-16.5047, -68.1635], 13);
  L.control.zoom({position: 'bottomleft'}).addTo(mapa);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap contributors'}).addTo(mapa);
  capa = L.layerGroup().addTo(mapa);
  if (CFG.user) iniciarNuevo(cat);

    // Si llegas desde "Ver en el mapa", el mapa se centra en ese reporte
  const q = new URLSearchParams(location.search);
  if (q.get('lat')) mapa.setView([+q.get('lat'), +q.get('lng')], 17);

  $('#aplicar').onclick = cargar;
  $('#buscar').oninput = pintar;
  await cargar();
  realtime();
}

async function cargar() {
  const p = new URLSearchParams();
  [['tipo_id', '#f-tipo'], ['zona_id', '#f-zona'], ['estado_id', '#f-estado'], ['gravedad', '#f-grav']]
    .forEach(([k, s]) => $(s).value && p.set(k, $(s).value));
  datos = (await api('/api/reportes?' + p)).filter(r => r.estado_id !== 3);
  pintar();
}

function pintar() {
  const q = $('#buscar').value.trim().toLowerCase();
  const lista = !q ? datos : datos.filter(r =>
    [r.descripcion, r.tipos_contaminacion.nombre, r.zonas.nombre].join(' ').toLowerCase().includes(q));
  capa.clearLayers();
  lista.forEach(r => L.marker([r.latitud, r.longitud], {icon: pin(ESTADOS[r.estado_id].c, r.tipos_contaminacion.nombre)}).bindPopup(popup(r)).addTo(capa));
}

// Tiempo real: Supabase avisa cuando cambia la tabla y el mapa se actualiza solo.
function aviso(txt) {
  $('#rt-txt').textContent = txt; $('#rt').hidden = false;
  clearTimeout(aviso.h); aviso.h = setTimeout(() => $('#rt').hidden = true, 5000);
}
function realtime() {
  const rt = supabase.createClient(CFG.url, CFG.key);
  rt.channel('mapa-publico')
    .on('postgres_changes', {event: '*', schema: 'public', table: 'reportes_ambientales'}, p => {
      aviso(p.eventType === 'INSERT' ? 'Nuevo reporte en tiempo real' : 'Un reporte cambió de estado');
      cargar();
    })
    .subscribe();
}
// ---------- Nuevo reporte: panel lateral derecho ----------
const LIMITES = L.latLngBounds([-16.60, -68.28], [-16.43, -68.12]); // El Alto, igual que la base de datos
const PERMITIDOS = ['image/jpeg', 'image/png', 'video/mp4'];
const MAX_BYTES = 10 * 1024 * 1024;
let abierto = false, punto = null, marcaNueva = null, archivos = [], zonaManual = false, relojZona = null;
const tipoElegido = () => { const s = $('#n-tipo'); return s.value ? s.options[s.selectedIndex].text : ''; };

function drAviso(txt, bueno) {
  const e = $('#dr-aviso');
  if (!txt) { e.hidden = true; return; }
  e.textContent = txt; e.className = bueno ? 'msg-ok' : 'msg-e'; e.hidden = false;
  $('.dr-cuerpo').scrollTo({top: 0, behavior: 'smooth'});
}

function iniciarNuevo(cat) {
  if (!$('#drawer') || !$('#btn-nuevo')) return;
  const llenar = (id, lista) => lista.forEach(o =>
    $(id).insertAdjacentHTML('beforeend', `<option value="${o.id}">${esc(o.nombre)}</option>`));
  llenar('#n-tipo', cat.tipos);
  cat.zonas.forEach(z => $('#lista-zonas').insertAdjacentHTML('beforeend', `<option value="${esc(z.nombre)}"></option>`));
  $('#n-zona').oninput = () => { zonaManual = true; $('#n-zona-nota').hidden = true; };

  $('#btn-nuevo').onclick = abrirNuevo;
  $('#dr-x').onclick = cerrarNuevo;
  $('#dr-cancelar').onclick = cerrarNuevo;
  $('#n-desc').oninput = e => $('#n-cuenta').textContent = e.target.value.length;
  $('#n-gps').onclick = usarGps;
  $('#n-tipo').onchange = () => marcaNueva && marcaNueva.setIcon(pin('#e53935', tipoElegido()));
  $('#n-guardar').onclick = guardarNuevo;
  mapa.on('click', e => { if (abierto) marcar(e.latlng); });

  // Evidencia: clic o arrastrar
  const drop = $('#n-drop');
  drop.onclick = () => $('#n-archivo').click();
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('sobre'); };
  drop.ondragleave = () => drop.classList.remove('sobre');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('sobre'); agregar(e.dataTransfer.files); };
  $('#n-archivo').onchange = e => { agregar(e.target.files); e.target.value = ''; };

  // Llegaste desde otra pantalla con "+ Nuevo reporte"
  if (new URLSearchParams(location.search).get('nuevo')) abrirNuevo();
}

function abrirNuevo() {
  abierto = true;
  $('#drawer').hidden = false;
  document.querySelector('.mapa-wrap').classList.add('con-drawer');
  $('#mapa').classList.add('pick');
  mapa.closePopup();
}

function cerrarNuevo() {
  abierto = false;
  $('#drawer').hidden = true;
  document.querySelector('.mapa-wrap').classList.remove('con-drawer');
  $('#mapa').classList.remove('pick');
  // Se limpia todo para el próximo reporte
  if (marcaNueva) { mapa.removeLayer(marcaNueva); marcaNueva = null; }
  punto = null; archivos = []; dibujar();
  ['#n-tipo', '#n-zona', '#n-desc'].forEach(s => $(s).value = '');
  document.querySelectorAll('input[name=n-grav]').forEach(r => r.checked = false);
  $('#n-cuenta').textContent = '0';
  $('#n-ubi').textContent = 'Haz clic en el mapa para marcar el punto.';
    $('#n-ubi').classList.remove('ok');
  zonaManual = false; clearTimeout(relojZona); $('#n-zona-nota').hidden = true;
  drAviso('');
  const b = $('#n-guardar'); b.disabled = false; b.textContent = 'Guardar reporte';
}

function marcar(ll) {
  if (!LIMITES.contains(ll)) return drAviso('Marca un punto dentro de la ciudad de El Alto.');
  drAviso(''); punto = ll;
  marcaNueva ? marcaNueva.setLatLng(ll) : marcaNueva = L.marker(ll, {icon: pin('#e53935', tipoElegido()), zIndexOffset: 1000}).addTo(mapa);
  $('#n-ubi').textContent = `Ubicación: ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
  $('#n-ubi').classList.add('ok');
  sugerirZona(ll);
}

function usarGps() {
  if (!navigator.geolocation) return drAviso('Tu navegador no permite usar la ubicación.');
  navigator.geolocation.getCurrentPosition(p => {
    const ll = L.latLng(p.coords.latitude, p.coords.longitude);
    if (!LIMITES.contains(ll)) return drAviso('Tu ubicación actual está fuera de El Alto.');
    marcar(ll); mapa.setView(ll, 17);
  }, () => drAviso('No se pudo obtener tu ubicación. Marca el punto a mano en el mapa.'));
}

// Pregunta al servidor en qué zona cae el punto. Es solo una sugerencia: si ya escribiste una, no la pisa.
function sugerirZona(ll) {
  clearTimeout(relojZona);
  relojZona = setTimeout(async () => {
    if (zonaManual) return;
    try {
      const j = await (await fetch(`/api/zona-sugerida?lat=${ll.lat}&lng=${ll.lng}`)).json();
      if (zonaManual || !punto || !j.zona) return;
      $('#n-zona').value = j.zona;
      const n = $('#n-zona-nota'); n.textContent = 'Sugerida según el mapa. Puedes cambiarla o escribir otra.'; n.hidden = false;
    } catch (e) { /* sin conexión: se escribe a mano */ }
  }, 700);
}

// ---------- Evidencia ----------
function agregar(files) {
  for (const f of files) {
    if (archivos.length >= 5) { drAviso('Puedes subir hasta 5 archivos.'); break; }
    if (!PERMITIDOS.includes(f.type)) { drAviso(`"${f.name}" no es JPG, PNG ni MP4.`); continue; }
    if (f.size > MAX_BYTES) { drAviso(`"${f.name}" supera los 10 MB.`); continue; }
    archivos.push(f);
  }
  dibujar();
}

function dibujar() {
  $('#n-arch').innerHTML = '';
  archivos.forEach((f, i) => {
    const d = document.createElement('div'), u = window.URL.createObjectURL(f);
    d.innerHTML = f.type.startsWith('video') ? `<video src="${u}" muted></video>` : `<img src="${u}" alt="Vista previa">`;
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = '×'; b.title = 'Quitar';
    b.onclick = () => { archivos.splice(i, 1); dibujar(); };
    d.append(b); $('#n-arch').append(d);
  });
}

// ---------- Guardar ----------
async function guardarNuevo() {
  const g = document.querySelector('input[name=n-grav]:checked');
  const d = {tipo_id: $('#n-tipo').value, zona: $('#n-zona').value.trim(), descripcion: $('#n-desc').value.trim(), gravedad: g && g.value};
  const faltan = [];
  if (!d.tipo_id) faltan.push('el tipo de contaminación');
  if (d.zona.length < 3) faltan.push('la zona (mínimo 3 letras)');
  if (!d.gravedad) faltan.push('el nivel de gravedad');
  if (d.descripcion.length < 10) faltan.push('una descripción de al menos 10 letras');
  if (!punto) faltan.push('la ubicación (clic en el mapa)');
  if (faltan.length) return drAviso('Falta completar: ' + faltan.join(', ') + '.');

  const btn = $('#n-guardar'); btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const r = await fetch('/api/reportes', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...d, latitud: punto.lat, longitud: punto.lng})});
    if (r.status === 401) return location.href = '/acceso';
    const rep = await r.json();
    if (!r.ok) throw new Error(rep.error || 'No se pudo guardar el reporte');

    let fallos = 0;
    for (const [i, f] of archivos.entries()) {
      btn.textContent = `Subiendo evidencia ${i + 1} de ${archivos.length}...`;
      const fd = new FormData(); fd.append('archivo', f);
      const u = await fetch(`/api/reportes/${rep.id}/evidencia`, {method: 'POST', body: fd});
      if (!u.ok) fallos++;
    }
    const donde = punto;
    cerrarNuevo();
    mapa.setView(donde, 16);
    aviso(fallos ? `Reporte guardado, pero ${fallos} archivo(s) no se pudieron subir.` : 'Reporte guardado. Queda pendiente de verificación.');
    await cargar();
  } catch (e) {
    drAviso(e.message); btn.disabled = false; btn.textContent = 'Guardar reporte';
  }
}
iniciar();