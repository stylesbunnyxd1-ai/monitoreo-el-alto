// Pines del mapa: gota del color del estado, con el icono del tipo de contaminación dentro.
const COLOR_ESTADO = {1: '#e53935', 2: '#2e9e4f', 3: '#7a8580', 4: '#fb8c00', 5: '#0f5c4d', 6: '#1e88e5'};

const ICONOS_TIPO = {
  basura:   '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
  agua:     '<path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z"/>',
  fuego:    '<path d="M12 3c1 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2 0 2 .8 3 2 3 0-3-1-5.5 1-9.3z"/>',
  ojo:      '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  via:      '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  escombro: '<path d="M3 20l5.5-9.5 4 6 3-4L21 20z"/>',
  humo:     '<path d="M7 18a4 4 0 0 1-.6-7.9A6 6 0 0 1 18 10.5 3.8 3.8 0 0 1 17.5 18z"/>',
  otro:     '<path d="M12 4l9.5 16h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
};

function iconoTipo(nombre) {
  const t = String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.includes('basur')) return 'basura';
  if (t.includes('agua')) return 'agua';
  if (t.includes('quema')) return 'fuego';
  if (t.includes('visual')) return 'ojo';
  if (t.includes('obstru') || t.includes('via')) return 'via';
  if (t.includes('escomb')) return 'escombro';
  if (t.includes('emisi') || t.includes('humo')) return 'humo';
  return 'otro';
}

function gotaTipo(color, nombre, w, h) {
  return `<svg viewBox="0 0 24 32" width="${w}" height="${h}"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${color}"/><circle cx="12" cy="12" r="8.6" fill="#fff"/><g transform="translate(5.3 5.3) scale(.56)" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICONOS_TIPO[iconoTipo(nombre)]}</g></svg>`;
}

function pinTipo(color, nombre, nuevo) {
  return L.divIcon({
    className: nuevo ? 'pin-nuevo' : '', iconSize: [34, 45], iconAnchor: [17, 45], popupAnchor: [0, -40],
    html: gotaTipo(color, nombre, 34, 45).replace('<svg ', '<svg class="pin" ')
  });
}