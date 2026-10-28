// Comentarios de la comunidad en el detalle de un reporte: respuestas, moderación y tiempo real.
let comentarios = [], respondiendoA = null;

const haceCom = f => {
  const m = Math.max(0, Math.round((Date.now() - new Date(f)) / 60000));
  if (m < 1) return 'Hace un momento';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `Hace ${d} d` : new Date(f).toLocaleDateString('es-BO');
};

function avisoCom(txt, bueno) {
  const e = $('#com-msg'); e.textContent = txt; e.className = bueno ? 'msg-ok' : 'msg-e'; e.hidden = false;
  clearTimeout(avisoCom.h); avisoCom.h = setTimeout(() => e.hidden = true, 5000);
}

// Comentarios principales con sus respuestas debajo. Si el comentario padre ya no está (oculto), la respuesta pasa a principal.
function armarArbol(lista) {
  const ids = new Set(lista.map(c => c.id));
  return lista.filter(c => !c.padre_id || !ids.has(c.padre_id))
    .map(c => ({c, hijos: lista.filter(h => h.padre_id === c.id)}));
}

function itemCom(c, esRespuesta) {
  const acc = [];
  if (CFG.user && !esRespuesta && !c.oculto) acc.push(`<button type="button" data-a="resp" data-id="${c.id}">Responder</button>`);
  if (CFG.rol === 'admin') acc.push(`<button type="button" data-a="ocultar" data-id="${c.id}" data-o="${c.oculto ? 0 : 1}">${c.oculto ? 'Mostrar' : 'Ocultar'}</button>`);
  if (c.mio || CFG.rol === 'admin') acc.push(`<button type="button" data-a="borrar" data-id="${c.id}">Borrar</button>`);
  return `<div class="com ${esRespuesta ? 'resp' : ''} ${c.oculto ? 'oculto' : ''}">
    <div class="com-cab"><b>${esc(c.autor)}</b>${c.es_admin ? '<span class="tag-adm">Administrador</span>' : ''}
      <small>${haceCom(c.created_at)}</small>${c.oculto ? '<small class="tag-ocu">Oculto para los demás</small>' : ''}</div>
    <p>${esc(c.texto)}</p>
    <div class="com-acc">${acc.join('')}</div></div>`;
}

function pintarComentarios() {
  $('#n-coms').textContent = comentarios.length ? `(${comentarios.length})` : '';
  $('#lista-com').innerHTML = armarArbol(comentarios)
    .map(({c, hijos}) => itemCom(c, false) + hijos.map(h => itemCom(h, true)).join('')).join('')
    || '<p class="mu">Aún no hay comentarios. Sé la primera persona en comentar.</p>';
}

async function cargarComentarios() {
  try {
    const r = await fetch(`/api/reportes/${RID}/comentarios`);
    if (!r.ok) throw new Error();
    comentarios = await r.json();
    pintarComentarios();
  } catch (e) {
    $('#lista-com').innerHTML = '<p class="mu">No se pudieron cargar los comentarios.</p>';
  }
}

function cancelarRespuesta() { respondiendoA = null; $('#resp-a').hidden = true; }

async function publicarComentario() {
  const texto = $('#com-texto').value.trim();
  if (texto.length < 2) return avisoCom('Escribe al menos 2 letras.', false);
  const b = $('#com-enviar'); b.disabled = true;
  try {
    const r = await fetch(`/api/reportes/${RID}/comentarios`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({texto, padre_id: respondiendoA})});
    if (r.status === 401) return location.href = '/acceso';
    const j = await r.json();
    if (!r.ok) return avisoCom(j.error || 'No se pudo publicar.', false);
    $('#com-texto').value = ''; $('#com-cuenta').textContent = '0';
    cancelarRespuesta(); avisoCom('Comentario publicado.', true); cargarComentarios();
  } catch (e) {
    avisoCom('No se pudo publicar. Inténtalo de nuevo.', false);
  } finally { b.disabled = false; }
}

// Responder, ocultar (administrador) y borrar
$('#lista-com').onclick = async e => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const id = Number(b.dataset.id), a = b.dataset.a;
  if (a === 'resp') {
    const c = comentarios.find(x => x.id === id); if (!c) return;
    respondiendoA = id; $('#resp-txt').textContent = `Respondiendo a ${c.autor}`; $('#resp-a').hidden = false;
    $('#com-texto').focus(); $('#f-com').scrollIntoView({behavior: 'smooth', block: 'center'});
    return;
  }
  if (a === 'borrar' && !confirm('¿Borrar este comentario? También se borrarán sus respuestas.')) return;
  const r = a === 'borrar'
    ? await fetch(`/api/comentarios/${id}`, {method: 'DELETE'})
    : await fetch(`/api/comentarios/${id}/ocultar`, {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({oculto: b.dataset.o === '1'})});
  const j = await r.json();
  if (!r.ok) return avisoCom(j.error || 'No se pudo completar la acción.', false);
  cargarComentarios();
};

if (CFG.user) $('#f-com').hidden = false; else $('#com-login').hidden = false;
$('#com-texto').oninput = e => $('#com-cuenta').textContent = e.target.value.length;
$('#resp-x').onclick = cancelarRespuesta;
$('#f-com').onsubmit = e => { e.preventDefault(); publicarComentario(); };

// Tiempo real: los comentarios nuevos aparecen solos (y cada 30 s como respaldo)
(function () {
  const rt = supabase.createClient(CFG.url, CFG.key);
  rt.channel('comentarios-' + RID)
    .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'comentarios', filter: `reporte_id=eq.${RID}`}, cargarComentarios)
    .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'comentarios', filter: `reporte_id=eq.${RID}`}, cargarComentarios)
    .on('postgres_changes', {event: 'DELETE', schema: 'public', table: 'comentarios'}, cargarComentarios)
    .subscribe();
  setInterval(cargarComentarios, 30000);
})();
cargarComentarios();