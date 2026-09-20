const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const gameStore = require('./api/gameStore');
const { getGame, saveGame, listGames, resetGame, createGame } = gameStore;
const { applyMove, getBoardAtStep } = require('./api/chessEngine');
const { getBotMove, LEVEL_CONFIGS } = require('./api/chessAI');
const userStore = require('./api/userStore');
const inviteStore = require('./api/inviteStore');
const socketGateway = require('./api/socketGateway');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
socketGateway.initSocketGateway(io);

// Middlewares
app.use(cors());
app.use(express.json());

// Middleware de autenticación por Token Bearer o x-auth-token
app.use((req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  let token = null;
  if (authHeader) {
    token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  }
  if (token) {
    req.user = userStore.getUserByToken(token);
    req.token = token;
  } else {
    req.user = null;
  }
  next();
});

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'app')));
app.use('/data', express.static(path.join(__dirname, 'data')));

// Ruta raíz que sirve la interfaz gráfica
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'app', 'index.html'));
});

// Ruta con ID de partida embebido en la URL (ej. /game/abc123), permite
// compartir el enlace directo o recargar la página sin perder la partida.
// El frontend lee el ID desde la ruta al cargar.
app.get('/game/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'app', 'index.html'));
});

// ==========================================
// RUTAS DE LA API
// ==========================================

/**
 * Función auxiliar para formatear la respuesta del estado de una partida
 */
function formatGameStatusResponse(game) {
  // Extraer lista de piezas activas para conveniencia del frontend
  const activePieces = [];
  if (game.board) {
    for (const [square, piece] of Object.entries(game.board)) {
      if (piece) {
        activePieces.push({
          ...piece,
          square
        });
      }
    }
  }

  return {
    id: game.id,
    status: game.status,
    winner: game.winner || null,
    draw_reason: game.draw_reason || null,
    in_check: game.in_check || false,
    game_type: game.game_type || 'bot',
    mode: game.mode || 'async',
    time_control: game.time_control || null,
    turn: game.turn,
    turn_count: game.turn_count,
    board: game.board,
    active_pieces: activePieces,
    captured_pieces: game.captured_pieces || { white: [], black: [] },
    points: game.points || { white: 0, black: 0 },
    clocks: game.clocks || { white: 0, black: 0, last_turn_started_at: null, running: false },
    movements: game.movements || [],
    last_move: game.movements && game.movements.length > 0 ? game.movements[game.movements.length - 1] : null,
    white_player: game.white_player || null,
    black_player: game.black_player || null,
    invited_username: game.invited_username || null,
    created_by: game.created_by || null,
    opponent_connected: !!(game.white_player && game.black_player),
    has_second_player: !!(game.white_player && game.black_player),
    created_at: game.created_at,
    updated_at: game.updated_at
  };
}

// ==========================================
// RUTAS DE AUTENTICACIÓN Y USUARIOS
// ==========================================

/**
 * POST /api/auth/register
 * Registra un nuevo usuario con nombre, username, email y contraseña segura
 */
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, username, email, password } = req.body || {};
    const result = userStore.createUser({ name, username, email, password });
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { message: err.message }
    });
  }
});

/**
 * POST /api/auth/login
 * Inicia sesión verificando credenciales y entrega token de sesión
 */
app.post('/api/auth/login', (req, res) => {
  try {
    const { login, username, email, password } = req.body || {};
    const identifier = login || username || email;
    const result = userStore.authenticateUser({ login: identifier, password });
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(401).json({
      success: false,
      error: { message: err.message }
    });
  }
});

/**
 * GET /api/auth/me
 * Retorna los datos del usuario autenticado actualmente
 */
app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { message: 'No hay sesión activa.' }
    });
  }
  res.json({
    success: true,
    data: req.user
  });
});

/**
 * POST /api/auth/logout
 * Cierra la sesión activa invalidando el token
 */
app.post('/api/auth/logout', (req, res) => {
  if (req.token) {
    userStore.invalidateToken(req.token);
  }
  res.json({
    success: true,
    data: { message: 'Sesión finalizada con éxito.' }
  });
});

/**
 * GET /api/users
 * Lista todos los perfiles de usuarios registrados
 */
app.get('/api/users', (req, res) => {
  const users = userStore.listUsers();
  res.json({
    success: true,
    data: users
  });
});

/**
 * GET /api/users/:id
 * Obtiene el perfil público de un usuario por su ID
 */
app.get('/api/users/:id', (req, res) => {
  const user = userStore.getUserById(req.params.id, false);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: { message: 'Usuario no encontrado' }
    });
  }
  res.json({
    success: true,
    data: user
  });
});

