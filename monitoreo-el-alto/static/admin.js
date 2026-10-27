// Pantalla 8: reportes pendientes de revisión y reportes verificados (solo administrador).
const ESTADOS = {
  1: {n: 'Reportado',   c: '#e53935'},
  2: {n: 'Confirmado',  c: '#2e9e4f'},
  3: {n: 'Rechazado',   c: '#7a8580'},
  4: {n: 'Prioritario', c: '#fb8c00'},
  5: {n: 'En atención', c: '#0f5c4d'},
  6: {n: 'Solucionado', c: '#1e88e5'},
};
const GRAV = {alta: ['Alta', '#e53935'], media: ['Media', '#c98a00'], baja: ['Baja', '#2e9e4f']};
const POR_PAGINA = 8;
const PEND = MODO === 'pendientes';
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let todos = [], pagina = 1, objetivo = null;

function aviso(txt, bueno = true) {
  const e = $('#msg-a'); e.textContent = txt; e.className = bueno ? 'msg-ok' : 'msg-e'; e.hidden = false;
  clearTimeout(aviso.h); aviso.h = setTimeout(() => e.hidden = true, 5000);
}

async function cargar() {
  const r = await fetch('/api/reportes');
  if (!r.ok) { $('#filas').innerHTML = '<tr><td colspan="7" class="vacio">No se pudieron cargar los reportes.</td></tr>'; return; }
  const api = await r.json();
  todos = PEND ? api.filter(x => x.estado_id === 1) : api.filter(x => [2, 4, 5, 6].includes(x.estado_id));
  pintar();
}

function pintar() {
  const paginas = Math.max(1, Math.ceil(todos.length / POR_PAGINA));
  pagina = Math.min(pagina, paginas);
  const trozo = todos.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  $('#cab').innerHTML = '<tr>' + ['ID', 'Tipo', 'Zona', 'Gravedad', ...(PEND ? [] : ['Estado']), 'Fecha', 'Acciones']
    .map(t => `<th>${t}</th>`).join('') + '</tr>';

  $('#filas').innerHTML = trozo.map(r => {
    const [gt, gc] = GRAV[r.gravedad], e = ESTADOS[r.estado_id];
    const f = new Date(r.created_at).toLocaleDateString('es-BO', {day: '2-digit', month: '2-digit', year: 'numeric'});
    const estado = PEND ? '' : `<td><span class="est" style="color:${e.c};background:${e.c}1f;border-color:${e.c}55"><i style="background:${e.c}"></i>${e.n}</span></td>`;
    const acc = `<a class="b-ver" href="/reporte/${r.id}">Ver</a>` + (PEND ? `<button class="b-rech" type="button" data-id="${r.id}">Rechazar</button>` : '');
    return `<tr><td>#${r.id}</td><td>${esc(r.tipos_contaminacion.nombre)}</td><td>${esc(r.zonas.nombre)}</td>
      <td class="g" style="color:${gc}">${gt}</td>${estado}<td>${f}</td><td><div class="acc-tabla">${acc}</div></td></tr>`;
  }).join('') || `<tr><td colspan="${PEND ? 6 : 7}" class="vacio">${PEND ? 'No hay reportes pendientes. Todo está al día.' : 'Todavía no hay reportes verificados.'}</td></tr>`;

  $('#total').textContent = todos.length ? `${todos.length} reporte${todos.length === 1 ? '' : 's'}` : '';
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
$('#pag').onclick = e => { const b = e.target.closest('button'); if (b) { pagina = Number(b.dataset.p); pintar(); } };

// ---------- Rechazar con motivo ----------
$('#filas').onclick = e => {
  const b = e.target.closest('.b-rech'); if (!b) return;
  objetivo = todos.find(r => r.id === Number(b.dataset.id)); if (!objetivo) return;
  $('#m-titulo').textContent = `Rechazar reporte #${objetivo.id}`;
  $('#r-motivo').value = ''; $('#r-err').hidden = true; $('#m-rech').hidden = false; $('#r-motivo').focus();
};
const cerrar = () => $('#m-rech').hidden = true;
$('#r-cancel').onclick = cerrar; $('#r-x').onclick = cerrar;
$('#m-rech').onclick = e => { if (e.target.id === 'm-rech') cerrar(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });

$('#r-ok').onclick = async () => {
  const motivo = $('#r-motivo').value.trim(), em = $('#r-err');
  if (motivo.length < 5) { em.textContent = 'Escribe el motivo del rechazo (mínimo 5 letras).'; em.hidden = false; return; }
  $('#r-ok').disabled = true;
  const r = await fetch(`/api/reportes/${objetivo.id}/estado`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({estado_id: 3, observacion: motivo})});
  const j = await r.json();
  $('#r-ok').disabled = false;
  if (!r.ok) { em.textContent = j.error; em.hidden = false; return; }
  cerrar(); aviso(`El reporte #${objetivo.id} fue rechazado.`); cargar();
};

// ---------- Tiempo real: llegan reportes nuevos sin recargar ----------
function realtime() {
  const rt = supabase.createClient(CFG.url, CFG.key);
  rt.channel('admin-reportes')
    .on('postgres_changes', {event: '*', schema: 'public', table: 'reportes_ambientales'}, p => {
      if (PEND && p.eventType === 'INSERT') aviso('Llegó un reporte nuevo para revisar.');
      cargar();
    })
    .subscribe();
}
cargar(); realtime();