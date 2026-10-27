// Pantalla 5, parte extra: historial de seguimiento (todos) y panel de verificación (solo administrador).
const NOMBRE_ESTADO = {1: 'Reportado', 2: 'Confirmado', 3: 'Rechazado', 4: 'Prioritario', 5: 'En atención', 6: 'Solucionado'};
const TIPO_DEN = {falso: 'Parece falso', duplicado: 'Reporte duplicado', ubicacion: 'Ubicación incorrecta', otro: 'Otro motivo'};

function panelAdmin(r) {
  const den = (r.denuncias || []).length
    ? `<div class="den"><b>Avisos de error (${r.denuncias.length})</b>${r.denuncias.map(d =>
        `<div>• ${esc(TIPO_DEN[d.tipo] || d.tipo)}${d.detalle ? ': ' + esc(d.detalle) : ''}</div>`).join('')}</div>` : '';
  return `<div class="panel-admin"><h3>Verificación del administrador</h3>${den}
    <textarea id="a-obs" maxlength="300" placeholder="Observación (obligatoria al rechazar)"></textarea>
    <div class="a-bot">
      <button class="btn-verde" id="a-conf" type="button" ${r.estado_id === 2 ? 'disabled' : ''}>Verificar y confirmar</button>
      <button class="btn-rojo" id="a-rech" type="button" ${r.estado_id === 3 ? 'disabled' : ''}>Rechazar</button>
    </div>
    <label>Estado de seguimiento</label>
    <div class="a-seg">
      <select id="a-est">${[4, 5, 6].map(i => `<option value="${i}" ${i === r.estado_id ? 'selected' : ''}>${NOMBRE_ESTADO[i]}</option>`).join('')}</select>
      <button class="btn-v" id="a-guardar" type="button">Guardar estado</button>
    </div></div>`;
}

async function cambiarEstado(estado) {
  const obs = $('#a-obs').value.trim();
  if (estado === 3 && obs.length < 5) { mensaje('Escribe el motivo del rechazo (mínimo 5 letras).'); return $('#acc-msg').scrollIntoView({behavior: 'smooth', block: 'center'}); }
  const r = await fetch(`/api/reportes/${RID}/estado`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({estado_id: estado, observacion: obs})});
  const j = await r.json();
  mensaje(r.ok ? 'Estado actualizado.' : j.error, r.ok);
  $('#acc-msg').scrollIntoView({behavior: 'smooth', block: 'center'});
  if (r.ok) { $('#a-obs').value = ''; cargar(); }
}

function pintarExtra() {
  const r = datos; if (!r) return;
  const guardado = $('#a-obs') ? $('#a-obs').value : '';   // no perder lo que el administrador estaba escribiendo
  const hist = [...(r.seguimientos || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  $('#extra').innerHTML = `<h3>Historial de seguimiento</h3><div class="histo">${hist.map(h =>
    `<div><b>${NOMBRE_ESTADO[h.estado_id] || ''}</b> · ${new Date(h.created_at).toLocaleString('es-BO', {dateStyle: 'short', timeStyle: 'short'})}${h.observacion ? `<small>${esc(h.observacion)}</small>` : ''}</div>`).join('')
    || '<p class="mu">Sin movimientos todavía.</p>'}</div>` + (CFG.rol === 'admin' ? panelAdmin(r) : '');
  if (CFG.rol === 'admin') {
    $('#a-obs').value = guardado;
    $('#a-conf').onclick = () => cambiarEstado(2);
    $('#a-rech').onclick = () => cambiarEstado(3);
    $('#a-guardar').onclick = () => cambiarEstado(Number($('#a-est').value));
  }
}

// Cada vez que detalle.js dibuja el reporte, también dibujamos esta parte
const pintarOriginal = pintar;
pintar = function () { pintarOriginal(); pintarExtra(); };
if (datos) pintarExtra();