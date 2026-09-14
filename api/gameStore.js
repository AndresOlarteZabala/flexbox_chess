/**
 * Almacén de persistencia para partidas de ajedrez.
 * Mantiene un caché en memoria y sincroniza las partidas en disco en data/games/<id>.json.
 */

const fs = require('fs');
const path = require('path');
const { createGameState } = require('./chessEngine');

const GAMES_DIR = path.join(__dirname, '..', 'data', 'games');

// Asegurar que exista el directorio de partidas
if (!fs.existsSync(GAMES_DIR)) {
  fs.mkdirSync(GAMES_DIR, { recursive: true });
}

// Caché en memoria
const memoryGames = new Map();

/**
 * Guarda una partida en memoria y en disco
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
    const filePath = path.join(GAMES_DIR, `${game.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(game, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error al persistir la partida ${game.id} en disco:`, err);
  }
}

/**
 * Obtiene o inicializa una partida por ID
 */
function getGame(gameId, createIfNotFound = true) {
  if (!gameId) gameId = 'default';

  // 1. Buscar en memoria
  if (memoryGames.has(gameId)) {
    return memoryGames.get(gameId);
  }

  // 2. Buscar en disco
  const filePath = path.join(GAMES_DIR, `${gameId}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const game = JSON.parse(data);
      memoryGames.set(gameId, game);
      return game;
    } catch (err) {
      console.error(`Error al leer archivo de partida ${gameId}:`, err);
    }
  }

  // 3. Crear nueva si no existe
  if (createIfNotFound) {
    const newGame = createGameState(gameId);
    saveGame(newGame);
    return newGame;
  }

  return null;
}

/**
 * Lista todas las partidas registradas
 */
function listGames() {
  const gamesList = [];
  try {
    const files = fs.readdirSync(GAMES_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const id = file.replace('.json', '');
        const game = getGame(id, false);
        if (game) {
          gamesList.push({
            id: game.id,
            status: game.status,
            turn: game.turn,
            turn_count: game.turn_count,
            movements_count: game.movements ? game.movements.length : 0,
            created_at: game.created_at,
            updated_at: game.updated_at
          });
        }
      }
    }
  } catch (err) {
    console.error('Error al listar partidas:', err);
  }
  return gamesList;
}

/**
 * Reinicia una partida a su estado inicial
 */
function resetGame(gameId) {
  const newGame = createGameState(gameId);
  saveGame(newGame);
  return newGame;
}

module.exports = {
  saveGame,
  getGame,
  listGames,
  resetGame
};
