const db = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS game_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL REFERENCES games(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_chat_game ON game_chat(game_id, id);`);

function canChat(game, user) {
  return !!(game && user && game.white_player && game.black_player &&
    game.white_player.id && game.black_player.id &&
    game.white_player.id.startsWith('usr-') && game.black_player.id.startsWith('usr-') &&
    [game.white_player.id, game.black_player.id].includes(user.id));
}

function listMessages(gameId, after = 0) {
  return db.prepare(`SELECT * FROM (
    SELECT * FROM game_chat WHERE game_id = ? AND id > ? ORDER BY id DESC LIMIT 100
  ) ORDER BY id`).all(gameId, after);
}

function addMessage(gameId, user, text) {
  const last = db.prepare('SELECT created_at FROM game_chat WHERE game_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1').get(gameId, user.id);
  if (last && Date.now() - Date.parse(last.created_at) < 750) return null;
  const result = db.prepare('INSERT INTO game_chat (game_id, user_id, name, text, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(gameId, user.id, user.name || user.username, text, new Date().toISOString());
  return db.prepare('SELECT * FROM game_chat WHERE id = ?').get(result.lastInsertRowid);
}

module.exports = { canChat, listMessages, addMessage };
