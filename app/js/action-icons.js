const actionIcons = {
  login: '<path d="M10 17l5-5-5-5M3 12h12M15 3h5a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-5"/>',
  register: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M20 8v6M17 11h6"/>',
  games: '<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M9 7h7M9 12h7M9 17h4M2 6v13"/>',
  logout: '<path d="M9 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h5M14 7l5 5-5 5M8 12h13"/>',
  controls: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  load: '<path d="M3 7h6l2 2h10l-3 11H3zM3 7V4h6l2 3h7"/>',
  new: '<path d="M12 5v14M5 12h14"/>',
  reset: '<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/>',
  robot: '<rect x="4" y="7" width="16" height="14" rx="3"/><path d="M12 3v4M1 12v5M23 12v5M9 17h6"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/>',
  start: '<path d="M5 5v14M19 5l-9 7 9 7z"/>',
  previous: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  live: '<path d="M19 5v14M5 5l9 7-9 7z"/>',
  flip: '<path d="M3 7h18l-4-4M21 17H3l4 4M21 7v4M3 17v-4"/>',
  sound: '<path d="M11 4L5 9H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  muted: '<path d="M11 4L5 9H2v6h3l6 5zM16 9l6 6M22 9l-6 6"/>',
  camera: '<path d="M3 6h4l2-3h6l2 3h4v15H3z"/><circle cx="12" cy="13" r="4"/>',
  resign: '<path d="M5 22V3M5 3c5-4 9 4 15 0v11c-6 4-10-4-15 0"/>',
  send: '<path d="M22 2L9 15M22 2l-7 20-6-7-7-6z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>'
};
let actionTooltip;
let tooltipButton = null;

function setActionIcon(button, icon, label) {
  button.classList.add('icon-button');
  button.dataset.tooltip = label;
  button.setAttribute('aria-label', label);
  button.removeAttribute('title');
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${actionIcons[icon]}</svg>`;
  if (tooltipButton === button) showActionTooltip(button);
}

function showActionTooltip(button) {
  if (button.disabled || !actionTooltip) return;
  if (tooltipButton && tooltipButton !== button) tooltipButton.removeAttribute('aria-describedby');
  tooltipButton = button;
  actionTooltip.textContent = button.dataset.tooltip;
  actionTooltip.hidden = false;
  button.setAttribute('aria-describedby', actionTooltip.id);
  const box = button.getBoundingClientRect();
  const tip = actionTooltip.getBoundingClientRect();
  const left = Math.max(8, Math.min(innerWidth - tip.width - 8, box.left + (box.width - tip.width) / 2));
  const top = box.bottom + tip.height + 12 <= innerHeight ? box.bottom + 8 : box.top - tip.height - 8;
  actionTooltip.style.left = `${left}px`;
  actionTooltip.style.top = `${Math.max(8, top)}px`;
}

function hideActionTooltip() {
  if (actionTooltip) actionTooltip.hidden = true;
  if (tooltipButton) tooltipButton.removeAttribute('aria-describedby');
  tooltipButton = null;
}

function initActionIcons() {
  actionTooltip = document.createElement('div');
  actionTooltip.id = 'action-tooltip';
  actionTooltip.className = 'action-tooltip';
  actionTooltip.setAttribute('role', 'tooltip');
  actionTooltip.hidden = true;
  document.body.append(actionTooltip);
  const buttons = {
    'btn-open-login': ['login', 'Iniciar sesión'],
    'btn-open-register': ['register', 'Registrarse'],
    'btn-user-games': ['games', 'Mis partidas'],
    'btn-user-logout': ['logout', 'Cerrar sesión'],
    'btn-toggle-game-controls': ['controls', 'Controles de partida'],
    'btn-load-game': ['load', 'Cargar partida'],
    'btn-new-game': ['new', 'Nueva partida'],
    'btn-reset-game': ['reset', 'Reiniciar partida'],
    'btn-trigger-bot': ['robot', 'Mover robot'],
    'btn-hist-start': ['start', 'Primera posición'],
    'btn-hist-prev': ['previous', 'Jugada anterior'],
    'btn-hist-next': ['next', 'Siguiente jugada'],
    'btn-hist-end': ['live', 'Volver al juego en vivo'],
    'btn-flip-board': ['flip', 'Voltear tablero'],
    'btn-toggle-sound': ['sound', 'Desactivar sonido'],
    'btn-photo-board': ['camera', 'Tomar foto del tablero'],
    'btn-resign': ['resign', 'Rendirse'],
    'chat-send': ['send', 'Enviar mensaje']
  };
  for (const [id, [icon, label]] of Object.entries(buttons)) setActionIcon(document.getElementById(id), icon, label);
  document.getElementById('btn-toggle-sound').setAttribute('aria-pressed', String(isSoundEnabled));
  document.querySelectorAll('.modal-close-btn').forEach(button => setActionIcon(button, 'close', 'Cerrar ventana'));
  document.querySelectorAll('button[onclick="refreshUserGamesList()"], button[onclick="exitHistoryMode()"], button[onclick="captureBoardPhoto()"], button[onclick="closeEndgameBanner()"], #welcome-banner button')
    .forEach(button => {
      const action = button.getAttribute('onclick');
      const [icon, label] = action.startsWith('openAuth') ? ['login', 'Iniciar sesión'] :
        action.startsWith('refresh') ? ['reset', 'Actualizar partidas'] :
        action.startsWith('exit') ? ['live', 'Volver al juego en vivo'] :
        action.startsWith('capture') ? ['camera', 'Tomar foto del tablero'] : ['close', 'Cerrar resultado'];
      setActionIcon(button, icon, label);
    });
  document.addEventListener('pointerover', event => {
    const button = event.target.closest('.icon-button');
    if (button && event.pointerType !== 'touch') showActionTooltip(button);
  });
  document.addEventListener('pointerout', event => {
    if (tooltipButton && !tooltipButton.contains(event.relatedTarget)) hideActionTooltip();
  });
  document.addEventListener('focusin', event => { if (event.target.matches('.icon-button')) showActionTooltip(event.target); });
  document.addEventListener('focusout', hideActionTooltip);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideActionTooltip(); });
  window.addEventListener('scroll', hideActionTooltip, true);
  window.addEventListener('resize', hideActionTooltip);
}
