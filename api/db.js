/**
 * Conexión compartida a SQLite y definición del esquema de la base de datos.
 * Reemplaza la persistencia en archivos JSON de games/users/sessions/invites.
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'chess.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS games (
  id                TEXT PRIMARY KEY,
  status            TEXT NOT NULL,
  turn              TEXT NOT NULL,
  turn_count        INTEGER NOT NULL DEFAULT 0,
  white_player_id   TEXT,
  black_player_id   TEXT,
  movements_count   INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  data              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_white_player ON games(white_player_id);
CREATE INDEX IF NOT EXISTS idx_games_black_player ON games(black_player_id);
CREATE INDEX IF NOT EXISTS idx_games_updated_at   ON games(updated_at);

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  username          TEXT NOT NULL UNIQUE,
  email             TEXT UNIQUE,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  data              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS invites (
  id            TEXT PRIMARY KEY,
  game_id       TEXT NOT NULL,
  from_user_id  TEXT NOT NULL,
  from_username TEXT NOT NULL,
  from_name     TEXT,
  to_username   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invites_to_username_status ON invites(to_username, status);
`);

module.exports = db;
