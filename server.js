const express = require('express');
const cors = require('cors');
const path = require('path');
const { getGame, saveGame, listGames, resetGame } = require('./api/gameStore');
const { applyMove, createGameState, getBoardAtStep } = require('./api/chessEngine');
const { getBotMove, LEVEL_CONFIGS } = require('./api/chessAI');
const userStore = require('./api/userStore');

const app = express();

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
    in_check: game.in_check || false,
    mode: game.mode || 'timed',
    turn: game.turn,
    turn_count: game.turn_count,
    board: game.board,
    active_pieces: activePieces,
    captured_pieces: game.captured_pieces || { white: [], black: [] },
    points: game.points || { white: 0, black: 0 },
    clocks: game.clocks || { white: 0, black: 0 },
    movements: game.movements || [],
    last_move: game.movements && game.movements.length > 0 ? game.movements[game.movements.length - 1] : null,
    white_player: game.white_player || { id: 'guest-w', username: 'blancas', name: 'Jugador Blancas' },
    black_player: game.black_player || { id: 'guest-b', username: 'negras', name: 'Jugador Negras' },
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
 * POST /api/games/:id/join
 * Permite a un jugador unirse o asociarse a una partida con su bando
 */
app.post('/api/games/:id/join', (req, res) => {
  const gameId = req.params.id || 'default';
  const game = getGame(gameId, true);
  const { side, player } = req.body || {};
  const targetSide = side || 'white';
  const playerData = player || (req.user ? { id: req.user.id, username: req.user.username, name: req.user.name } : null);

  if (playerData) {
    if (targetSide === 'white') {
      game.white_player = playerData;
    } else if (targetSide === 'black') {
      game.black_player = playerData;
    }
    saveGame(game);
  }

  res.json({
    success: true,
    data: formatGameStatusResponse(game)
  });
});

/**
 * GET /api/status/:id
 * GET /api/games/:id/status
 * GET /api/games/:id
 * Obtiene el estado actual de la partida según su ID.
 * Si la partida no existe, se crea e inicializa automáticamente con dicho ID.
 */
const handleGetGameStatus = (req, res) => {
  const gameId = req.params.id || 'default';
  const game = getGame(gameId, true);

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
  const gameId = req.params.id || 'default';
  const game = getGame(gameId, true);
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
 * Crea una nueva partida con ID generado o proporcionado.
 */
app.post('/api/games', (req, res) => {
  const { id, mode, white_player, black_player, player_side } = req.body || {};
  const gameId = id || `game-${Date.now()}`;

  let wPlayer = white_player;
  let bPlayer = black_player;

  if (req.user) {
    const userObj = { id: req.user.id, username: req.user.username, name: req.user.name };
    if (player_side === 'black') {
      if (!bPlayer) bPlayer = userObj;
    } else {
      if (!wPlayer) wPlayer = userObj;
    }
  }

  const newGame = createGameState(gameId, {
    mode,
    white_player: wPlayer,
    black_player: bPlayer
  });
  saveGame(newGame);

  res.status(201).json({
    success: true,
    data: formatGameStatusResponse(newGame)
  });
});

/**
 * POST /api/games/:id/moves
 * POST /api/games/:id/move
 * POST /api/status/:id/moves
 * Ejecuta un movimiento en la partida evaluando la lógica y reglas del juego en el servidor.
 * Payload esperado: { from: "b1", to: "c3" } o { uci: "b1c3" } o { from: "e2", to: "e4" }
 */
const handlePostMove = (req, res) => {
  const gameId = req.params.id || 'default';
  const game = getGame(gameId, true);

  // Vincular usuario autenticado al bando correspondiente si aún era invitado
  if (req.user) {
    const userObj = { id: req.user.id, username: req.user.username, name: req.user.name };
    if (game.turn === 'white' && (!game.white_player || game.white_player.id.startsWith('guest-'))) {
      game.white_player = userObj;
    } else if (game.turn === 'black' && (!game.black_player || game.black_player.id.startsWith('guest-'))) {
      game.black_player = userObj;
    }
  }

  let { from, to, uci, move } = req.body || {};

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
  const result = applyMove(game, { from, to });

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
  const gameId = req.params.id || 'default';
  const game = getGame(gameId, true);

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
  const gameId = req.params.id || 'default';
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
  const gameId = req.params.id || 'default';
  const game = getGame(gameId, false);
  if (!game) {
    return res.status(404).json({ success: false, error: { message: 'Partida no encontrada' } });
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
  app.listen(port, host, () => {
    console.log(`Flexbox Chess API Server running at http://${host}:${port}`);
    console.log(`- API Status endpoint: http://${host}:${port}/api/status/:id`);
    console.log(`- API Moves endpoint:  http://${host}:${port}/api/games/:id/moves`);
  });
}

module.exports = app;
