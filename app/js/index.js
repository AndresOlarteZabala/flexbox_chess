let chess = $("#chess");
let turnLabel = $("#turn");
let quantityLabel = $("#quantity");
let black_points = 0;
let white_points = 0;
let currentGameId = null;
let clockedGameId = null; // ID de la partida a la que pertenece el conteo actual del reloj
let gameMode = "bot"; // 'bot' o 'multiplayer'
let myPlayerSide = "white"; // 'white', 'black' o 'both'
let syncTimer = null;
let isBotMoving = false;

// Variables de Autenticación de Usuario
let authToken = localStorage.getItem('chess_auth_token') || null;
let currentUser = null;
let appSocket = null;
let pendingInvites = [];
try {
  const savedUser = localStorage.getItem('chess_auth_user');
  if (savedUser) currentUser = JSON.parse(savedUser);
} catch (e) {
  currentUser = null;
}

// Variables para el modo historial / navegación de jugadas anteriores
let isHistoryMode = false;
let currentHistoryStep = null;
let latestLiveGame = null;

// Evita repetir el banner vistoso de fin de partida en cada re-render
let lastAnnouncedGameEndKey = null;

let currentMovementsPage = 1;
const movementsPerPage = 10;
let allMovements = [];

let data = {
  cols: ["a", "b", "c", "d", "e", "f", "g", "h"],
  rows: ["8", "7", "6", "5", "4", "3", "2", "1"],
  board: {
    rows: 8,
    cols: 8,
    classes: ["white", "black"]
  },
  side: "white",
  turn: 0,
  sides: ["white", "black"]
};
let history = [];

// Inicializar al cargar el documento
$(document).ready(function () {
  load();
  initAuth();
  startSyncLoop();
});

// Navegación con los botones atrás/adelante del navegador entre URLs de partidas
window.addEventListener('popstate', () => {
  const pathMatch = window.location.pathname.match(/^\/game\/([^/]+)\/?$/);
  const gameId = pathMatch ? decodeURIComponent(pathMatch[1]) : null;
  if (gameId) {
    $("#game-id-input").val(gameId);
    loadGameFromAPI(gameId);
  }
});

function load() {
  const urlParams = new URLSearchParams(window.location.search);

  // ID de partida embebido en la ruta (/game/<id>) tiene prioridad sobre el query param (?game=<id>)
  const pathMatch = window.location.pathname.match(/^\/game\/([^/]+)\/?$/);
  const pathGameId = pathMatch ? decodeURIComponent(pathMatch[1]) : null;
  const paramGameId = pathGameId || urlParams.get('game');

  if (paramGameId) {
    currentGameId = paramGameId;
    $("#game-id-input").val(currentGameId);
  }
  const paramSide = urlParams.get('side');
  if (paramSide) {
    myPlayerSide = paramSide;
    $("#player-side-select").val(myPlayerSide);
  }
  const paramMode = urlParams.get('mode');
  if (paramMode) {
    gameMode = paramMode;
    $("#play-mode-select").val(gameMode);
    onGameModeChange();
  }

  // Sin ID explícito en la URL: no se auto-carga ninguna partida real (crear/
  // unirse requiere sesión), pero se muestra el tablero inicial como vitrina.
  if (currentGameId) {
    loadGameFromAPI(currentGameId);
  } else {
    showWelcomeBoard();
  }
}

// Audio Synthesizer con Web Audio API
let isSoundEnabled = true;
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playChessSound(type) {
  if (!isSoundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'move') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.06);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === 'capture') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'check') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1174, now + 0.07);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'victory') {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, now + i * 0.09);
        g.gain.setValueAtTime(0.25, now + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.3);
        o.start(now + i * 0.09);
        o.stop(now + i * 0.09 + 0.3);
      });
    } else if (type === 'bot') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  } catch (e) {
    console.warn("Audio Web API bloqueado o no soportado:", e);
  }
}

function toggleSound() {
  isSoundEnabled = !isSoundEnabled;
  const btn = document.getElementById("btn-toggle-sound");
  if (btn) {
    btn.innerHTML = isSoundEnabled ? "🔊 Sonido: ON" : "🔇 Sonido: OFF";
  }
  if (isSoundEnabled) playChessSound('bot');
}

function flipBoard() {
  $("#chess").toggleClass("flipped");
  $(".board-coords-left, .board-coords-right, .board-coords-top, .board-coords-bottom").toggleClass("flipped");
  playChessSound('move');
}

/**
 * Genera el casillero 8x8 en el DOM con colores estándar de ajedrez
 */
function buildGrid() {
  chess.empty();
  for (let i = 0; i < data.board.cols; i++) {
    let colHtml = `<div id="${data.cols[i]}" class="col">`;
    for (let j = 0; j < data.board.rows; j++) {
      const squareId = `${data.cols[i]}${j + 1}`;
      // En ajedrez estándar, a1 (i=0, j=0) es casilla oscura (dark), b1 es clara (light)
      const isLight = (i + j) % 2 === 1;
      const colorClass = isLight ? "light white" : "dark black";
      colHtml += `<div id="${squareId}" col="${i + 1}" row="${j + 1}" class="cell ${colorClass}" ondrop="drop(event)" ondragover="allowDrop(event)"></div>`;
    }
    colHtml += `</div>`;
    chess.append(colHtml);
  }
}

/**
 * Genera el estado inicial de piezas estándar
 */
function buildInitialPieces() {
  const board = {};
  for (let c = 1; c <= 8; c++) {
    for (let r = 1; r <= 8; r++) {
      board[`${data.cols[c - 1]}${r}`] = null;
    }
  }

  // Blancas
  board['a1'] = { id: 'tw1', name: 'tower', side: 'white', symbol: '♜', points: 5, col: 1, row: 1 };
  board['b1'] = { id: 'hw1', name: 'horse', side: 'white', symbol: '♞', points: 3, col: 2, row: 1 };
  board['c1'] = { id: 'bw1', name: 'bishop', side: 'white', symbol: '♝', points: 3, col: 3, row: 1 };
  board['d1'] = { id: 'qw',  name: 'queen', side: 'white', symbol: '♛', points: 9, col: 4, row: 1 };
  board['e1'] = { id: 'kw',  name: 'king', side: 'white', symbol: '♚', points: 34, col: 5, row: 1 };
  board['f1'] = { id: 'bw2', name: 'bishop', side: 'white', symbol: '♝', points: 3, col: 6, row: 1 };
  board['g1'] = { id: 'hw2', name: 'horse', side: 'white', symbol: '♞', points: 3, col: 7, row: 1 };
  board['h1'] = { id: 'tw2', name: 'tower', side: 'white', symbol: '♜', points: 5, col: 8, row: 1 };

  for (let c = 1; c <= 8; c++) {
    board[`${data.cols[c - 1]}2`] = { id: `pw${c}`, name: 'pawn', side: 'white', symbol: '♟', points: 1, col: c, row: 2 };
  }

  // Negras
  board['a8'] = { id: 'tb1', name: 'tower', side: 'black', symbol: '♜', points: 5, col: 1, row: 8 };
  board['b8'] = { id: 'hb1', name: 'horse', side: 'black', symbol: '♞', points: 3, col: 2, row: 8 };
  board['c8'] = { id: 'bb1', name: 'bishop', side: 'black', symbol: '♝', points: 3, col: 3, row: 8 };
  board['d8'] = { id: 'qb',  name: 'queen', side: 'black', symbol: '♛', points: 9, col: 4, row: 8 };
  board['e8'] = { id: 'kb',  name: 'king', side: 'black', symbol: '♚', points: 34, col: 5, row: 8 };
  board['f8'] = { id: 'bb2', name: 'bishop', side: 'black', symbol: '♝', points: 3, col: 6, row: 8 };
  board['g8'] = { id: 'hb2', name: 'horse', side: 'black', symbol: '♞', points: 3, col: 7, row: 8 };
  board['h8'] = { id: 'tb2', name: 'tower', side: 'black', symbol: '♜', points: 5, col: 8, row: 8 };

  for (let c = 1; c <= 8; c++) {
    board[`${data.cols[c - 1]}7`] = { id: `pb${c}`, name: 'pawn', side: 'black', symbol: '♟', points: 1, col: c, row: 7 };
  }

  return board;
}

