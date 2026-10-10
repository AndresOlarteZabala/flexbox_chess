/**
 * Manejo de eventos de juego en el cliente y despacho de movimientos hacia la API de Ajedrez.
 * La lógica y validación de reglas se ejecuta en el backend.
 */

let movePending = false;

function canMovePiece(member, notify = true) {
  const reject = (message) => {
    if (notify) messageShow(message);
    return false;
  };
  if (movePending || isBotMoving) return false;

  if (isHistoryMode) {
    return reject("Modo historial activo (Solo lectura). No puedes modificar jugadas anteriores.");
  }

  if (typeof latestLiveGame !== 'undefined' && latestLiveGame && (latestLiveGame.status === 'CHECKMATE' || latestLiveGame.status === 'STALEMATE' || latestLiveGame.status === 'RESIGNED')) {
    const w = latestLiveGame.winner === 'white' ? 'Blancas' : (latestLiveGame.winner === 'black' ? 'Negras' : 'Tablas');
    return reject(`Partida finalizada por ${latestLiveGame.status}. Ganador: ${w}`);
  }
  if (!currentGameId || !member || member.getAttribute('draggable') !== 'true') return false;
  if (latestLiveGame && latestLiveGame.status === 'WAITING_FOR_PLAYER') return false;
  const pieceSide = member.getAttribute("side");
  if (myPlayerSide !== 'both' && pieceSide !== myPlayerSide) {
    return reject(`Tu bando es ${myPlayerSide === 'white' ? 'blancas' : 'negras'}`);
  }
  if (pieceSide !== data.side) {
    return reject(`Turno de las ${data.side === 'white' ? 'blancas' : 'negras'}`);
  }
  return true;
}

async function drop(ev) {
  ev.preventDefault();
  const target = ev.target.closest('.cell');
  await movePiece(ev.dataTransfer.getData('id'), target);
}

