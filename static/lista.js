// Pantalla 6: lista de reportes con buscador, filtros, paginación y actualización en tiempo real.
const ESTADOS = {
  1: {n: 'Reportado',   c: '#e53935'},
  2: {n: 'Confirmado',  c: '#2e9e4f'},
  3: {n: 'Rechazado',   c: '#7a8580'},
  4: {n: 'Prioritario', c: '#fb8c00'},
  5: {n: 'En atención', c: '#0f5c4d'},
  6: {n: 'Solucionado', c: '#1e88e5'},
};
const GRAV = {alta: ['Alta', '#e53935'], media: ['Media', '#c98a00'], baja: ['Baja', '#2e9e4f']};
const POR_PAGINA = 6;
const OJO = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let todos = [], pagina = 1;

// Fecha de inicio según la opción elegida (hoy, 7 días, 30 días)
function desde() {
  const v = $('#f-fecha').value;
  if (!v) return '';
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (v !== 'hoy') d.setDate(d.getDate() - Number(v));
  return d.toISOString();
}

async function iniciar() {
  const cat = await (await fetch('/api/catalogos')).json();
  const llenar = (id, lista, texto) => lista.forEach(o => {
    const op = document.createElement('option'); op.value = o.id; op.textContent = texto(o); $(id).append(op);
  });
  llenar('#f-tipo', cat.tipos, o => o.nombre);
  llenar('#f-zona', cat.zonas, o => o.nombre);
  // "Rechazado" solo lo puede ver el administrador
  llenar('#f-estado', cat.estados.filter(e => e.id !== 3 || CFG.rol === 'admin'), o => ESTADOS[o.id].n);

  $('#aplicar').onclick = () => cargar(true);
  $('#q').oninput = () => { pagina = 1; pintar(); };
  $('#pag').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    pagina = Number(b.dataset.p); pintar();
    document.querySelector('.tabla-wrap').scrollIntoView({behavior: 'smooth', block: 'start'});
  };
  await cargar(true);
  realtime();
}

async function cargar(reiniciar) {
  const p = new URLSearchParams();
  [['tipo_id', '#f-tipo'], ['zona_id', '#f-zona'], ['estado_id', '#f-estado']].forEach(([k, s]) => $(s).value && p.set(k, $(s).value));
  if (desde()) p.set('desde', desde());
  if (MIOS) p.set('mios', '1');
  const r = await fetch('/api/reportes?' + p);
  if (!r.ok) { $('#filas').innerHTML = '<tr><td colspan="7" class="vacio">No se pudieron cargar los reportes.</td></tr>'; return; }
  todos = await r.json();
  if (reiniciar) pagina = 1;
  pintar();
}

function pintar() {
  const q = $('#q').value.trim().toLowerCase();
  const lista = !q ? todos : todos.filter(r => [
    '#' + r.id, r.tipos_contaminacion.nombre, r.zonas.nombre, r.descripcion, ESTADOS[r.estado_id].n, r.gravedad
  ].join(' ').toLowerCase().includes(q));

  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  pagina = Math.min(pagina, paginas);
  const trozo = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  $('#filas').innerHTML = trozo.map(r => {
    const e = ESTADOS[r.estado_id], [gt, gc] = GRAV[r.gravedad];
    const f = new Date(r.created_at).toLocaleDateString('es-BO', {day: '2-digit', month: '2-digit', year: 'numeric'});
    return `<tr>
      <td>#${r.id}</td><td>${esc(r.tipos_contaminacion.nombre)}</td><td>${esc(r.zonas.nombre)}</td>
      <td class="g" style="color:${gc}">${gt}</td>
      <td><span class="est" style="color:${e.c};background:${e.c}1f;border-color:${e.c}55"><i style="background:${e.c}"></i>${e.n}</span></td>
      <td>${f}</td>
      <td><a class="ver" href="/reporte/${r.id}" title="Ver detalle" aria-label="Ver detalle del reporte ${r.id}">${OJO}</a></td></tr>`;
  }).join('') || `<tr><td colspan="7" class="vacio">${MIOS && !todos.length ? 'Todavía no registraste reportes.' : 'No hay reportes con estos filtros.'}</td></tr>`;

  $('#total').textContent = lista.length ? `${lista.length} reporte${lista.length === 1 ? '' : 's'}` : '';
  paginador(paginas);
}

function paginador(n) {
  if (n <= 1) { $('#pag').innerHTML = ''; return; }
  const ini = Math.max(1, Math.min(pagina - 2, n - 4)), fin = Math.min(n, ini + 4);
  let h = pagina > 1 ? `<button data-p="${pagina - 1}" aria-label="Anterior">‹</button>` : '';
  for (let i = ini; i <= fin; i++) h += `<button class="${i === pagina ? 'on' : ''}" data-p="${i}">${i}</button>`;
  if (pagina < n) h += `<button data-p="${pagina + 1}" aria-label="Siguiente">›</button>`;
  $('#pag').innerHTML = h;
}

// Tiempo real: la tabla se actualiza sola cuando hay reportes nuevos o cambian de estado
function realtime() {
  const rt = supabase.createClient(CFG.url, CFG.key);
  rt.channel('lista-reportes')
    .on('postgres_changes', {event: '*', schema: 'public', table: 'reportes_ambientales'}, () => cargar(false))
    .subscribe();
}
iniciar();