/**
 * Muestra el tablero en su posición inicial como vitrina, sin crear ninguna
 * partida real en el servidor. Se usa cuando no hay ID de partida en la URL.
 */
function showWelcomeBoard() {
  $("#welcome-banner").css("display", "flex");
  buildGrid();

  const board = buildInitialPieces();
  for (const [square, piece] of Object.entries(board)) {
    if (piece) {
      const cell = $(`#${square}`);
      const iconHtml = `<icon id="${piece.id}" title="${piece.name} (${piece.side})" side="${piece.side}" name="${piece.name}" symbol="${piece.symbol || ''}" class="${piece.name} ${piece.side}" row="${piece.row}" col="${piece.col}" points="${piece.points}" state="initial" draggable="false" />`;
      cell.html(iconHtml);
    }
  }

  turnLabel.html('♟️ Sin partida activa').css("color", "#67e8f9");
  $("#api-status-text").text("Esperando partida");
  $("#turn-status-text").text("Estado:");
  $("#white-player-name").text("Blancas (Sin asignar)");
  $("#white-player-elo").text("--");
  $("#black-player-name").text("Negras (Sin asignar)");
  $("#black-player-elo").text("--");
}

/**
 * Reconstruye el tablero hasta la jugada 'step'
 */
function computeBoardAtStep(step) {
  const b = buildInitialPieces();
  const count = Math.min(step, allMovements.length);

  for (let i = 0; i < count; i++) {
    const m = allMovements[i];
    if (!m || !m.from || !m.to) continue;

    const piece = b[m.from];
    if (piece) {
      const toCol = data.cols.indexOf(m.to[0].toLowerCase()) + 1;
      const toRow = parseInt(m.to[1], 10);
      b[m.to] = {
        ...piece,
        col: toCol,
        row: toRow,
        state: 'moved'
      };
      b[m.from] = null;
    }
  }

  return b;
}

/**
 * Actualiza la URL del navegador para incluir el ID de la partida (/game/<id>),
 * sin recargar la página, permitiendo compartir el enlace o recargar sin perderla.
 */
function updateGameUrl(gameId) {
  const targetPath = `/game/${encodeURIComponent(gameId)}`;
  if (window.location.pathname !== targetPath) {
    window.history.pushState({ gameId }, '', targetPath);
  }
}

/**
 * Consulta el estado de la partida desde el API y renderiza el tablero
 */
function loadGameFromAPI(gameId) {
  if (!gameId) return;

  if (clockedGameId !== gameId) {
    resetClocks();
    clockedGameId = gameId;
  }

  currentGameId = gameId;
  updateGameUrl(gameId);

  fetch(`/api/status/${encodeURIComponent(gameId)}`)
    .then((res) => {
      if (res.status === 404) throw new Error("Esa partida no existe.");
      if (!res.ok) throw new Error("No se pudo obtener el estado de la partida");
      return res.json();
    })
    .then((res) => {
      if (res.success && res.data) {
        latestLiveGame = res.data;
        allMovements = res.data.movements || [];

        if (!isHistoryMode) {
          renderGameState(res.data);
          checkAutoBotMove(res.data);
        } else {
          // Si estaba en modo historial, solo actualizar la lista de movimientos y controles
          renderMovementsTable(allMovements, currentMovementsPage);
        }

        $("#api-status-badge").text(`Partida: ${res.data.status}`).css("background", res.data.status === "IN_PROGRESS" ? "#4CAF50" : "#ff9800");
      }
    })
    .catch((err) => {
      console.error("Error al cargar la partida desde la API:", err);
      $("#api-status-badge").text("Error de Conexión").css("background", "#f44336");
      messageShow("Error al conectar con la API");
    });
}

/**
 * Bucle de sincronización periódica en tiempo real
 */
