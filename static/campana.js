// Campana de la barra superior: cuenta los avisos que aún no viste.
(async () => {
  try {
    const r = await fetch('/api/notificaciones');
    if (!r.ok) return;
    const lista = await r.json();
    const visto = new Date(localStorage.getItem('notif_visto_' + (CFG.user || '')) || '1970-01-01T00:00:00Z');
    const n = lista.filter(i => i.fecha && new Date(i.fecha) > visto).length;
    const b = document.getElementById('campana-n');
    if (b && n) { b.textContent = n > 9 ? '9+' : n; b.hidden = false; }
  } catch (e) { /* sin aviso, la campana queda limpia */ }
})();