/**
 * GET /api/users/:id/games
 * Obtiene el listado completo de partidas disputadas por un usuario específico
 */
app.get('/api/users/:id/games', (req, res) => {
  const user = userStore.getUserById(req.params.id, false);
  const games = userStore.getUserGames(req.params.id);
  res.json({
    success: true,
    data: {
      user: user || { id: req.params.id, name: 'Usuario' },
      total_games: games.length,
      games
    }
  });
});

/**
 * GET /api/my-games
 * Retorna las partidas del usuario actualmente autenticado
 */
app.get('/api/my-games', (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { message: 'Debes iniciar sesión para consultar tus partidas.' }
    });
  }
  const games = userStore.getUserGames(req.user.id);
  res.json({
    success: true,
    data: {
      user: req.user,
      total_games: games.length,
      games
    }
  });
});

/**
 * GET /api/status/:id
 * GET /api/games/:id/status
 * GET /api/games/:id
 * Obtiene el estado actual de la partida según su ID.
 */
const handleGetGameStatus = (req, res) => {
  const gameId = req.params.id;
  const game = getGame(gameId);

  if (!game) {
    return res.status(404).json({
      success: false,
      error: { message: `Partida con ID '${gameId}' no encontrada.` }
    });
  }

  res.json({
    success: true,
    data: formatGameStatusResponse(game)
  });
};

app.get('/api/status/:id', handleGetGameStatus);
app.get('/api/games/:id/status', handleGetGameStatus);
app.get('/api/games/:id', handleGetGameStatus);

/**
 * GET /api/games/:id/history/:step
 * Obtiene la reconstrucción del tablero tras 'step' movimientos (0 = inicial)
 */
app.get('/api/games/:id/history/:step', (req, res) => {
  const gameId = req.params.id;
  const game = getGame(gameId);
  if (!game) {
    return res.status(404).json({ success: false, error: { message: `Partida con ID '${gameId}' no encontrada.` } });
  }

  const step = parseInt(req.params.step, 10);

  if (isNaN(step) || step < 0) {
    return res.status(400).json({ success: false, error: { message: 'El parámetro step debe ser un número entero >= 0' } });
  }

  const historicalBoard = getBoardAtStep(game.movements, step);
  const activePieces = [];
  for (const [square, piece] of Object.entries(historicalBoard)) {
    if (piece) activePieces.push({ ...piece, square });
  }

  res.json({
    success: true,
    data: {
      step,
      total_moves: game.movements ? game.movements.length : 0,
      is_historical: step < (game.movements ? game.movements.length : 0),
      current_move: step > 0 && game.movements && game.movements[step - 1] ? game.movements[step - 1] : null,
      board: historicalBoard,
      active_pieces: activePieces
    }
  });
});

/**
 * GET /api/games
 * Lista todas las partidas guardadas en el sistema.
 */
app.get('/api/games', (req, res) => {
  const games = listGames();
  res.json({
    success: true,
    data: games
  });
});

/**
 * POST /api/games
 * Crea una nueva partida. Requiere sesión iniciada.
 * Body: { game_type: 'bot' | 'online', player_side?, time_control?, invite_username? }
 * time_control: { initial_seconds, increment_seconds, preset? } | null (sin reloj)
 */
app.post('/api/games', (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { message: 'Debes iniciar sesión para crear una partida.' }
    });
  }

  const { game_type, player_side, time_control, invite_username } = req.body || {};
  const gameType = game_type === 'online' ? 'online' : 'bot';
  const side = player_side === 'black' ? 'black' : 'white';
  const userObj = { id: req.user.id, username: req.user.username, name: req.user.name, rating: req.user.rating || 1200 };

  let normalizedTimeControl = null;
  if (time_control && Number.isFinite(time_control.initial_seconds) && time_control.initial_seconds > 0) {
    normalizedTimeControl = {
      initial_seconds: time_control.initial_seconds,
      increment_seconds: Number.isFinite(time_control.increment_seconds) ? time_control.increment_seconds : 0,
      preset: time_control.preset || null
    };
  }

  const options = {
    game_type: gameType,
    time_control: normalizedTimeControl,
    created_by: req.user.id
  };
  options[`${side}_player`] = userObj;

  const newGame = createGame(options);

  let invite = null;
  if (gameType === 'online' && invite_username) {
    invite = inviteStore.createInvite({ gameId: newGame.id, fromUser: userObj, toUsername: invite_username });
    newGame.invited_username = invite.to_username;
    saveGame(newGame);
    socketGateway.notifyUser(invite.to_username, 'invite:received', invite);
  }

  res.status(201).json({
    success: true,
    data: formatGameStatusResponse(newGame)
  });
});