function startSyncLoop() {
  if (syncTimer) clearInterval(syncTimer);

  syncTimer = setInterval(() => {
    if (!currentGameId || isBotMoving) return;

    fetch(`/api/status/${encodeURIComponent(currentGameId)}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          latestLiveGame = res.data;
          allMovements = res.data.movements || [];

          // Si el servidor avanzó de jugada y NO estamos en modo historial, actualizar
          if (!isHistoryMode && res.data.turn_count !== data.turn) {
            renderGameState(res.data);
            checkAutoBotMove(res.data);
          }
        }
      })
      .catch(() => {});
  }, 1200);
}

/**
 * Reinicia la partida en el backend
 */
function resetGameAPI(gameId) {
  if (!gameId) gameId = currentGameId;
  exitHistoryMode();

  fetch(`/api/games/${encodeURIComponent(gameId)}/reset`, {
    method: "POST",
    headers: authToken ? { "Authorization": `Bearer ${authToken}` } : {}
  })
    .then((res) => res.json())
    .then((res) => {
      if (res.success && res.data) {
        latestLiveGame = res.data;
        allMovements = [];
        resetClocks();
        renderGameState(res.data);
        messageShow("Partida Reiniciada");
        checkAutoBotMove(res.data);
      } else {
        messageShow(res.error?.message || "No se pudo reiniciar la partida");
      }
    })
    .catch((err) => {
      console.error("Error al reiniciar partida:", err);
      messageShow("Error al reiniciar");
    });
}

/**
 * Verifica si corresponde al robot mover automáticamente. El robot juega solo
 * como oponente: se mueve solo cuando es el turno del bando contrario al del
 * jugador humano. El botón "Mover Robot" sigue disponible para forzar ese
 * mismo movimiento manualmente, pero nunca mueve el bando del jugador humano.
 */
function checkAutoBotMove(gameState) {
  if (isHistoryMode || gameMode !== "bot" || isBotMoving) return;
  if (gameState.status !== "IN_PROGRESS") return;

  const botSide = myPlayerSide === "white" ? "black" : (myPlayerSide === "black" ? "white" : null);

  if (botSide && gameState.turn === botSide) {
    isBotMoving = true;
    $("#sync-status").text("🤖 Robot pensando...");
    setTimeout(() => {
      triggerBotMove();
    }, 600);
  }
}

/**
 * Solicita a la API que la IA (Robot) ejecute un movimiento.
 * El robot solo puede jugar como oponente: únicamente mueve el bando contrario
 * al del jugador humano, nunca el bando del propio jugador.
 */
function triggerBotMove() {
  if (isHistoryMode) return;

  if (gameMode === "bot" && latestLiveGame) {
    const botSide = myPlayerSide === "white" ? "black" : (myPlayerSide === "black" ? "white" : null);
    if (botSide && latestLiveGame.turn !== botSide) {
      messageShow("Es tu turno. El robot solo puede mover como tu oponente.");
      return;
    }
  }

  const difficulty = parseInt($("#bot-difficulty").val(), 10) || 5;
  isBotMoving = true;
  $("#btn-trigger-bot").prop("disabled", true);
  $("#sync-status").text("🤖 Robot calculando...");

  fetch(`/api/games/${encodeURIComponent(currentGameId)}/bot-move`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {})
    },
    body: JSON.stringify({ difficulty })
  })
    .then((res) => res.json())
    .then((res) => {
      isBotMoving = false;
      $("#btn-trigger-bot").prop("disabled", false);
      $("#sync-status").text("🔄 Sincronización activa");

      if (res.success && res.data) {
        latestLiveGame = res.data.game;
        allMovements = res.data.game.movements || [];
        renderGameState(res.data.game);
        const san = res.data.applied_move ? res.data.applied_move.san : "movimiento";
        const levelName = res.data.bot_level_name ? ` (${res.data.bot_level_name})` : ` (Nivel ${difficulty})`;
        messageShow(`🤖 Robot${levelName} jugó: ${san}`);

        if (res.data.applied_move && res.data.applied_move.captured) {
          playChessSound('capture');
        } else if (res.data.game.status === 'CHECKMATE') {
          playChessSound('victory');
        } else if (res.data.game.in_check) {
          playChessSound('check');
        } else {
          playChessSound('bot');
        }
      } else {
        messageShow(res.error?.message || "Robot no pudo mover");
      }
    })
    .catch((err) => {
      isBotMoving = false;
      $("#btn-trigger-bot").prop("disabled", false);
      $("#sync-status").text("🔄 Sincronización activa");
      console.error("Error en movimiento del robot:", err);
      messageShow("Error al comunicar con Robot IA");
    });
}

function onGameModeChange() {
  gameMode = $("#play-mode-select").val();
  if (gameMode === "bot") {
    $("#bot-options").show();
    $("#btn-trigger-bot").show();
  } else {
    $("#bot-options").hide();
    $("#btn-trigger-bot").hide();
  }
}

function onPlayerSideChange() {
  myPlayerSide = $("#player-side-select").val();
  fetch(`/api/status/${encodeURIComponent(currentGameId)}`)
    .then(r => r.json())
    .then(r => { if (r.success) checkAutoBotMove(r.data); });
}

/**
 * Traduce el código de motivo de tablas devuelto por el backend a un texto legible en español
 */
function drawReasonLabel(drawReason) {
  switch (drawReason) {
    case 'INSUFFICIENT_MATERIAL': return 'Material Insuficiente';
    case 'FIFTY_MOVE_RULE': return 'Regla de 50 Movimientos';
    case 'THREEFOLD_REPETITION': return 'Triple Repetición';
    default: return 'Rey Ahogado';
  }
}

/**
 * Renderiza el estado completo retornado por la API en la interfaz gráfica (Modo En Vivo)
 */
function renderGameState(gameState) {
  $("#welcome-banner").hide();

  if ($(".cell").length === 0) {
    buildGrid();
  } else {
    $(".cell").empty();
  }

  // Limpiar resaltados previos de jugadas y jaque
  $(".cell").removeClass("last-move-from last-move-to in-check-king winner-king");

  const isGameFinished = gameState.status === 'CHECKMATE' || gameState.status === 'STALEMATE' || gameState.status === 'RESIGNED';
  const canDragPieces = !isGameFinished && !isHistoryMode && gameState.status !== 'WAITING_FOR_PLAYER';

  // Colocar piezas activas desde el tablero del backend
  if (gameState.board) {
    for (const [square, piece] of Object.entries(gameState.board)) {
      if (piece) {
        const cell = $(`#${square}`);
        if (cell.length > 0) {
          const iconHtml = `<icon id="${piece.id}" title="${piece.name} (${piece.side})" side="${piece.side}" name="${piece.name}" symbol="${piece.symbol || ''}" class="${piece.name} ${piece.side}" row="${piece.row}" col="${piece.col}" points="${piece.points}" state="${piece.state || 'initial'}" draggable="${canDragPieces}" ondragstart="drag(event)" />`;
          cell.html(iconHtml);
        }
      }
    }
  }

  // Resaltar última jugada (casilla origen y destino)
  if (gameState.movements && gameState.movements.length > 0) {
    const lastM = gameState.movements[gameState.movements.length - 1];
    if (lastM && lastM.from && lastM.to) {
      $(`#${lastM.from}`).addClass("last-move-from");
      $(`#${lastM.to}`).addClass("last-move-to");
    }
  }

  // Resaltar Rey en Jaque / Jaque Mate
  if (gameState.status === 'CHECKMATE') {
    // gameState.turn queda fijo en el bando GANADOR al finalizar la partida,
    // así que el bando en jaque mate (perdedor) es el contrario.
    const loserSide = gameState.winner === 'white' ? 'black' : 'white';
    $(`icon.king.${loserSide}`).parent().addClass("in-check-king");
    $(`icon.king.${gameState.winner}`).parent().addClass("winner-king");
  } else if (gameState.in_check) {
    $(`icon.king.${gameState.turn}`).parent().addClass("in-check-king");
  }

  data.turn = gameState.turn_count;
  data.side = gameState.turn;
  quantityLabel.html(data.turn);

  // Actualizar indicadores según estado de la partida
  const isWhite = gameState.turn === 'white';
  if (gameState.status === 'CHECKMATE') {
    const winnerLabel = gameState.winner === 'white' ? 'Blancas' : 'Negras';
    turnLabel.html(`🏆 Ganó ${winnerLabel}`).css("color", "#ffeb3b");
    $("#api-status-text").text(`🏆 Mate - ${winnerLabel}`);
    $("#turn-status-text").text("Ganador:");
    stopClock();
    announceGameEnd('CHECKMATE', gameState);
  } else if (gameState.status === 'STALEMATE') {
    const reasonLabel = drawReasonLabel(gameState.draw_reason);
    turnLabel.html("🤝 Tablas").css("color", "#90caf9");
    $("#api-status-text").text(`🤝 Tablas por ${reasonLabel}`);
    $("#turn-status-text").text("Fin:");
    stopClock();
    announceGameEnd('STALEMATE', gameState);
  } else if (gameState.status === 'RESIGNED') {
    const winnerLabel = gameState.winner === 'white' ? 'Blancas' : 'Negras';
    turnLabel.html(`🏳️ Ganó ${winnerLabel}`).css("color", "#fb7185");
    $("#api-status-text").text(`🏳️ Rendición - Ganó ${winnerLabel}`);
    $("#turn-status-text").text("Fin:");
    stopClock();
    announceGameEnd('RESIGNED', gameState);
  } else if (gameState.status === 'WAITING_FOR_PLAYER') {
    turnLabel.html('⏳ Esperando rival...').css("color", "#fbbf24");
    $("#api-status-text").text('⏳ Esperando al segundo jugador');
    $("#turn-status-text").text("Estado:");
  } else {
    $("#turn-status-text").text("Turno:");
    if (gameState.in_check) {
      turnLabel.html(`⚠️ ${isWhite ? 'Blancas' : 'Negras'} (JAQUE)`).css("color", "#f43f5e");
      $("#api-status-text").text(`⚠️ ¡Jaque a ${isWhite ? 'Blancas' : 'Negras'}!`);
    } else {
      turnLabel.html(isWhite ? '⚪ Blancas' : '⚫ Negras').css("color", "#f1f5f9");
      $("#api-status-text").text(`Partida: ${gameState.status}`);
    }
  }

  // Actualizar tarjetas HUD de jugadores
  if (gameState.white_player) {
    $("#white-player-name").text(gameState.white_player.name);
    $("#white-player-elo").text(gameState.white_player.rating || 1200);
  } else {
    $("#white-player-name").text("Blancas (Esperando)");
    $("#white-player-elo").text("--");
  }

  if (gameState.game_type === "bot") {
    const diff = $("#bot-difficulty").val() || "5";
    const diffText = $(`#bot-difficulty option[value='${diff}']`).text().split(':')[0] || `Nivel ${diff}`;
    $("#black-player-name").html(`Robot IA <span style="font-size:10px; color:#a855f7; font-weight:600;">(${diffText})</span>`);
    $("#black-player-elo").text(1000 + parseInt(diff, 10) * 120);
  } else if (gameState.black_player) {
    $("#black-player-name").text(gameState.black_player.name);
    $("#black-player-elo").text(gameState.black_player.rating || 1200);
  } else {
    $("#black-player-name").text("Negras (Esperando rival)");
    $("#black-player-elo").text("1200");
  }

  // Brillo de turno activo en tarjetas de jugador
  if (isWhite) {
    $("#white-player-card").addClass("active-turn");
    $("#black-player-card").removeClass("active-turn");
    $("#turn-indicator-dot").css({ background: "#ffffff", boxShadow: "0 0 10px #ffffff" });
  } else {
    $("#black-player-card").addClass("active-turn");
    $("#white-player-card").removeClass("active-turn");
    $("#turn-indicator-dot").css({ background: "#00e5ff", boxShadow: "0 0 10px #00e5ff" });
  }

  white_points = gameState.points ? gameState.points.white : 0;
  black_points = gameState.points ? gameState.points.black : 0;
  $("#white_points").html(white_points);
  $("#black_points").html(black_points);

  // Renderizar piezas capturadas y diferencial de material
  renderCapturedPiecesRack(gameState);

  allMovements = gameState.movements || [];
  $("#movements-total-counter").text(`${allMovements.length} Jugadas`);
  renderMovementsTable(allMovements, currentMovementsPage);
  updateHistoryNavigationUI();
}