// Ratón, toques y arrastre táctil comparten permisos y envío al servidor.
async function movePiece(pieceId, target) {
  const member = document.getElementById(pieceId);
  if (!canMovePiece(member) || !target || !target.matches('#chess .cell')) return;
  const fromSquare = member.parentNode.id;
  const toSquare = target.id;

  if (fromSquare === toSquare) return;
  const gameId = currentGameId;
  movePending = true;
  clearBoardSelection();

  try {
    const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/moves`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(typeof authToken !== 'undefined' && authToken ? { "Authorization": `Bearer ${authToken}` } : {})
      },
      body: JSON.stringify({
        from: fromSquare,
        to: toSquare
      })
    });

    const result = await response.json();
    if (currentGameId !== gameId) return;

    if (!response.ok || !result.success) {
      // El motor de reglas de la API rechazó el movimiento
      const errorMsg = result.error?.message || "Movimiento inválido según las reglas de ajedrez";
      messageShow(errorMsg);
      return;
    }

    const appliedMove = result.data.applied_move;
    const updatedGame = result.data.game;

    // Actualizar estado en index.js y renderizar cambios
    latestLiveGame = updatedGame;
    if (isHistoryMode) return;
    renderGameState(updatedGame);

    // Reproducir efecto sonoro adecuado
    if (typeof playChessSound === 'function') {
      if (appliedMove.captured) {
        playChessSound('capture');
      } else if (updatedGame.status === 'CHECKMATE') {
        playChessSound('victory');
      } else if (updatedGame.in_check) {
        playChessSound('check');
      } else {
        playChessSound('move');
      }
    }

    // Notificar Jaque Mate, Ganador o Jaque
    if (updatedGame.status === 'CHECKMATE') {
      const winnerName = updatedGame.winner === 'white' ? 'Blancas' : 'Negras';
      stopClock();
      messageShow(`🏆 ¡JAQUE MATE! Ganador: ${winnerName}`);
      return;
    } else if (updatedGame.status === 'STALEMATE') {
      stopClock();
      const reasonLabel = typeof drawReasonLabel === 'function' ? drawReasonLabel(updatedGame.draw_reason) : 'Rey Ahogado';
      messageShow(`🤝 ¡TABLAS! ${reasonLabel}`);
      return;
    } else if (updatedGame.in_check) {
      messageShow(`⚠️ ¡JAQUE a ${updatedGame.turn === 'white' ? 'Blancas' : 'Negras'}!`);
    }

    // Si está en modo robot, disparar el movimiento automático del robot
    checkAutoBotMove(updatedGame);

  } catch (error) {
    console.error("Error al enviar jugada a la API:", error);
    messageShow("Error de comunicación con la API");
  } finally {
    movePending = false;
    updateBoardTouchTargets();
  }
}

let boardSelection = null;
let boardGesture = null;
let ignoreBoardClickUntil = 0;

function boardPositionKey() {
  return `${currentGameId}:${data.turn}:${data.side}`;
}

// Solo las piezas que el jugador puede mover reservan el gesto de arrastre.
// Las casillas vacías y las piezas rivales permiten desplazar la página.
function updateBoardTouchTargets() {
  document.querySelectorAll('#chess icon').forEach(piece => {
    piece.classList.toggle('touch-movable', canMovePiece(piece, false));
  });
}

function clearBoardSelection(cancelGesture = true) {
  boardSelection = null;
  document.querySelectorAll('#chess .piece-selected, #chess .possible-move').forEach(cell => cell.classList.remove('piece-selected', 'possible-move'));
  if (cancelGesture) cancelBoardGesture();
}

function refreshBoardSelection() {
  if (boardGesture && boardGesture.key !== boardPositionKey()) cancelBoardGesture();
  if (!boardSelection) return;
  const piece = document.getElementById(boardSelection.id);
  if (boardSelection.key !== boardPositionKey() || !canMovePiece(piece, false) || piece.parentNode.id !== boardSelection.square) {
    clearBoardSelection();
    return;
  }
  piece.parentNode.classList.add('piece-selected');
  boardSelection.destinations.forEach(square => document.getElementById(square)?.classList.add('possible-move'));
}

function selectBoardPiece(piece, preserveGesture = false) {
  clearBoardSelection(!preserveGesture);
  const selection = { id: piece.id, square: piece.parentNode.id, key: boardPositionKey(), destinations: [] };
  boardSelection = selection;
  piece.parentNode.classList.add('piece-selected');
  fetch(`/api/games/${encodeURIComponent(currentGameId)}/legal-moves?from=${selection.square}`)
    .then(response => response.ok ? response.json() : null)
    .then(result => {
      if (!result?.success || boardSelection !== selection || selection.key !== boardPositionKey()) return;
      if (result.data.from !== selection.square || result.data.turn_count !== data.turn || result.data.turn !== data.side) return;
      selection.destinations = result.data.destinations;
      refreshBoardSelection();
    })
    .catch(error => console.error('Error al consultar movimientos posibles:', error));
}

function tapBoardCell(cell) {
  refreshBoardSelection();
  const piece = cell.querySelector('icon');
  if (boardSelection) {
    if (cell.id === boardSelection.square) {
      clearBoardSelection();
    } else if (piece && piece.getAttribute('side') === data.side) {
      if (canMovePiece(piece)) selectBoardPiece(piece);
    } else {
      movePiece(boardSelection.id, cell);
    }
  } else if (piece && canMovePiece(piece)) {
    selectBoardPiece(piece);
  }
}

function cancelBoardGesture() {
  const gesture = boardGesture;
  boardGesture = null;
  if (!gesture) return;
  const piece = document.getElementById(gesture.pieceId);
  if (piece) {
    piece.style.transform = '';
    piece.classList.remove('touch-dragging');
  }
  document.querySelectorAll('#chess .touch-target').forEach(cell => cell.classList.remove('touch-target'));
  if (gesture.board.hasPointerCapture(gesture.pointerId)) gesture.board.releasePointerCapture(gesture.pointerId);
}

function boardCellAt(x, y) {
  const element = document.elementFromPoint(x, y);
  return element && element.closest('#chess .cell');
}

function initBoardInput() {
  const board = document.getElementById('chess');
  board.addEventListener('click', event => {
    if (Date.now() < ignoreBoardClickUntil) return;
    const cell = event.target.closest('.cell');
    if (cell) tapBoardCell(cell);
  });
  board.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    if (!event.isPrimary) {
      clearBoardSelection();
      return;
    }
    const cell = event.target.closest('.cell');
    if (!cell) return;
    ignoreBoardClickUntil = Date.now() + 800;
    refreshBoardSelection();
    const piece = cell.querySelector('icon');
    const pieceId = piece && canMovePiece(piece, false) ? piece.id : null;
    if (pieceId) event.preventDefault();
    boardGesture = { board, pointerId: event.pointerId, pieceId, square: cell.id,
      x: event.clientX, y: event.clientY, key: boardPositionKey(), dragged: false };
    board.setPointerCapture(event.pointerId);
  });
  board.addEventListener('pointermove', event => {
    const gesture = boardGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.hypot(dx, dy) < 8 && !gesture.dragged) return;
    const piece = document.getElementById(gesture.pieceId);
    if (!piece) { gesture.dragged = true; return; }
    if (gesture.key !== boardPositionKey() || !canMovePiece(piece, false)) {
      clearBoardSelection();
      return;
    }
    if (!gesture.dragged) selectBoardPiece(piece, true);
    gesture.dragged = true;
    piece.classList.add('touch-dragging');
    piece.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
    document.querySelectorAll('#chess .touch-target').forEach(cell => cell.classList.remove('touch-target'));
    const target = boardCellAt(event.clientX, event.clientY);
    if (target) target.classList.add('touch-target');
  });
  board.addEventListener('pointerup', event => {
    const gesture = boardGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    ignoreBoardClickUntil = Date.now() + 800;
    const target = boardCellAt(event.clientX, event.clientY);
    cancelBoardGesture();
    if (!target || gesture.key !== boardPositionKey()) return;
    if (gesture.dragged) {
      if (gesture.pieceId && target.id !== gesture.square) movePiece(gesture.pieceId, target);
    } else {
      tapBoardCell(target);
    }
  });
  board.addEventListener('pointercancel', clearBoardSelection);
  board.addEventListener('lostpointercapture', cancelBoardGesture);
  board.addEventListener('dragend', () => clearBoardSelection());
  board.addEventListener('contextmenu', event => event.preventDefault());
  document.addEventListener('click', event => {
    if (!board.contains(event.target)) clearBoardSelection();
  });
}

let whiteTime = 0;
let blackTime = 0;
let intervalId;
let clockSnapshot = null;
const clockResponseTimes = new WeakMap();

function syncClocks(gameState) {
  stopClock();
  const clocks = gameState.clocks;
  if (!clocks) return;
  if (!clockResponseTimes.has(gameState)) clockResponseTimes.set(gameState, performance.now());
  clockSnapshot = {
    white: Math.max(0, clocks.elapsed_white || 0),
    black: Math.max(0, clocks.elapsed_black || 0),
    side: gameState.turn,
    running: !!clocks.running && gameState.status === 'IN_PROGRESS',
    receivedAt: clockResponseTimes.get(gameState)
  };
  updateClock();
  if (clockSnapshot.running) intervalId = setInterval(updateClock, 250);
}

function stopClock() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

/**
 * Reinicia ambos relojes a cero. Debe llamarse al cargar o crear una
 * partida distinta a la que tenía el reloj corriendo, para que cada
 * partida nueva empiece su conteo desde 00:00:00.
 */
function resetClocks() {
  stopClock();
  clockSnapshot = null;
  whiteTime = 0;
  blackTime = 0;
  updateClockDisplay();
}

function updateClock() {
  if (!clockSnapshot) return;
  const elapsed = clockSnapshot.running ? Math.max(0, performance.now() - clockSnapshot.receivedAt) : 0;
  whiteTime = Math.floor((clockSnapshot.white + (clockSnapshot.side === 'white' ? elapsed : 0)) / 1000);
  blackTime = Math.floor((clockSnapshot.black + (clockSnapshot.side === 'black' ? elapsed : 0)) / 1000);
  data.whiteTime = whiteTime;
  data.blackTime = blackTime;
  updateClockDisplay();
}

function updateClockDisplay() {
  const whiteClockElement = document.getElementById('white-clock');
  const blackClockElement = document.getElementById('black-clock');
  if (whiteClockElement) whiteClockElement.textContent = formatTime(whiteTime);
  if (blackClockElement) blackClockElement.textContent = formatTime(blackTime);
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${padZero(hours)}:${padZero(minutes)}:${padZero(remainingSeconds)}`;
}

function padZero(value) {
  return value < 10 ? `0${value}` : value;
}