/**
 * Une a un usuario autenticado a un slot de la partida y, si con esto quedan
 * ambos bandos ocupados por jugadores reales, arranca la partida (y el reloj si aplica).
 * Retorna { error } con { status, message } si la operación no es válida.
 */
function joinGameAsUser(game, userObj, targetSide) {
  const currentPlayer = targetSide === 'white' ? game.white_player : game.black_player;
  if (currentPlayer) {
    return { error: { status: 409, message: `El bando de ${targetSide === 'white' ? 'blancas' : 'negras'} ya está ocupado.` } };
  }

  if (targetSide === 'white') {
    game.white_player = userObj;
  } else {
    game.black_player = userObj;
  }

  const bothSlotsFilled = !!(game.white_player && game.black_player);
  if (bothSlotsFilled && game.status === 'WAITING_FOR_PLAYER') {
    game.status = 'IN_PROGRESS';
    if (game.time_control) {
      game.clocks.last_turn_started_at = new Date().toISOString();
      game.clocks.running = true;
    }
  }

  saveGame(game);
  return { error: null };
}

/**
 * POST /api/games/:id/join
 * Permite a un usuario autenticado unirse formalmente a una partida online
 * compartida por link, eligiendo el bando disponible.
 */
app.post('/api/games/:id/join', (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { message: 'Debes iniciar sesión para unirte a una partida.' }
    });
  }

  const gameId = req.params.id;
  const game = getGame(gameId);
  if (!game) {
    return res.status(404).json({ success: false, error: { message: 'Partida no encontrada' } });
  }

  const { side } = req.body || {};
  const targetSide = side === 'white' ? 'white' : 'black';
  const userObj = { id: req.user.id, username: req.user.username, name: req.user.name, rating: req.user.rating || 1200 };

  const { error } = joinGameAsUser(game, userObj, targetSide);
  if (error) {
    return res.status(error.status).json({ success: false, error: { message: error.message } });
  }

  res.json({
    success: true,
    data: formatGameStatusResponse(game)
  });
});

/**
 * POST /api/games/:id/claim
 * Reclama retroactivamente un bando de la partida a nombre del usuario autenticado,
 * sin importar el turno actual. Útil cuando el jugador empezó como invitado y luego
 * inició sesión: vincula su cuenta al bando con el que ha estado jugando.
 * Requiere autenticación. Body: { side: 'white' | 'black' }
 */
app.post('/api/games/:id/claim', (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { message: 'Debes iniciar sesión para reclamar una partida.' }
    });
  }

  const gameId = req.params.id;
  const game = getGame(gameId);

  if (!game) {
    return res.status(404).json({ success: false, error: { message: 'Partida no encontrada' } });
  }

  const { side } = req.body || {};
  if (side !== 'white' && side !== 'black') {
    return res.status(400).json({
      success: false,
      error: { message: "Se requiere el bando a reclamar: { side: 'white' | 'black' }" }
    });
  }

  const currentPlayer = side === 'white' ? game.white_player : game.black_player;
  if (currentPlayer && currentPlayer.id !== req.user.id) {
    return res.status(409).json({
      success: false,
      error: { message: `El bando de ${side === 'white' ? 'blancas' : 'negras'} ya pertenece a otro usuario registrado.` }
    });
  }

  const userObj = { id: req.user.id, username: req.user.username, name: req.user.name, rating: req.user.rating || 1200 };
  if (side === 'white') {
    game.white_player = userObj;
  } else {
    game.black_player = userObj;
  }
  saveGame(game);

  res.json({
    success: true,
    data: formatGameStatusResponse(game)
  });
});

// ==========================================
// RUTAS DE INVITACIONES A PARTIDAS ONLINE
// ==========================================

/**
 * GET /api/invites
 * Lista las invitaciones pendientes dirigidas al usuario autenticado.
 */
app.get('/api/invites', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Debes iniciar sesión para consultar tus invitaciones.' } });
  }
  const invites = inviteStore.getInvitesForUser(req.user.username);
  res.json({ success: true, data: invites });
});

/**
 * POST /api/invites/:id/accept
 * Acepta una invitación pendiente y une al usuario autenticado a la partida.
 */