/**
 * Renderiza el rack de capturas y diferencial de puntos de material (+N)
 */
function renderCapturedPiecesRack(gameState) {
  const whiteRack = $("#white-captures-rack");
  const blackRack = $("#black-captures-rack");
  whiteRack.empty();
  blackRack.empty();

  const whiteDiff = white_points - black_points;
  const blackDiff = black_points - white_points;

  if (whiteDiff > 0) {
    whiteRack.append(`<span class="material-diff-badge">+${whiteDiff}</span>`);
  }
  if (blackDiff > 0) {
    blackRack.append(`<span class="material-diff-badge">+${blackDiff}</span>`);
  }
}

/**
 * Renderiza una posición histórica (Solo Lectura) sin permitir movimientos
 */
function renderHistoricalStep(step) {
  const total = allMovements.length;

  if (step === undefined || step === null || step >= total) {
    exitHistoryMode();
    return;
  }

  isHistoryMode = true;
  currentHistoryStep = Math.max(0, parseInt(step, 10));

  const historicalBoard = computeBoardAtStep(currentHistoryStep);

  // Renderizar piezas con draggable="false" estricto
  if ($(".cell").length === 0) {
    buildGrid();
  } else {
    $(".cell").empty();
  }

  for (const [square, piece] of Object.entries(historicalBoard)) {
    if (piece) {
      const cell = $(`#${square}`);
      if (cell.length > 0) {
        // En modo historial draggable es FALSE (no modificable)
        const iconHtml = `<icon id="${piece.id}" title="${piece.name} (Solo lectura)" side="${piece.side}" name="${piece.name}" symbol="${piece.symbol || ''}" class="${piece.name} ${piece.side}" row="${piece.row}" col="${piece.col}" points="${piece.points}" state="history" draggable="false" style="cursor: default;" />`;
        cell.html(iconHtml);
      }
    }
  }

  // Actualizar turno visible según jugada histórica
  const histSide = currentHistoryStep % 2 === 0 ? "white" : "black";
  turnLabel.html(`${histSide} (Historial)`);
  quantityLabel.html(currentHistoryStep);

  // Mostrar aviso de Solo Lectura
  $("#history-banner").show();
  $("#history-step-num").text(currentHistoryStep);
  $("#history-indicator").text(`Jugada #${currentHistoryStep} / ${total}`).css("color", "#ff9800");

  updateHistoryNavigationUI();
  renderMovementsTable(allMovements, currentMovementsPage);
  messageShow(`Viendo jugada #${currentHistoryStep} (Solo Lectura)`);
}

/**
 * Sale del modo historial y vuelve a la partida en vivo
 */
function exitHistoryMode() {
  isHistoryMode = false;
  currentHistoryStep = null;

  $("#history-banner").hide();
  $("#history-indicator").text(`En vivo (#${allMovements.length})`).css("color", "#4CAF50");

  updateHistoryNavigationUI();

  if (latestLiveGame) {
    renderGameState(latestLiveGame);
    messageShow("Modo En Vivo Restaurado");
  } else {
    loadGameFromAPI(currentGameId);
  }
}

/**
 * Control de navegación por botones
 */
function navigateHistory(action) {
  const total = allMovements.length;
  if (total === 0) {
    messageShow("Sin movimientos registrados");
    return;
  }

  if (action === 'start') {
    renderHistoricalStep(0);
  } else if (action === 'end') {
    exitHistoryMode();
  } else if (action === 'prev') {
    if (!isHistoryMode) {
      renderHistoricalStep(total - 1);
    } else {
      renderHistoricalStep(Math.max(0, currentHistoryStep - 1));
    }
  } else if (action === 'next') {
    if (!isHistoryMode) {
      messageShow("Ya estás en la jugada en vivo más reciente");
      return;
    }
    const nextStep = currentHistoryStep + 1;
    if (nextStep >= total) {
      exitHistoryMode();
    } else {
      renderHistoricalStep(nextStep);
    }
  }
}

/**
 * Actualiza los botones de navegación anterior/siguiente según el estado actual
 */
function updateHistoryNavigationUI() {
  const total = allMovements.length;

  if (total === 0) {
    $("#btn-hist-start, #btn-hist-prev, #btn-hist-next, #btn-hist-end").prop("disabled", true);
    $("#history-indicator").text("Sin jugadas");
    return;
  }

  $("#btn-hist-start, #btn-hist-prev, #btn-hist-next, #btn-hist-end").prop("disabled", false);

  if (!isHistoryMode) {
    $("#btn-hist-next, #btn-hist-end").prop("disabled", true);
    $("#history-indicator").text(`En vivo (#${total})`).css("color", "#4CAF50");
  } else {
    if (currentHistoryStep <= 0) {
      $("#btn-hist-start, #btn-hist-prev").prop("disabled", true);
    }
    if (currentHistoryStep >= total) {
      $("#btn-hist-next, #btn-hist-end").prop("disabled", true);
    }
  }
}

