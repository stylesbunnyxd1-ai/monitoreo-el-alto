// Gestión de usuarios (solo administrador): ver vecinos y dar o quitar permisos de administrador.
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let usuarios = [];

function aviso(txt, bueno = true) {
  const e = $('#msg-u'); e.textContent = txt; e.className = bueno ? 'msg-ok' : 'msg-e'; e.hidden = false;
  clearTimeout(aviso.h); aviso.h = setTimeout(() => e.hidden = true, 5000);
}

async function cargar() {
  const r = await fetch('/api/usuarios'), j = await r.json();
  if (!r.ok) { $('#filas').innerHTML = `<tr><td colspan="5" class="vacio">${esc(j.error || 'No se pudo cargar')}</td></tr>`; return; }
  usuarios = j;
  $('#filas').innerHTML = j.map(u => {
    const f = new Date(u.created_at).toLocaleDateString('es-BO', {day: '2-digit', month: '2-digit', year: 'numeric'});
    const nuevo = u.rol === 'admin' ? 'usuario' : 'admin';
    const boton = u.es_yo ? '<span class="mu">Tú</span>'
      : `<button class="b-sec" type="button" data-id="${esc(u.id)}" data-rol="${nuevo}">${nuevo === 'admin' ? 'Hacer administrador' : 'Quitar administrador'}</button>`;
    return `<tr><td>${esc(u.nombre)}</td>
      <td><span class="rol ${esc(u.rol)}">${u.rol === 'admin' ? 'Administrador' : 'Vecino'}</span></td>
      <td>${f}</td><td>${u.reportes}</td><td>${boton}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="vacio">Aún no hay usuarios.</td></tr>';
  $('#total').textContent = `${j.length} usuario${j.length === 1 ? '' : 's'}`;
}

$('#filas').onclick = async e => {
  const b = e.target.closest('.b-sec'); if (!b) return;
  const u = usuarios.find(x => x.id === b.dataset.id);
  const accion = b.dataset.rol === 'admin' ? 'dar permisos de administrador a' : 'quitar los permisos de administrador a';
  if (!confirm(`¿Seguro que quieres ${accion} ${u.nombre}?`)) return;
  const r = await fetch(`/api/usuarios/${b.dataset.id}/rol`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({rol: b.dataset.rol})});
  const j = await r.json();
  if (!r.ok) return aviso(j.error, false);
  aviso('Rol actualizado. El cambio se aplica cuando esa persona vuelva a iniciar sesión.');
  cargar();
};
cargar();