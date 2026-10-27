// Pantalla 11: mapa en tiempo real. Los reportes nuevos aparecen solos, con una pequeña animación.
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
let mapa, capa, conocidos = null;

const gota = (color, w, h) => `<svg viewBox="0 0 24 32" width="${w}" height="${h}"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${color}"/><circle cx="12" cy="12" r="4.5" fill="#fff"/></svg>`;

const pin = (color, tipo, nuevo) => pinTipo(color, tipo, nuevo);

const popup = r => `<div class="pop"><b>${esc(r.tipos_contaminacion.nombre)}</b>
  <span>${esc(r.zonas.nombre)} · Gravedad ${esc(r.gravedad)}</span>
  <em style="background:${ESTADOS[r.estado_id].c}">${ESTADOS[r.estado_id].n}</em>
  <p>${esc(r.descripcion.slice(0, 110))}</p><a href="/reporte/${r.id}">Ver detalle</a></div>`;

function iniciar() {
  $('#ley').innerHTML = [1, 2, 4, 5, 6].map(id =>
    `<div>${gota(ESTADOS[id].c, 16, 22)}<span>${ESTADOS[id].n}</span></div>`).join('');

  mapa = L.map('mapa', {zoomControl: false}).setView([-16.5047, -68.1635], 13);
  L.control.zoom({position: 'topleft'}).addTo(mapa);
  L.control.scale({position: 'bottomright', imperial: false}).addTo(mapa);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {maxZoom: 19, attribution: '© OpenStreetMap contributors'}).addTo(mapa);
  capa = L.layerGroup().addTo(mapa);
  cargar();
  realtime();
  setInterval(cargar, 30000);   // respaldo por si se pierde la conexión en vivo
}

async function cargar() {
  const r = await fetch('/api/reportes');
  if (!r.ok) return;
  const lista = (await r.json()).filter(x => x.estado_id !== 3);   // los rechazados no se muestran
  capa.clearLayers();
  lista.forEach(x => {
    const nuevo = conocidos && !conocidos.has(x.id);
    L.marker([x.latitud, x.longitud], {icon: pin(ESTADOS[x.estado_id].c, x.tipos_contaminacion.nombre, nuevo)})
      .bindPopup(popup(x)).addTo(capa);
  });
  conocidos = new Set(lista.map(x => x.id));
}

function aviso(txt) {
  $('#rt-txt').textContent = txt; $('#rt').hidden = false;
  clearTimeout(aviso.h); aviso.h = setTimeout(() => $('#rt').hidden = true, 5000);
}

function realtime() {
  const rt = supabase.createClient(CFG.url, CFG.key);
  rt.channel('mapa-tiempo-real')
    .on('postgres_changes', {event: '*', schema: 'public', table: 'reportes_ambientales'}, p => {
      if (p.eventType === 'INSERT' && p.new && p.new.latitud) {
        aviso('Nuevo reporte en tiempo real');
        mapa.panTo([p.new.latitud, p.new.longitud]);
      } else {
        aviso('Un reporte cambió de estado');
      }
      cargar();
    })
    .subscribe();
}
iniciar();