/**
 * Renderiza la tabla de movimientos paginada en orden descendente (los más recientes primero)
 */
function renderMovementsTable(movements, page) {
  if (Array.isArray(movements)) {
    allMovements = movements;
  }
  if (page) {
    currentMovementsPage = page;
  }

  const total = allMovements.length;
  const totalPages = Math.ceil(total / movementsPerPage) || 1;

  if (currentMovementsPage > totalPages) currentMovementsPage = totalPages;
  if (currentMovementsPage < 1) currentMovementsPage = 1;

  // Orden descendente estricto: los movimientos más recientes se muestran arriba
  const descendingMovements = [...allMovements].reverse();

  // Obtener los 10 movimientos de la página actual
  const startIndex = (currentMovementsPage - 1) * movementsPerPage;
  const endIndex = Math.min(startIndex + movementsPerPage, total);
  const pageItems = descendingMovements.slice(startIndex, endIndex);

  const tableBody = $("#movements tbody");
  tableBody.empty();

  if (total === 0) {
    tableBody.append(`<tr><td colspan="4" style="color: #888; padding: 15px; font-family: sans-serif;">Sin movimientos registrados</td></tr>`);
  } else {
    pageItems.forEach((mov) => {
      const val = mov.san || mov.classic_val || (mov.id + " -> " + mov.to);
      const timeStr = mov.time || "";
      const isSelected = isHistoryMode && currentHistoryStep === mov.turn;
      const rowStyle = isSelected ? "background: #ffe082; font-weight: bold; border-left: 4px solid #ff9800; cursor: pointer;" : "cursor: pointer;";

      const row = `<tr onclick="renderHistoricalStep(${mov.turn})" style="${rowStyle}" title="Clic para ver tablero tras la jugada #${mov.turn}">
        <td style="font-weight: bold; color: #1976D2;">#${mov.turn}</td>
        <td>${mov.side === "white" ? val : ""}</td>
        <td>${mov.side === "black" ? val : ""}</td>
        <td>${timeStr}</td>
      </tr>`;
      tableBody.append(row);
    });
  }

  renderPaginationControls(totalPages, total);
}

/**
 * Renderiza los botones de paginación
 */
function renderPaginationControls(totalPages, totalMovements) {
  const container = $("#movements-pagination");
  container.empty();

  if (totalMovements === 0) {
    container.html(`<span class="pagination-info">0 movimientos</span>`);
    return;
  }

  const infoHtml = `<span class="pagination-info">Página ${currentMovementsPage}/${totalPages}</span>`;

  let buttonsHtml = `<div class="pagination-controls">`;
  const prevDisabled = currentMovementsPage <= 1 ? "disabled" : "";
  buttonsHtml += `<button class="pagination-btn" ${prevDisabled} onclick="goToMovementsPage(${currentMovementsPage - 1})">Ant.</button>`;

  // Ventana deslizante de máximo 5 botones numéricos, centrada en la página actual
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentMovementsPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
  startPage = Math.max(1, endPage - maxVisiblePages + 1);

  for (let p = startPage; p <= endPage; p++) {
    const activeClass = p === currentMovementsPage ? "active" : "";
    buttonsHtml += `<button class="pagination-btn ${activeClass}" onclick="goToMovementsPage(${p})">${p}</button>`;
  }

  const nextDisabled = currentMovementsPage >= totalPages ? "disabled" : "";
  buttonsHtml += `<button class="pagination-btn" ${nextDisabled} onclick="goToMovementsPage(${currentMovementsPage + 1})">Sig.</button>`;
  buttonsHtml += `</div>`;

  container.html(`${infoHtml}${buttonsHtml}`);
}

function goToMovementsPage(page) {
  currentMovementsPage = page;
  renderMovementsTable(null, page);
}

function addToMovementsTable(movement) {
  if (movement) {
    const exists = allMovements.some(m => m.turn === movement.turn && m.from === movement.from && m.to === movement.to);
    if (!exists) {
      allMovements.push(movement);
    }
    currentMovementsPage = 1;
    renderMovementsTable(allMovements, 1);
    updateHistoryNavigationUI();
  }
}

function allowDrop(ev) {
  ev.preventDefault();
}

function drag(ev) {
  // BLOQUEO SI LA PARTIDA YA TERMINÓ (Jaque Mate, Ahogado, Rendición)
  if (latestLiveGame && (latestLiveGame.status === 'CHECKMATE' || latestLiveGame.status === 'STALEMATE' || latestLiveGame.status === 'RESIGNED')) {
    ev.preventDefault();
    const win = latestLiveGame.winner === 'white' ? 'Blancas' : (latestLiveGame.winner === 'black' ? 'Negras' : 'Tablas');
    messageShow(`Partida finalizada por ${latestLiveGame.status}. Ganador: ${win}`);
    return;
  }

  // BLOQUEO ESTRICTO EN MODO HISTORIAL (SOLO LECTURA)
  if (isHistoryMode) {
    ev.preventDefault();
    messageShow("Estás en modo historial (Solo Lectura). No puedes mover piezas.");
    return;
  }

  const pieceSide = ev.target.getAttribute("side");

  if (myPlayerSide !== "both" && pieceSide !== myPlayerSide) {
    ev.preventDefault();
    messageShow(`Tu bando es ${myPlayerSide === 'white' ? 'blancas' : 'negras'}`);
    return;
  }

  if (pieceSide.includes(data.side)) {
    ev.dataTransfer.setData("id", ev.target.id);
  }
}

function messageShow(msg) {
  document.getElementById("message").innerHTML = msg;
  let overlay = document.getElementById("overlay");
  overlay.style.display = "block";
  setTimeout(() => {
    overlay.style.display = 'none';
  }, 2200);
}

// ==========================================================
// BANNER VISTOSO DE FIN DE PARTIDA (JAQUE MATE / TABLAS / RENDICIÓN)
// ==========================================================

/**
 * Dispara el banner de fin de partida una sola vez por evento real,
 * evitando que se repita en cada re-render del mismo estado.
 */
function announceGameEnd(status, gameState) {
  const key = `${currentGameId}:${status}:${gameState.turn_count}:${gameState.winner || ''}`;
  if (lastAnnouncedGameEndKey === key) return;
  lastAnnouncedGameEndKey = key;
  showEndgameBanner(status, gameState);
}

function showEndgameBanner(status, gameState) {
  const overlay = document.getElementById("endgame-overlay");
  if (!overlay) return;

  const winnerLabel = gameState.winner === 'white' ? 'Blancas' : (gameState.winner === 'black' ? 'Negras' : 'Tablas');
  overlay.classList.remove('result-win', 'result-draw', 'result-resign');

  let icon = '🏆';
  let title = '¡JAQUE MATE!';
  let subtitle = `Ganador: ${winnerLabel}`;
  let resultClass = 'result-win';
  let spawnConfetti = true;

  if (status === 'STALEMATE') {
    icon = '🤝';
    title = '¡TABLAS!';
    subtitle = drawReasonLabel(gameState.draw_reason);
    resultClass = 'result-draw';
    spawnConfetti = false;
  } else if (status === 'RESIGNED') {
    icon = '🏳️';
    title = '¡RENDICIÓN!';
    subtitle = `Ganador: ${winnerLabel}`;
    resultClass = 'result-resign';
    spawnConfetti = false;
  }

  document.getElementById("endgame-icon").textContent = icon;
  document.getElementById("endgame-title").textContent = title;
  document.getElementById("endgame-subtitle").textContent = subtitle;
  document.getElementById("endgame-meta").textContent = `Partida ${currentGameId} · ${gameState.turn_count} jugadas`;
  overlay.classList.add(resultClass);

  spawnEndgameConfetti(spawnConfetti);

  overlay.style.display = "flex";
}

