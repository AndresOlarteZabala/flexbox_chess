/**
 * Almacén de persistencia para partidas de ajedrez.
 * Mantiene un caché en memoria y persiste en SQLite (data/chess.db):
 * el objeto completo de la partida se guarda como JSON en la columna `data`,
 * con columnas promovidas (status, turn, jugadores, etc.) para consultas indexadas.
 */

const crypto = require('crypto');
const db = require('./db');
const { createGameState } = require('./chessEngine');

// Caché en memoria
const memoryGames = new Map();

const upsertStmt = db.prepare(`
  INSERT INTO games (id, status, turn, turn_count, white_player_id, black_player_id, movements_count, created_at, updated_at, data)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    status = excluded.status,
    turn = excluded.turn,
    turn_count = excluded.turn_count,
    white_player_id = excluded.white_player_id,
    black_player_id = excluded.black_player_id,
    movements_count = excluded.movements_count,
    updated_at = excluded.updated_at,
    data = excluded.data
`);

const selectByIdStmt = db.prepare('SELECT data FROM games WHERE id = ?');
const selectSummariesStmt = db.prepare(
  'SELECT id, status, turn, turn_count, movements_count, created_at, updated_at FROM games ORDER BY updated_at DESC'
);

/**
 * Genera un identificador de partida único e impredecible
 */
function generateGameId() {
  return `game-${crypto.randomUUID()}`;
}

/**
 * Crea una nueva partida con ID generado por el servidor y la persiste
 */
function createGame(options = {}) {
  const gameId = generateGameId();
  const newGame = createGameState(gameId, options);
  saveGame(newGame);
  return newGame;
}

/**
 * Guarda una partida en memoria y en SQLite
 */
function saveGame(game) {
  if (!game || !game.id) return;
  game.updated_at = new Date().toISOString();

  // Actualizar estadísticas de jugadores registrados si la partida finalizó
  if (game.status && game.status !== 'IN_PROGRESS' && !game.stats_recorded) {
    game.stats_recorded = true;
    try {
      const { updateUserStats } = require('./userStore');
      if (game.white_player && game.white_player.id && game.white_player.id.startsWith('usr-')) {
        const resW = game.winner === 'white' ? 'WIN' : (game.winner === 'draw' ? 'DRAW' : 'LOSS');
        updateUserStats(game.white_player.id, resW);
      }
      if (game.black_player && game.black_player.id && game.black_player.id.startsWith('usr-')) {
        const resB = game.winner === 'black' ? 'WIN' : (game.winner === 'draw' ? 'DRAW' : 'LOSS');
        updateUserStats(game.black_player.id, resB);
      }
    } catch (err) {
      console.error('Error actualizando estadísticas de jugadores:', err);
    }
  }

  memoryGames.set(game.id, game);

  try {
    upsertStmt.run(
      game.id,
      game.status,
      game.turn,
      game.turn_count,
      game.white_player ? game.white_player.id : null,
      game.black_player ? game.black_player.id : null,
      game.movements ? game.movements.length : 0,
      game.created_at,
      game.updated_at,
      JSON.stringify(game)
    );
  } catch (err) {
    console.error(`Error al persistir la partida ${game.id} en SQLite:`, err);
  }
}

/**
 * Obtiene una partida existente por ID. No crea partidas nuevas:
 * retorna null si el ID no existe ni en memoria ni en la base de datos.
 */
function getGame(gameId) {
  if (!gameId) return null;

  // 1. Buscar en memoria
  if (memoryGames.has(gameId)) {
    return memoryGames.get(gameId);
  }

  // 2. Buscar en SQLite
  const row = selectByIdStmt.get(gameId);
  if (row) {
    try {
      const game = JSON.parse(row.data);
      memoryGames.set(gameId, game);
      return game;
    } catch (err) {
      console.error(`Error al parsear partida ${gameId}:`, err);
    }
  }

  return null;
}

/**
 * Lista todas las partidas registradas
 */
function listGames() {
  try {
    return selectSummariesStmt.all();
  } catch (err) {
    console.error('Error al listar partidas:', err);
    return [];
  }
}

/**
 * Reinicia una partida a su estado inicial, conservando tipo, jugadores y control de tiempo
 */
function resetGame(gameId) {
  const existing = getGame(gameId);
  const newGame = createGameState(gameId, {
    game_type: existing ? existing.game_type : 'bot',
    white_player: existing ? existing.white_player : null,
    black_player: existing ? existing.black_player : null,
    time_control: existing ? existing.time_control : null,
    created_by: existing ? existing.created_by : null
  });
  saveGame(newGame);
  return newGame;
}

module.exports = {
  generateGameId,
  createGame,
  saveGame,
  getGame,
  listGames,
  resetGame
};
