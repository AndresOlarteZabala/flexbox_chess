/**
 * Módulo de almacenamiento de invitaciones a partidas online.
 * Persiste en SQLite (data/chess.db).
 */

const crypto = require('crypto');
const db = require('./db');

const insertInviteStmt = db.prepare(`
  INSERT INTO invites (id, game_id, from_user_id, from_username, from_name, to_username, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
`);
const selectPendingForUserStmt = db.prepare(
  `SELECT * FROM invites WHERE to_username = ? AND status = 'PENDING' ORDER BY created_at DESC`
);
const selectByIdStmt = db.prepare('SELECT * FROM invites WHERE id = ?');
const updateStatusStmt = db.prepare('UPDATE invites SET status = ?, updated_at = ? WHERE id = ?');

function rowToInvite(row) {
  if (!row) return null;
  return {
    id: row.id,
    game_id: row.game_id,
    from_user: { id: row.from_user_id, username: row.from_username, name: row.from_name },
    to_username: row.to_username,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Crea una nueva invitación pendiente hacia un username destino
 */
function createInvite({ gameId, fromUser, toUsername }) {
  const now = new Date().toISOString();
  const invite = {
    id: `inv-${crypto.randomUUID()}`,
    game_id: gameId,
    from_user: { id: fromUser.id, username: fromUser.username, name: fromUser.name },
    to_username: toUsername.trim().toLowerCase(),
    status: 'PENDING',
    created_at: now,
    updated_at: now
  };
  insertInviteStmt.run(
    invite.id,
    invite.game_id,
    fromUser.id,
    fromUser.username,
    fromUser.name || null,
    invite.to_username,
    invite.created_at,
    invite.updated_at
  );
  return invite;
}

/**
 * Retorna las invitaciones pendientes dirigidas a un username
 */
function getInvitesForUser(username) {
  if (!username) return [];
  const normalized = username.trim().toLowerCase();
  return selectPendingForUserStmt.all(normalized).map(rowToInvite);
}

/**
 * Obtiene una invitación por su ID
 */
function getInviteById(inviteId) {
  return rowToInvite(selectByIdStmt.get(inviteId));
}

/**
 * Actualiza el estado de una invitación (ACCEPTED, DECLINED, CANCELLED)
 */
function updateInviteStatus(inviteId, status) {
  const updatedAt = new Date().toISOString();
  const result = updateStatusStmt.run(status, updatedAt, inviteId);
  if (result.changes === 0) return null;
  return getInviteById(inviteId);
}

/**
 * Cancela una invitación pendiente, solo permitido al usuario que la creó
 */
function cancelInvite(inviteId, byUserId) {
  const invite = getInviteById(inviteId);
  if (!invite) return null;
  if (invite.from_user.id !== byUserId) {
    throw new Error('Solo quien creó la invitación puede cancelarla.');
  }
  if (invite.status !== 'PENDING') {
    throw new Error('La invitación ya no está pendiente.');
  }
  return updateInviteStatus(inviteId, 'CANCELLED');
}

module.exports = {
  createInvite,
  getInvitesForUser,
  getInviteById,
  updateInviteStatus,
  cancelInvite
};
