/**
 * Registro en memoria de conexiones WebSocket activas por usuario.
 * Efímero por naturaleza: no se persiste en disco, se reconstruye
 * automáticamente a medida que los clientes se conectan tras un reinicio.
 */

// userId -> Set<socketId>
const connections = new Map();

function register(userId, socketId) {
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }
  connections.get(userId).add(socketId);
}

function unregister(userId, socketId) {
  const sockets = connections.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    connections.delete(userId);
  }
}

function isConnected(userId) {
  return connections.has(userId) && connections.get(userId).size > 0;
}

module.exports = {
  register,
  unregister,
  isConnected
};
