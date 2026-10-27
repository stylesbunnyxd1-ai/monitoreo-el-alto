// Pantalla 9: estadísticas. Los números vienen de /api/estadisticas (consultas en Python sobre Supabase).
const NOM = {1: 'Reportado', 2: 'Confirmado', 4: 'Prioritario', 5: 'En atención', 6: 'Solucionado'};
const COL = {1: '#e53935', 2: '#2e9e4f', 4: '#fb8c00', 5: '#0f5c4d', 6: '#1e88e5'};
const NIVEL = {alta: '#e53935', media: '#f5a623', baja: '#2e9e4f'};
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mapa = null, capa = null;

async function cargar() {
  const r = await fetch('/api/estadisticas');
  if (!r.ok) { $('#hall').innerHTML = '<li>No se pudieron cargar las estadísticas.</li>'; return; }
  const d = await r.json();
  tarjetas(d); barras(d); dona(d); zonas(d); frecuentes(d); hallazgos(d);
}

function tarjetas(d) {
  $('#k-total').textContent = d.total;
  $('#k-conf').textContent = d.estados[2] || 0;
  $('#k-aten').textContent = d.estados[5] || 0;
  $('#k-sol').textContent = d.estados[6] || 0;
}

function barras(d) {
  if (!d.tipos.length) { $('#barras').innerHTML = '<p class="mu">Aún no hay reportes.</p>'; return; }
  const max = Math.max(...d.tipos.map(t => t.n));
  $('#barras').innerHTML = d.tipos.map(t => `<div class="col-b">
    <div class="zona-b"><span class="n">${t.n}</span><div class="b" style="height:${t.n / max * 82}%"></div></div>
    <div class="t">${esc(t.nombre)}</div></div>`).join('');
}

function dona(d) {
  const ids = [2, 5, 4, 6, 1].filter(i => d.estados[i]);
  const R = 42, C = 2 * Math.PI * R;
  let acum = 0, h = `<circle cx="60" cy="60" r="${R}" fill="none" stroke="#e6ecea" stroke-width="18"/>`;
  ids.forEach(i => {
    const largo = d.estados[i] / d.total * C;
    h += `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${COL[i]}" stroke-width="18"
      stroke-dasharray="${largo} ${C - largo}" stroke-dashoffset="${-acum}" transform="rotate(-90 60 60)"/>`;
    acum += largo;
  });
  $('#dona').innerHTML = h;
  $('#dona-ley').innerHTML = ids.map(i =>
    `<div><i style="background:${COL[i]}"></i><b>${(d.estados[i] / d.total * 100).toFixed(1)}%</b> ${NOM[i]}</div>`).join('')
    || '<p class="mu">Sin datos.</p>';
}

function zonas(d) {
  if (!mapa) {
    mapa = L.map('mapa-z', {zoomControl: false, scrollWheelZoom: false}).setView([-16.5047, -68.1635], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap contributors'}).addTo(mapa);
    capa = L.layerGroup().addTo(mapa);
  }
  capa.clearLayers();
  d.zonas.forEach(z => L.circle([z.lat, z.lng], {radius: Math.min(1500, 350 + z.n * 150), color: NIVEL[z.nivel],
    fillColor: NIVEL[z.nivel], fillOpacity: .35, weight: 2})
    .bindPopup(`<b>${esc(z.nombre)}</b><br>${z.n} reporte${z.n === 1 ? '' : 's'} · gravedad ${z.nivel}`).addTo(capa));
  if (d.zonas.length) mapa.fitBounds(L.latLngBounds(d.zonas.map(z => [z.lat, z.lng])).pad(0.5), {maxZoom: 14});
  setTimeout(() => mapa.invalidateSize(), 100);
}

function frecuentes(d) {
  if (!d.tipos.length) { $('#top').innerHTML = '<p class="mu">Aún no hay reportes.</p>'; return; }
  const pc = n => Math.round(n / d.total * 100) + '%';
  const primeros = d.tipos.slice(0, 3), resto = d.tipos.slice(3).reduce((s, t) => s + t.n, 0);
  $('#top').innerHTML = primeros.map(t => `<div class="top-fila"><span>${esc(t.nombre)}</span><b>${pc(t.n)}</b></div>`).join('')
    + (resto ? `<div class="top-fila"><span>Otros</span><b>${pc(resto)}</b></div>` : '');
}

// Las 3 conclusiones que pide el proyecto, calculadas con los datos guardados
function hallazgos(d) {
  if (!d.total) { $('#hall').innerHTML = '<li>Aún no hay reportes para analizar. Registra algunos casos de prueba.</li>'; return; }
  const t = d.tipos[0], z = d.zonas[0];
  const sol = d.estados[6] || 0, pend = d.estados[1] || 0;
  $('#hall').innerHTML = [
    `El problema más reportado es <b>${esc(t.nombre)}</b>, con ${t.n} de ${d.total} reportes (${Math.round(t.n / d.total * 100)}%).`,
    `La zona con más reportes es <b>${esc(z.nombre)}</b>, con ${z.n} caso${z.n === 1 ? '' : 's'} y gravedad promedio ${z.nivel}.`,
    `De ${d.total} reportes, ${sol} ya ${sol === 1 ? 'fue solucionado' : 'fueron solucionados'} (${Math.round(sol / d.total * 100)}%) y ${pend} siguen pendientes de verificación.`,
  ].map(x => `<li>${x}</li>`).join('');
}

// Tiempo real: las estadísticas se recalculan solas cuando cambian los reportes
function realtime() {
  const rt = supabase.createClient(CFG.url, CFG.key);
  rt.channel('estadisticas')
    .on('postgres_changes', {event: '*', schema: 'public', table: 'reportes_ambientales'}, cargar)
    .subscribe();
}
cargar(); realtime();