function closeEndgameBanner() {
  const overlay = document.getElementById("endgame-overlay");
  if (overlay) overlay.style.display = "none";
}

/**
 * Genera piezas de confeti CSS animado dentro del banner cuando hay un ganador claro (Jaque Mate).
 */
function spawnEndgameConfetti(enabled) {
  const container = document.getElementById("endgame-confetti");
  if (!container) return;
  container.innerHTML = "";
  if (!enabled) return;

  const colors = ['#ffeb3b', '#00e5ff', '#a855f7', '#f43f5e', '#10b981', '#f59e0b'];
  const pieceCount = 26;
  for (let i = 0; i < pieceCount; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    piece.style.animationDelay = `${Math.random() * 0.6}s`;
    container.appendChild(piece);
  }
}

// ==========================================================
// CAPTURA DE FOTO DEL TABLERO (SCREENSHOT)
// ==========================================================

/**
 * Captura el tablero (incluyendo bisel y coordenadas) como imagen PNG
 * y dispara la descarga en el navegador. Disponible en cualquier momento de la partida.
 */
function captureBoardPhoto() {
  const target = document.querySelector('.board-bezel-wrapper') || document.getElementById('chess');
  if (!target) {
    messageShow("No se encontró el tablero para capturar");
    return;
  }
  if (typeof html2canvas !== 'function') {
    messageShow("La librería de captura no está disponible");
    return;
  }

  messageShow("📸 Capturando tablero...");

  html2canvas(target, {
    backgroundColor: '#0b111c',
    scale: Math.min(2, window.devicePixelRatio || 1.5),
    useCORS: true
  }).then((canvas) => {
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `flexbox-chess_${currentGameId}_${timestamp}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    messageShow("✅ Foto del tablero guardada");
  }).catch((err) => {
    console.error("Error al capturar el tablero:", err);
    messageShow("Error al generar la foto del tablero");
  });
}

// ==========================================================
// MÓDULO DE USUARIOS, AUTENTICACIÓN Y PARTIDAS POR USUARIO
// ==========================================================

/**
 * Inicializa el estado de autenticación al cargar la página
 */
function initAuth() {
  renderAuthUI();

  if (authToken) {
    fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          currentUser = res.data;
          localStorage.setItem('chess_auth_user', JSON.stringify(currentUser));
          renderAuthUI();
          claimCurrentGame();
          connectAppSocket();
          refreshPendingInvites();
        } else {
          // Token expirado o inválido
          logoutUser(false);
        }
      })
      .catch(() => {
        renderAuthUI();
      });
  }
}

/**
 * Reclama a nombre del usuario autenticado el bando con el que está jugando
 * en la partida actual, cubriendo el caso de haber empezado como invitado
 * y luego iniciado sesión. No hace nada si ese bando ya pertenece a otro
 * usuario registrado, o si se está jugando en modo "Ambos (Local)".
 */
function claimCurrentGame() {
  if (!authToken || !currentGameId || myPlayerSide === "both") return;

  fetch(`/api/games/${encodeURIComponent(currentGameId)}/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authToken}`
    },
    body: JSON.stringify({ side: myPlayerSide })
  })
    .then((res) => res.json())
    .then((res) => {
      if (res.success && res.data) {
        latestLiveGame = res.data;
        renderGameState(res.data);
      }
    })
    .catch(() => {});
}

/**
 * Actualiza la barra superior reflejando si hay usuario conectado o invitado
 */
function renderAuthUI() {
  if (currentUser) {
    $("#user-guest-controls").hide();
    $("#user-logged-controls").css("display", "inline-flex");
    $("#current-user-name").text(currentUser.name || currentUser.username);
    $("#current-user-rating").text(currentUser.rating || 1200);
    renderInviteBadge();
  } else {
    $("#user-guest-controls").css("display", "inline-flex");
    $("#user-logged-controls").hide();
  }
}

/**
 * Abre el modal de autenticación en la pestaña indicada ('login' o 'register')
 */
function openAuthModal(tab = 'login') {
  switchAuthTab(tab);
  $("#auth-alert").hide().text("").removeClass("error success");
  $("#auth-modal").fadeIn(150);
}

/**
 * Cierra el modal de autenticación
 */
function closeAuthModal() {
  $("#auth-modal").fadeOut(150);
}

/**
 * Alterna entre pestañas de Login y Registro
 */
function switchAuthTab(tab) {
  $("#auth-alert").hide();
  if (tab === 'login') {
    $("#tab-login").addClass("active");
    $("#tab-register").removeClass("active");
    $("#form-login").show();
    $("#form-register").hide();
  } else {
    $("#tab-register").addClass("active");
    $("#tab-login").removeClass("active");
    $("#form-register").show();
    $("#form-login").hide();
  }
}

/**
 * Procesa el formulario de inicio de sesión
 */
function submitLogin() {
  const login = $("#login-identifier").val().trim();
  const password = $("#login-password").val();

  if (!login || !password) {
    showAuthAlert("Por favor ingresa usuario y contraseña", "error");
    return;
  }

  $("#btn-submit-login").prop("disabled", true).text("Verificando...");

  fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password })
  })
    .then((res) => res.json())
    .then((res) => {
      $("#btn-submit-login").prop("disabled", false).text("Entrar");
      if (res.success && res.data) {
        authToken = res.data.token;
        currentUser = res.data.user;
        localStorage.setItem('chess_auth_token', authToken);
        localStorage.setItem('chess_auth_user', JSON.stringify(currentUser));
        renderAuthUI();
        closeAuthModal();
        messageShow(`¡Bienvenido, ${currentUser.name || currentUser.username}!`);
        claimCurrentGame();
        connectAppSocket();
        refreshPendingInvites();
      } else {
        showAuthAlert(res.error?.message || "Credenciales incorrectas", "error");
      }
    })
    .catch((err) => {
      $("#btn-submit-login").prop("disabled", false).text("Entrar");
      showAuthAlert("Error de conexión con el servidor", "error");
    });
}

/**
 * Procesa el formulario de registro de usuario
 */
function submitRegister() {
  const name = $("#reg-name").val().trim();
  const username = $("#reg-username").val().trim();
  const email = $("#reg-email").val().trim();
  const password = $("#reg-password").val();

  if (!username || !password) {
    showAuthAlert("El usuario y contraseña son requeridos", "error");
    return;
  }

  $("#btn-submit-register").prop("disabled", true).text("Creando cuenta...");

  fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, username, email, password })
  })
    .then((res) => res.json())
    .then((res) => {
      $("#btn-submit-register").prop("disabled", false).text("Crear Cuenta");
      if (res.success && res.data) {
        authToken = res.data.token;
        currentUser = res.data.user;
        localStorage.setItem('chess_auth_token', authToken);
        localStorage.setItem('chess_auth_user', JSON.stringify(currentUser));
        renderAuthUI();
        closeAuthModal();
        messageShow(`¡Cuenta creada con éxito! Bienvenido, ${currentUser.name}!`);
        claimCurrentGame();
        connectAppSocket();
        refreshPendingInvites();
      } else {
        showAuthAlert(res.error?.message || "Error al crear cuenta", "error");
      }
    })
    .catch((err) => {
      $("#btn-submit-register").prop("disabled", false).text("Crear Cuenta");
      showAuthAlert("Error de comunicación con el servidor", "error");
    });
}

/**
 * Muestra alertas en el modal de autenticación
 */
function showAuthAlert(msg, type = 'error') {
  $("#auth-alert")
    .removeClass("error success")
    .addClass(type)
    .text(msg)
    .fadeIn(150);
}

/**
 * Cierra la sesión activa del usuario
 */
function logoutUser(notify = true) {
  if (authToken) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    }).catch(() => {});
  }

  authToken = null;
  currentUser = null;
  localStorage.removeItem('chess_auth_token');
  localStorage.removeItem('chess_auth_user');
  pendingInvites = [];
  renderAuthUI();
  if (appSocket) {
    appSocket.disconnect();
    appSocket = null;
  }
  if (notify) messageShow("Sesión cerrada");
}

/**
 * Abre el modal de historial de partidas filtradas por usuario
 */
function openUserGamesModal(targetUserId = null) {
  const userId = targetUserId || (currentUser ? currentUser.id : null);

  // 1. Cargar lista de usuarios para el selector
  fetch('/api/users')
    .then((res) => res.json())
    .then((res) => {
      if (res.success && res.data) {
        const select = $("#user-games-select");
        select.empty();

        res.data.forEach((u) => {
          const isSelected = (userId && u.id === userId) || (!userId && currentUser && u.id === currentUser.id);
          select.append(`<option value="${u.id}" ${isSelected ? 'selected' : ''}>👤 ${u.name} (@${u.username}) - ${u.rating} pts</option>`);
        });

        const activeId = select.val() || userId || (res.data.length > 0 ? res.data[0].id : null);
        if (activeId) {
          loadGamesForSelectedUser(activeId);
        }
      }
    });

  $("#user-games-modal").fadeIn(150);
}

/**
 * Cierra el modal de partidas del usuario
 */
function closeUserGamesModal() {
  $("#user-games-modal").fadeOut(150);
}

/**
 * Evento disparado cuando se cambia el usuario en el selector del modal
 */
function onSelectUserToViewGames() {
  const selectedUserId = $("#user-games-select").val();
  if (selectedUserId) {
    loadGamesForSelectedUser(selectedUserId);
  }
}

/**
 * Refresca la lista de partidas del usuario seleccionado actualmente
 */
function refreshUserGamesList() {
  const selectedUserId = $("#user-games-select").val();
  if (selectedUserId) {
    loadGamesForSelectedUser(selectedUserId);
  }
}

/**
 * Consulta la API y renderiza las partidas y estadísticas de un usuario específico
 */
function loadGamesForSelectedUser(userId) {
  $("#user-games-tbody").html('<tr><td colspan="7" style="text-align: center; color: #aaa; padding: 20px;">Cargando partidas...</td></tr>');

  fetch(`/api/users/${encodeURIComponent(userId)}/games`)
    .then((res) => res.json())
    .then((res) => {
      if (res.success && res.data) {
        renderUserStatsCard(res.data.user, res.data.games);
        renderUserGamesTable(res.data.games);
      } else {
        $("#user-games-tbody").html('<tr><td colspan="7" style="text-align: center; color: #f44336; padding: 20px;">No se pudieron cargar las partidas</td></tr>');
      }
    })
    .catch((err) => {
      console.error("Error cargando partidas de usuario:", err);
      $("#user-games-tbody").html('<tr><td colspan="7" style="text-align: center; color: #f44336; padding: 20px;">Error al conectar con el servidor</td></tr>');
    });
}

/**
 * Renderiza la tarjeta de estadísticas del usuario
 */
function renderUserStatsCard(user, games) {
  if (!user) return;
  const played = user.games_played || games.length || 0;
  const won = user.games_won || games.filter(g => g.result === 'WIN').length || 0;
  const lost = user.games_lost || games.filter(g => g.result === 'LOSS').length || 0;
  const drawn = user.games_drawn || games.filter(g => g.result === 'DRAW').length || 0;
  const winRate = played > 0 ? Math.round((won / played) * 100) : 0;

  const html = `
    <div class="user-stat-box">
      <div class="user-stat-value">${user.rating || 1200}</div>
      <div class="user-stat-label">Rating Elo</div>
    </div>
    <div class="user-stat-box">
      <div class="user-stat-value" style="color: #fff;">${played}</div>
      <div class="user-stat-label">Partidas</div>
    </div>
    <div class="user-stat-box">
      <div class="user-stat-value" style="color: #4CAF50;">${won} (${winRate}%)</div>
      <div class="user-stat-label">Victorias</div>
    </div>
    <div class="user-stat-box">
      <div class="user-stat-value" style="color: #f44336;">${lost}</div>
      <div class="user-stat-label">Derrotas</div>
    </div>
    <div class="user-stat-box">
      <div class="user-stat-value" style="color: #ff9800;">${drawn}</div>
      <div class="user-stat-label">Tablas</div>
    </div>
  `;
  $("#user-stats-summary").html(html);
}

/**
 * Renderiza la tabla con el listado de partidas del usuario
 */
function renderUserGamesTable(games) {
  const tbody = $("#user-games-tbody");
  tbody.empty();

  if (!games || games.length === 0) {
    tbody.html('<tr><td colspan="7" style="text-align: center; color: #aaa; padding: 25px;">No hay partidas registradas para este usuario todavía.</td></tr>');
    return;
  }

  games.forEach((g) => {
    let resultBadge = '';
    if (g.result === 'WIN') {
      resultBadge = '<span class="badge-win">🟢 Victoria</span>';
    } else if (g.result === 'LOSS') {
      resultBadge = '<span class="badge-loss">🔴 Derrota</span>';
    } else if (g.result === 'DRAW') {
      resultBadge = '<span class="badge-draw">🟡 Tablas</span>';
    } else {
      resultBadge = `<span class="badge-inprogress">🔵 En Juego (#${g.movements_count})</span>`;
    }

    const sideBadge = g.user_side === 'white' ? '⚪ Blancas' : '⚫ Negras';
    const opponentName = g.opponent ? (g.opponent.name || g.opponent.username || 'Rival') : 'Robot / Rival';
    const dateFormatted = g.updated_at ? new Date(g.updated_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '-';

    const row = `
      <tr>
        <td style="font-weight: bold; color: #fff;">${g.id}</td>
        <td style="color: #aaa; font-size: 12px;">${dateFormatted}</td>
        <td>${sideBadge}</td>
        <td style="color: #ccc;">${opponentName}</td>
        <td>${resultBadge}</td>
        <td style="color: #aaa;">${g.movements_count} jugadas</td>
        <td style="text-align: center;">
          <button class="btn-load-user-game" onclick="loadGameFromUserHistory('${g.id}')" title="Cargar y abrir partida en el tablero">
            ♟️ Cargar
          </button>
        </td>
      </tr>
    `;
    tbody.append(row);
  });
}

