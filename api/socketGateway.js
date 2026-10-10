/**
 * Puerta de enlace WebSocket (Socket.IO) para notificaciones en tiempo real.
 * Reutiliza la misma autenticación por token Bearer que la API REST
 * (userStore.getUserByToken) para asociar cada socket a un usuario.
 */

const userStore = require('./userStore');
const socketRegistry = require('./socketRegistry');

let ioInstance = null;

function initSocketGateway(io) {
  ioInstance = io;

  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const user = token ? userStore.getUserByToken(token) : null;
    if (!user) {
      return next(new Error('unauthorized'));
    }
    socket.user = user;
    next();
  });

  io.on('connection', (socket) => {
    socketRegistry.register(socket.user.id, socket.id);
    socket.join(`user:${socket.user.id}`);

    socket.on('disconnect', () => {
      socketRegistry.unregister(socket.user.id, socket.id);
    });
  });
}

/**
 * Emite un evento a todas las conexiones activas de un usuario, identificado por username.
 * No hace nada si el usuario no existe o no tiene sockets conectados.
 */
function notifyUser(username, event, payload) {
  if (!ioInstance) return;
  const user = userStore.findUserByLogin(username, true);
  if (!user) return;
  ioInstance.to(`user:${user.id}`).emit(event, payload);
}

function notifyGameChat(game, message) {
  if (!ioInstance) return;
  const participants = [game.white_player.id, game.black_player.id];
  for (const socket of ioInstance.sockets.sockets.values()) {
    const user = userStore.getUserByToken(socket.handshake.auth.token);
    if (user && participants.includes(user.id)) socket.emit('chat:message', message);
  }
}

module.exports = {
  initSocketGateway,
  notifyUser,
  notifyGameChat
};
