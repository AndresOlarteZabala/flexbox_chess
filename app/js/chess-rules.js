/**
 * Manejo de eventos de juego en el cliente y despacho de movimientos hacia la API de Ajedrez.
 * La lógica y validación de reglas se ejecuta en el backend.
 */

async function drop(ev) {
  ev.preventDefault();

  if (isHistoryMode) {
    messageShow("Modo historial activo (Solo lectura). No puedes modificar jugadas anteriores.");
    return;
  }

  if (typeof latestLiveGame !== 'undefined' && latestLiveGame && (latestLiveGame.status === 'CHECKMATE' || latestLiveGame.status === 'STALEMATE' || latestLiveGame.status === 'RESIGNED')) {
    const w = latestLiveGame.winner === 'white' ? 'Blancas' : (latestLiveGame.winner === 'black' ? 'Negras' : 'Tablas');
    messageShow(`Partida finalizada por ${latestLiveGame.status}. Ganador: ${w}`);
    return;
  }

  const pieceId = ev.dataTransfer.getData("id");
  const member = document.getElementById(pieceId);
  if (!member) return;

  const pieceSide = member.getAttribute("side");
  if (!pieceSide.includes(data.side)) {
    messageShow(`Turno de las ${data.side === 'white' ? 'blancas' : 'negras'}`);
    return;
  }

  const target = ev.target.localName === "icon" ? ev.target.parentNode : ev.target;
  if (!target || !target.id) return;

  const fromSquare = member.parentNode.id;
  const toSquare = target.id;

  if (fromSquare === toSquare) return;

  try {
    const response = await fetch(`/api/games/${encodeURIComponent(currentGameId)}/moves`, {
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

    if (!response.ok || !result.success) {
      // El motor de reglas de la API rechazó el movimiento
      const errorMsg = result.error?.message || "Movimiento inválido según las reglas de ajedrez";
      messageShow(errorMsg);
      return;
    }

    const appliedMove = result.data.applied_move;
    const updatedGame = result.data.game;

    // Si hubo captura validada por el servidor, retirar la pieza capturada del DOM
    if (appliedMove.captured && target.children.length > 0) {
      target.removeChild(target.children[0]);
    }

    // Mover la pieza al destino
    member.setAttribute("state", "moved");
    member.setAttribute("col", target.getAttribute("col"));
    member.setAttribute("row", target.getAttribute("row"));
    target.appendChild(member);

    // Actualizar estado en index.js y renderizar cambios
    latestLiveGame = updatedGame;
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
      messageShow("🤝 ¡TABLAS! Rey Ahogado");
      return;
    } else if (updatedGame.in_check) {
      messageShow(`⚠️ ¡JAQUE a ${updatedGame.turn === 'white' ? 'Blancas' : 'Negras'}!`);
    }

    // Iniciar o actualizar el reloj si el juego sigue en curso
    startClock(data);

    // Si está en modo robot, disparar el movimiento automático del robot
    checkAutoBotMove(updatedGame);

  } catch (error) {
    console.error("Error al enviar jugada a la API:", error);
    messageShow("Error de comunicación con la API");
  }
}

let whiteTime = 0;
let blackTime = 0;
let intervalId;

function startClock(data) {
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => updateClock(data), 1000);
}

function stopClock() {
  if (intervalId) clearInterval(intervalId);
}

function updateClock(data) {
  if (data.side === "white") whiteTime++;
  if (data.side === "black") blackTime++;

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