app.post('/api/invites/:id/accept', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Debes iniciar sesión para responder invitaciones.' } });
  }

  const invite = inviteStore.getInviteById(req.params.id);
  if (!invite) {
    return res.status(404).json({ success: false, error: { message: 'Invitación no encontrada.' } });
  }
  if (invite.to_username !== req.user.username) {
    return res.status(403).json({ success: false, error: { message: 'Esta invitación no está dirigida a tu usuario.' } });
  }
  if (invite.status !== 'PENDING') {
    return res.status(409).json({ success: false, error: { message: 'La invitación ya no está pendiente.' } });
  }

  const game = getGame(invite.game_id);
  if (!game) {
    return res.status(404).json({ success: false, error: { message: 'La partida asociada a esta invitación ya no existe.' } });
  }

  const targetSide = game.white_player ? 'black' : 'white';
  const userObj = { id: req.user.id, username: req.user.username, name: req.user.name, rating: req.user.rating || 1200 };
  const { error } = joinGameAsUser(game, userObj, targetSide);
  if (error) {
    return res.status(error.status).json({ success: false, error: { message: error.message } });
  }

  inviteStore.updateInviteStatus(invite.id, 'ACCEPTED');
  socketGateway.notifyUser(invite.from_user.username, 'invite:accepted', { ...invite, status: 'ACCEPTED' });

  res.json({ success: true, data: formatGameStatusResponse(game) });
});

/**
 * POST /api/invites/:id/decline
 * Rechaza una invitación pendiente.
 */
app.post('/api/invites/:id/decline', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Debes iniciar sesión para responder invitaciones.' } });
  }

  const invite = inviteStore.getInviteById(req.params.id);
  if (!invite) {
    return res.status(404).json({ success: false, error: { message: 'Invitación no encontrada.' } });
  }
  if (invite.to_username !== req.user.username) {
    return res.status(403).json({ success: false, error: { message: 'Esta invitación no está dirigida a tu usuario.' } });
  }
  if (invite.status !== 'PENDING') {
    return res.status(409).json({ success: false, error: { message: 'La invitación ya no está pendiente.' } });
  }

  inviteStore.updateInviteStatus(invite.id, 'DECLINED');
  socketGateway.notifyUser(invite.from_user.username, 'invite:declined', { ...invite, status: 'DECLINED' });

  res.json({ success: true, data: invite });
});

/**
 * POST /api/invites/:id/cancel
 * Cancela una invitación pendiente creada por el usuario autenticado.
 */
app.post('/api/invites/:id/cancel', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Debes iniciar sesión para cancelar invitaciones.' } });
  }

  try {
    const invite = inviteStore.cancelInvite(req.params.id, req.user.id);
    if (!invite) {
      return res.status(404).json({ success: false, error: { message: 'Invitación no encontrada.' } });
    }
    res.json({ success: true, data: invite });
  } catch (err) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

/**
 * POST /api/games/:id/moves
 * POST /api/games/:id/move
 * POST /api/status/:id/moves
 * Ejecuta un movimiento en la partida evaluando la lógica y reglas del juego en el servidor.
 * Payload esperado: { from: "b1", to: "c3" } o { uci: "b1c3" } o { from: "e2", to: "e4" }
 */
const handlePostMove = (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Debes iniciar sesión para mover.' } });
  }

  const gameId = req.params.id;
  const game = getGame(gameId);
  if (!game) {
    return res.status(404).json({ success: false, error: { message: `Partida con ID '${gameId}' no encontrada.` } });
  }

  const playerOnTurn = game.turn === 'white' ? game.white_player : game.black_player;
  if (!playerOnTurn || playerOnTurn.id !== req.user.id) {
    return res.status(403).json({ success: false, error: { message: 'No es tu turno o no perteneces a esta partida.' } });
  }

  let { from, to, uci, move, promotion } = req.body || {};

  // Soporte para formato UCI (ej: "b1c3" o "e2e4")
  if (!from && !to) {
    const rawMove = uci || move;
    if (typeof rawMove === 'string' && rawMove.length >= 4) {
      from = rawMove.substring(0, 2);
      to = rawMove.substring(2, 4);
    }
  }

  if (!from || !to) {
    return res.status(400).json({
      success: false,
      error: { message: "Se requieren las casillas de origen y destino: { from: 'casilla', to: 'casilla' }" }
    });
  }

  // Aplicar lógica y reglas del juego en el motor de ajedrez
  const result = applyMove(game, { from, to, promotion });

  if (!result.success) {
    return res.status(422).json({
      success: false,
      error: result.error
    });
  }

  // Persistir estado actualizado
  saveGame(game);

  res.json({
    success: true,
    data: {
      applied_move: result.data.move,
      game: formatGameStatusResponse(game)
    }
  });
};

app.post('/api/games/:id/moves', handlePostMove);
app.post('/api/games/:id/move', handlePostMove);
app.post('/api/status/:id/moves', handlePostMove);

/**
 * GET /api/bot/levels
 * Retorna los 10 niveles de dificultad disponibles para el robot y sus descripciones
 */
