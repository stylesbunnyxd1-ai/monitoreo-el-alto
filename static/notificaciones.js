// Pantalla 12: notificaciones. Se actualizan solas cuando cambian los reportes.
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CLAVE = 'notif_visto_' + (CFG.user || '');
const visto = new Date(localStorage.getItem(CLAVE) || '1970-01-01T00:00:00Z');   // lo que ya habías visto antes de entrar

const ICONOS = {
  nuevo:       '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/>',
  confirmado:  '<path d="M4 12l5 5L20 6"/>',
  estado:      '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    comentario:  '<path d="M4 5h16v11H10l-6 4z"/>',
  comunitaria: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.5.6 4 2.6 4 6"/>',
};

function hace(f) {
  if (!f) return '';
  const m = Math.max(0, Math.round((Date.now() - new Date(f)) / 60000));
  if (m < 1) return 'Hace un momento';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `Hace ${d} d` : new Date(f).toLocaleDateString('es-BO');
}

async function cargar() {
  const r = await fetch('/api/notificaciones');
  if (r.status === 401) return location.href = '/acceso';
  if (!r.ok) { $('#lista').innerHTML = '<p class="notif-vacia">No se pudieron cargar las notificaciones.</p>'; return; }
  const lista = await r.json();

  const nuevas = lista.filter(i => i.fecha && new Date(i.fecha) > visto).length;
  $('#n-badge').textContent = nuevas > 9 ? '9+' : nuevas;
  $('#n-badge').hidden = !nuevas;

  $('#lista').innerHTML = lista.length ? lista.map(i => `
    <a class="notif ${i.fecha && new Date(i.fecha) > visto ? 'nueva' : ''}" href="/reporte/${i.reporte}">
      <span class="n-ico ${i.tipo}"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONOS[i.tipo]}</svg></span>
      <div class="n-txt"><b>${esc(i.titulo)}</b><span>${esc(i.texto)}</span></div>
      <span class="n-hora">${hace(i.fecha)}</span>
    </a>`).join('') : '<p class="notif-vacia">Todavía no hay notificaciones.</p>';

  localStorage.setItem(CLAVE, new Date().toISOString());   // ya las viste: la campana se pone en cero
}

function realtime() {
  const rt = supabase.createClient(CFG.url, CFG.key);
  ['reportes_ambientales', 'seguimientos', 'confirmaciones', 'comentarios'].forEach(t =>
    rt.channel('notif-' + t).on('postgres_changes', {event: '*', schema: 'public', table: t}, cargar).subscribe());
}
cargar(); realtime();
setInterval(cargar, 30000);