/**
 * Carga una partida del historial del usuario directamente en el tablero
 */
function loadGameFromUserHistory(gameId) {
  closeUserGamesModal();
  $("#game-id-input").val(gameId);
  loadGameFromAPI(gameId);
  messageShow(`Partida cargada: ${gameId}`);
}

// ==========================================
// CONEXIÓN WEBSOCKET Y NOTIFICACIONES DE INVITACIONES
// ==========================================

/**
 * Abre la conexión WebSocket autenticada para recibir notificaciones en tiempo real
 */
function connectAppSocket() {
  if (!authToken || typeof io === 'undefined') return;
  if (appSocket) appSocket.disconnect();

  appSocket = io({ auth: { token: authToken } });

  appSocket.on('invite:received', (invite) => {
    pendingInvites.push(invite);
    renderInviteBadge();
    messageShow(`✉️ ${invite.from_user.name || invite.from_user.username} te invitó a una partida`);
  });

  appSocket.on('invite:accepted', (invite) => {
    messageShow(`✅ ${invite.to_username} aceptó tu invitación`);
  });

  appSocket.on('invite:declined', (invite) => {
    messageShow(`❌ ${invite.to_username} rechazó tu invitación`);
  });
}

/**
 * Actualiza el badge de invitaciones pendientes en la barra superior
 */
