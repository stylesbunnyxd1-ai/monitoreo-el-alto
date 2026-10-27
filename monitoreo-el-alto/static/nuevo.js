// Pantalla 4: formulario de nuevo reporte, con mapa para ubicar y evidencia en foto o video.
const LIMITES = L.latLngBounds([-16.60, -68.28], [-16.43, -68.12]); // El Alto, igual que la base de datos
const CENTRO = [-16.5047, -68.1635];
const PERMITIDOS = ['image/jpeg', 'image/png', 'video/mp4'];
const MAX = 10 * 1024 * 1024;
const $ = s => document.querySelector(s);
let pick = null, tmp = null, mini, miniMk, grande, grandeMk, archivos = [];

const pin = () => L.divIcon({className: '', iconSize: [30, 40], iconAnchor: [15, 40],
  html: '<svg class="pin" viewBox="0 0 24 32" width="30" height="40"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="#e53935"/><circle cx="12" cy="12" r="4.5" fill="#fff"/></svg>'});
const capaOSM = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap contributors'});

function aviso(txt, bueno) {
  const e = $('#aviso');
  e.textContent = txt; e.className = bueno ? 'msg-ok' : 'msg-e'; e.hidden = false;
  e.scrollIntoView({behavior: 'smooth', block: 'center'});
}

async function iniciar() {
  const cat = await (await fetch('/api/catalogos')).json();
  const llenar = (id, lista) => lista.forEach(o => {
    const op = document.createElement('option'); op.value = o.id; op.textContent = o.nombre; $(id).append(op);
  });
  llenar('#tipo', cat.tipos); llenar('#zona', cat.zonas);

  // Mapa pequeño: solo muestra el punto elegido
  mini = L.map('mini', {zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
                        touchZoom: false, boxZoom: false, keyboard: false}).setView(CENTRO, 12);
  capaOSM().addTo(mini);

  $('#desc').oninput = e => $('#cuenta').textContent = e.target.value.length;
  $('#abrir-mapa').onclick = abrirMapa;
  $('#cancelar-ubi').onclick = () => $('#modal').hidden = true;
  $('#confirmar-ubi').onclick = confirmarUbicacion;
  $('#gps').onclick = usarGps;

  // Evidencia: clic o arrastrar
  const drop = $('#drop');
  drop.onclick = () => $('#archivo').click();
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('sobre'); };
  drop.ondragleave = () => drop.classList.remove('sobre');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('sobre'); agregar(e.dataTransfer.files); };
  $('#archivo').onchange = e => { agregar(e.target.files); e.target.value = ''; };
  $('#guardar').onclick = guardar;
}

// ---------- Ubicación ----------
function errUbi(t) { const e = $('#modal-err'); e.textContent = t; e.hidden = !t; }
function abrirMapa() {
  $('#modal').hidden = false; errUbi('');
  if (!grande) {
    grande = L.map('grande', {maxBounds: LIMITES.pad(0.1), maxBoundsViscosity: 1, minZoom: 11}).setView(CENTRO, 13);
    capaOSM().addTo(grande);
    grande.on('click', e => marcar(e.latlng));
  }
  tmp = pick;
  setTimeout(() => { grande.invalidateSize(); if (pick) { grande.setView(pick, 16); ponerMarca(pick); } }, 60);
}
function marcar(ll) {
  if (!LIMITES.contains(ll)) return errUbi('Marca un punto dentro de la ciudad de El Alto.');
  errUbi(''); tmp = ll; ponerMarca(ll);
}
function ponerMarca(ll) { grandeMk ? grandeMk.setLatLng(ll) : grandeMk = L.marker(ll, {icon: pin()}).addTo(grande); }
function usarGps() {
  if (!navigator.geolocation) return errUbi('Tu navegador no permite usar la ubicación.');
  navigator.geolocation.getCurrentPosition(p => {
    const ll = L.latLng(p.coords.latitude, p.coords.longitude);
    if (!LIMITES.contains(ll)) return errUbi('Tu ubicación actual está fuera de El Alto.');
    marcar(ll); grande.setView(ll, 17);
  }, () => errUbi('No se pudo obtener tu ubicación. Marca el punto a mano.'));
}
function confirmarUbicacion() {
  if (!tmp) return errUbi('Haz clic en el mapa para marcar el lugar.');
  pick = tmp; $('#modal').hidden = true;
  miniMk ? miniMk.setLatLng(pick) : miniMk = L.marker(pick, {icon: pin()}).addTo(mini);
  mini.setView(pick, 16);
  $('#coords').textContent = `Ubicación: ${pick.lat.toFixed(5)}, ${pick.lng.toFixed(5)}`;
}

// ---------- Evidencia ----------
function agregar(files) {
  for (const f of files) {
    if (archivos.length >= 5) { aviso('Puedes subir hasta 5 archivos.'); break; }
    if (!PERMITIDOS.includes(f.type)) { aviso(`"${f.name}" no es JPG, PNG ni MP4.`); continue; }
    if (f.size > MAX) { aviso(`"${f.name}" supera los 10 MB.`); continue; }
    archivos.push(f);
  }
  dibujar();
}
function dibujar() {
  $('#arch').innerHTML = '';
  archivos.forEach((f, i) => {
    const d = document.createElement('div'), u = window.URL.createObjectURL(f);
    d.innerHTML = f.type.startsWith('video') ? `<video src="${u}" muted></video>` : `<img src="${u}" alt="Vista previa">`;
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = '×'; b.title = 'Quitar';
    b.onclick = () => { archivos.splice(i, 1); dibujar(); };
    d.append(b); $('#arch').append(d);
  });
}

// ---------- Guardar ----------
async function guardar() {
  const g = document.querySelector('input[name=grav]:checked');
  const d = {tipo_id: $('#tipo').value, zona_id: $('#zona').value, descripcion: $('#desc').value.trim(), gravedad: g && g.value};
  const faltan = [];
  if (!d.tipo_id) faltan.push('el tipo de contaminación');
  if (!d.zona_id) faltan.push('la zona');
  if (d.descripcion.length < 10) faltan.push('una descripción de al menos 10 letras');
  if (!d.gravedad) faltan.push('el nivel de gravedad');
  if (!pick) faltan.push('la ubicación en el mapa');
  if (faltan.length) return aviso('Falta completar: ' + faltan.join(', ') + '.');

  const btn = $('#guardar'); btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const r = await fetch('/api/reportes', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...d, latitud: pick.lat, longitud: pick.lng})});
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
    aviso(fallos ? `Reporte guardado, pero ${fallos} archivo(s) no se pudieron subir.` : 'Reporte guardado. Queda pendiente de verificación.', !fallos);
    setTimeout(() => location.href = '/', fallos ? 3500 : 1600);
  } catch (e) {
    aviso(e.message); btn.disabled = false; btn.textContent = 'Guardar reporte';
  }
}
iniciar();