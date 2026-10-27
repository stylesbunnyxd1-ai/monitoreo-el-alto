// Pantalla 10: perfil de usuario, con estadísticas personales y edición del nombre.
const $ = s => document.querySelector(s);
let nombreActual = '';

function aviso(txt, bueno = true) {
  const e = $('#p-msg'); e.textContent = txt; e.className = bueno ? 'msg-ok' : 'msg-e'; e.hidden = false;
  clearTimeout(aviso.h); aviso.h = setTimeout(() => e.hidden = true, 5000);
}

function modoEdicion(editando) {
  $('#i-nombre').readOnly = !editando;
  $('#editar').hidden = editando;
  $('#guardar').hidden = $('#cancelar').hidden = !editando;
  if (editando) { $('#i-nombre').focus(); $('#i-nombre').select(); }
}

async function cargar() {
  const r = await fetch('/api/perfil');
  if (r.status === 401) return location.href = '/acceso';
  const d = await r.json();
  if (!r.ok) return aviso(d.error || 'No se pudo cargar tu perfil.', false);

  nombreActual = d.nombre;
  $('#t-nombre').textContent = d.nombre;
  $('#t-correo').textContent = d.correo;
  $('#t-rol').textContent = d.rol === 'admin' ? 'Administrador' : 'Usuario registrado';
  $('#i-nombre').value = d.nombre;
  $('#i-correo').value = d.correo;
  $('#i-fecha').value = new Date(d.registro).toLocaleDateString('es-BO', {day: '2-digit', month: '2-digit', year: 'numeric'});
  $('#s-creados').textContent = d.creados;
  $('#s-conf').textContent = d.confirmaciones;
  $('#s-seg').textContent = d.seguimiento;
}

$('#editar').onclick = () => modoEdicion(true);
$('#cancelar').onclick = () => { $('#i-nombre').value = nombreActual; modoEdicion(false); };
$('#i-nombre').onkeydown = e => { if (e.key === 'Enter' && !$('#guardar').hidden) $('#guardar').click(); };

$('#guardar').onclick = async () => {
  const nombre = $('#i-nombre').value.trim();
  if (nombre.length < 2) return aviso('Escribe tu nombre (mínimo 2 letras).', false);
  $('#guardar').disabled = true;
  const r = await fetch('/api/perfil', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({nombre})});
  const j = await r.json();
  $('#guardar').disabled = false;
  if (!r.ok) return aviso(j.error, false);

  nombreActual = j.nombre;
  $('#t-nombre').textContent = j.nombre;
  $('#i-nombre').value = j.nombre;
  if (CFG.rol !== 'admin') {   // actualizar también el nombre de la barra superior
    const chip = document.querySelector('.chip-user > span:nth-of-type(2)');
    if (chip) chip.textContent = j.nombre;
  }
  modoEdicion(false);
  aviso('Perfil actualizado.');
};
cargar();