function renderInviteBadge() {
  const count = pendingInvites.length;
  $("#invite-badge-count").text(count);
  $("#invite-badge").toggle(count > 0);
}

/**
 * Consulta al servidor las invitaciones pendientes del usuario autenticado
 */
function refreshPendingInvites() {
  if (!authToken) return;
  fetch('/api/invites', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  })
    .then((res) => res.json())
    .then((res) => {
      if (res.success && res.data) {
        pendingInvites = res.data;
        renderInviteBadge();
      }
    })
    .catch(() => {});
}

/**
 * Abre el modal de invitaciones pendientes
 */
function openInvitesModal() {
  refreshPendingInvites();
  renderInvitesList();
  $("#invites-modal").fadeIn(150);
}

/**
 * Cierra el modal de invitaciones pendientes
 */
function closeInvitesModal() {
  $("#invites-modal").fadeOut(150);
}

/**
 * Renderiza la lista de invitaciones pendientes dentro del modal
 */
function renderInvitesList() {
  const container = $("#invites-list");
  container.empty();

  if (pendingInvites.length === 0) {
    container.append('<p style="color: var(--text-muted); text-align: center;">No tienes invitaciones pendientes.</p>');
    return;
  }

  pendingInvites.forEach((invite) => {
    const row = $(`
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--surface-glass-border);">
        <span>♟️ <strong>${invite.from_user.name || invite.from_user.username}</strong> te invitó a jugar</span>
        <span style="display: flex; gap: 6px;">
          <button class="btn-hud btn-hud-primary" data-accept="${invite.id}">Aceptar</button>
          <button class="btn-hud btn-hud-danger" data-decline="${invite.id}">Rechazar</button>
        </span>
      </div>
    `);
    row.find('[data-accept]').on('click', () => respondToInvite(invite.id, 'accept'));
    row.find('[data-decline]').on('click', () => respondToInvite(invite.id, 'decline'));
    container.append(row);
  });
}

/**
 * Acepta o rechaza una invitación pendiente
 */
function respondToInvite(inviteId, action) {
  fetch(`/api/invites/${encodeURIComponent(inviteId)}/${action}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` }
  })
    .then((res) => res.json())
    .then((res) => {
      pendingInvites = pendingInvites.filter((inv) => inv.id !== inviteId);
      renderInviteBadge();
      renderInvitesList();
      if (res.success && action === 'accept' && res.data && res.data.id) {
        closeInvitesModal();
        $("#game-id-input").val(res.data.id);
        loadGameFromAPI(res.data.id);
        messageShow('¡Invitación aceptada! Partida cargada.');
      } else if (res.success) {
        messageShow('Invitación rechazada.');
      } else {
        messageShow(res.error?.message || 'No se pudo responder la invitación');
      }
    })
    .catch(() => {
      messageShow('Error de conexión al responder la invitación');
    });
}

// ==========================================
// CREACIÓN DE PARTIDAS (MODAL)
// ==========================================

/**
 * Abre el modal de creación de nueva partida
 */
function openCreateGameModal() {
  if (!currentUser) {
    messageShow('Debes iniciar sesión para crear una partida');
    openAuthModal('login');
    return;
  }
  $("#create-game-alert").hide().text("").removeClass("error success");
  onCreateGameTypeChange();
  $("#create-game-modal").fadeIn(150);
}

/**
 * Cierra el modal de creación de nueva partida
 */
function closeCreateGameModal() {
  $("#create-game-modal").fadeOut(150);
}

/**
 * Alterna la visibilidad de las opciones de bot/online según el tipo elegido
 */
function onCreateGameTypeChange() {
  const type = $("input[name='create-game-type']:checked").val();
  if (type === 'online') {
    $("#create-bot-options").hide();
    $("#create-online-options").show();
  } else {
    $("#create-bot-options").show();
    $("#create-online-options").hide();
  }
}

/**
 * Envía la solicitud de creación de partida al servidor
 */
function submitCreateGame() {
  if (!authToken) {
    messageShow('Debes iniciar sesión para crear una partida');
    return;
  }

  const gameType = $("input[name='create-game-type']:checked").val();
  const playerSide = $("#create-player-side").val();
  const inviteUsername = $("#create-invite-username").val().trim();
  const timeControlRaw = $("#create-time-control").val();

  let timeControl = null;
  if (timeControlRaw) {
    const [initialSeconds, incrementSeconds, preset] = timeControlRaw.split(',');
    timeControl = {
      initial_seconds: parseInt(initialSeconds, 10),
      increment_seconds: parseInt(incrementSeconds, 10),
      preset
    };
  }

  const payload = {
    game_type: gameType,
    player_side: playerSide,
    time_control: timeControl
  };
  if (gameType === 'online' && inviteUsername) {
    payload.invite_username = inviteUsername;
  }
  if (gameType === 'bot') {
    payload.bot_difficulty = parseInt($("#create-bot-difficulty").val(), 10);
  }

  $("#btn-submit-create-game").prop("disabled", true).text("Creando...");

  fetch('/api/games', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify(payload)
  })
    .then((res) => res.json())
    .then((res) => {
      $("#btn-submit-create-game").prop("disabled", false).text("Crear Partida");
      if (res.success && res.data) {
        closeCreateGameModal();
        gameMode = gameType === 'online' ? 'multiplayer' : 'bot';
        $("#play-mode-select").val(gameMode);
        onGameModeChange();
        myPlayerSide = playerSide;
        $("#player-side-select").val(myPlayerSide);
        $("#game-id-input").val(res.data.id);
        loadGameFromAPI(res.data.id);
        messageShow(gameType === 'online' ? 'Partida online creada. Esperando rival...' : '¡Partida contra el robot creada!');
      } else {
        $("#create-game-alert").removeClass("success").addClass("error").text(res.error?.message || "Error al crear la partida").fadeIn(150);
      }
    })
    .catch(() => {
      $("#btn-submit-create-game").prop("disabled", false).text("Crear Partida");
      $("#create-game-alert").removeClass("success").addClass("error").text("Error de conexión con el servidor").fadeIn(150);
    });
}