/**
 * Migración única de datos JSON a SQLite. Ejecutar manualmente una sola vez:
 *   node scripts/migrate-to-sqlite.js
 *
 * Lee data/users/*.json, data/users/sessions.json y data/users/invites.json
 * (si existe) y los inserta en data/chess.db. data/games/ se asume vacío
 * (las partidas legacy ya se archivaron previamente en data/games_legacy_archive/).
 * Es re-ejecutable de forma segura: usa INSERT OR IGNORE.
 */

const fs = require('fs');
const path = require('path');
const db = require('../api/db'); // crea chess.db + el esquema como efecto colateral del require

const USERS_DIR = path.join(__dirname, '..', 'data', 'users');
const SESSIONS_FILE = path.join(USERS_DIR, 'sessions.json');
const INVITES_FILE = path.join(USERS_DIR, 'invites.json');

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (id, username, email, created_at, updated_at, data)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const insertSession = db.prepare(`INSERT OR IGNORE INTO sessions (token, user_id) VALUES (?, ?)`);
const insertInvite = db.prepare(`
  INSERT OR IGNORE INTO invites (id, game_id, from_user_id, from_username, from_name, to_username, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let userCount = 0;
let sessionCount = 0;
let inviteCount = 0;

if (fs.existsSync(USERS_DIR)) {
  for (const file of fs.readdirSync(USERS_DIR)) {
    if (!file.endsWith('.json') || file === 'sessions.json' || file === 'invites.json') continue;
    try {
      const user = JSON.parse(fs.readFileSync(path.join(USERS_DIR, file), 'utf-8'));
      insertUser.run(user.id, user.username, user.email || null, user.created_at, user.updated_at, JSON.stringify(user));
      userCount++;
    } catch (err) {
      console.error(`Error migrando usuario desde ${file}:`, err.message);
    }
  }
}

if (fs.existsSync(SESSIONS_FILE)) {
  try {
    const entries = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    for (const [token, userId] of entries) {
      insertSession.run(token, userId);
      sessionCount++;
    }
  } catch (err) {
    console.error('Error migrando sesiones:', err.message);
  }
}

if (fs.existsSync(INVITES_FILE)) {
  try {
    const invites = JSON.parse(fs.readFileSync(INVITES_FILE, 'utf-8'));
    for (const inv of invites) {
      insertInvite.run(
        inv.id,
        inv.game_id,
        inv.from_user.id,
        inv.from_user.username,
        inv.from_user.name || null,
        inv.to_username,
        inv.status,
        inv.created_at,
        inv.updated_at
      );
      inviteCount++;
    }
  } catch (err) {
    console.error('Error migrando invitaciones:', err.message);
  }
}

console.log(`Migración completa: ${userCount} usuarios, ${sessionCount} sesiones, ${inviteCount} invitaciones -> data/chess.db`);
console.log('Verifica que la app funciona (login, partidas) antes de archivar data/users/ manualmente.');