app.get('/api/bot/levels', (req, res) => {
  res.json({
    success: true,
    data: LEVEL_CONFIGS
  });
});
app.get('/api/bot-levels', (req, res) => {
  res.json({
    success: true,
    data: LEVEL_CONFIGS
  });
});

/**
 * POST /api/games/:id/bot-move
 * POST /api/status/:id/bot-move
 * Solicita a la IA (Robot) que calcule y ejecute la mejor jugada para el turno actual.
 * Body opcional: { difficulty: 1 .. 10 } (Niveles del 1 al 10)
 */
const handleBotMove = (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Debes iniciar sesión para jugar contra el robot.' } });
  }

  const gameId = req.params.id;
  const game = getGame(gameId);
  if (!game) {
    return res.status(404).json({ success: false, error: { message: `Partida con ID '${gameId}' no encontrada.` } });
  }

  const isParticipant = (game.white_player && game.white_player.id === req.user.id) || (game.black_player && game.black_player.id === req.user.id);
  if (!isParticipant) {
    return res.status(403).json({ success: false, error: { message: 'No perteneces a esta partida.' } });
  }

  if (game.status !== 'IN_PROGRESS') {
    return res.status(400).json({
      success: false,
      error: { message: `La partida no está activa (Estado: ${game.status})` }
    });
  }

  const { difficulty } = req.body || {};
  const level = Math.min(10, Math.max(1, parseInt(difficulty, 10) || 5));
  const botMove = getBotMove(game, level);

  if (!botMove) {
    return res.status(422).json({
      success: false,
      error: { message: 'El robot no encontró movimientos legales posibles.' }
    });
  }

  const result = applyMove(game, botMove);
  if (!result.success) {
    return res.status(500).json({
      success: false,
      error: { message: 'Error interno al aplicar el movimiento del robot.' }
    });
  }

  saveGame(game);

  res.json({
    success: true,
    data: {
      bot_difficulty: level,
      bot_level_name: LEVEL_CONFIGS && LEVEL_CONFIGS[level] ? LEVEL_CONFIGS[level].name : `Nivel ${level}`,
      applied_move: result.data.move,
      game: formatGameStatusResponse(game)
    }
  });
};

app.post('/api/games/:id/bot-move', handleBotMove);
app.post('/api/status/:id/bot-move', handleBotMove);

/**
 * POST /api/games/:id/reset
 * Reinicia la partida a la posición inicial.
 */
app.post('/api/games/:id/reset', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Debes iniciar sesión para reiniciar una partida.' } });
  }

  const gameId = req.params.id;
  const game = getGame(gameId);
  if (!game) {
    return res.status(404).json({ success: false, error: { message: 'Partida no encontrada' } });
  }

  const isParticipant = (game.white_player && game.white_player.id === req.user.id) || (game.black_player && game.black_player.id === req.user.id);
  if (!isParticipant) {
    return res.status(403).json({ success: false, error: { message: 'No perteneces a esta partida.' } });
  }

  const restarted = resetGame(gameId);
  res.json({
    success: true,
    data: formatGameStatusResponse(restarted)
  });
});

/**
 * POST /api/games/:id/resign
 * Declara rendición para el bando que abandona.
 */
app.post('/api/games/:id/resign', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Debes iniciar sesión para rendirte.' } });
  }

  const gameId = req.params.id;
  const game = getGame(gameId);
  if (!game) {
    return res.status(404).json({ success: false, error: { message: 'Partida no encontrada' } });
  }

  const isParticipant = (game.white_player && game.white_player.id === req.user.id) || (game.black_player && game.black_player.id === req.user.id);
  if (!isParticipant) {
    return res.status(403).json({ success: false, error: { message: 'No perteneces a esta partida.' } });
  }

  const { side } = req.body || {};
  const resigningSide = side || game.turn;
  const winningSide = resigningSide === 'white' ? 'black' : 'white';

  game.status = 'RESIGNED';
  game.winner = winningSide;
  saveGame(game);

  res.json({
    success: true,
    data: formatGameStatusResponse(game)
  });
});

// Configuración de Host y Puerto
const host = process.env.HOST || '127.0.0.1';
const port = process.env.PORT || 5000;

if (require.main === module) {
  httpServer.listen(port, host, () => {
    console.log(`Flexbox Chess API Server running at http://${host}:${port}`);
    console.log(`- API Status endpoint: http://${host}:${port}/api/status/:id`);
    console.log(`- API Moves endpoint:  http://${host}:${port}/api/games/:id/moves`);
    console.log(`- WebSocket (Socket.IO) listo para notificaciones en tiempo real`);
  });
}

module.exports = app;
