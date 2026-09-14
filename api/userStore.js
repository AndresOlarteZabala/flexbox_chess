/**
 * Módulo de almacenamiento y autenticación de usuarios para Flexbox Chess.
 * Gestiona el registro, hashing seguro con salt (crypto nativo pbkdf2),
 * sesiones activas y estadísticas de partidas por usuario.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_DIR = path.join(__dirname, '..', 'data', 'users');
const GAMES_DIR = path.join(__dirname, '..', 'data', 'games');

// Asegurar que exista el directorio de usuarios
if (!fs.existsSync(USERS_DIR)) {
  fs.mkdirSync(USERS_DIR, { recursive: true });
}

// Caché en memoria para usuarios y sesiones activas
const memoryUsers = new Map();
const activeSessions = new Map(); // token -> userId

/**
 * Genera un hash seguro con salt usando pbkdf2
 */
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

/**
 * Verifica una contraseña contra el hash y salt guardados
 */
function verifyPassword(password, savedHash, savedSalt) {
  const { hash } = hashPassword(password, savedSalt);
  return hash === savedHash;
}

/**
 * Sanitiza el objeto de usuario eliminando campos sensibles (hash, salt)
 */
function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, salt, ...safeUser } = user;
  return safeUser;
}

/**
 * Guarda un usuario en memoria y en disco
 */
function saveUser(user) {
  if (!user || !user.id) return;
  user.updated_at = new Date().toISOString();
  memoryUsers.set(user.id, user);

  try {
    const filePath = path.join(USERS_DIR, `${user.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(user, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error al guardar usuario ${user.id} en disco:`, err);
  }
}

/**
 * Carga un usuario por su ID
 */
function getUserById(userId, includePrivate = false) {
  if (!userId) return null;

  if (memoryUsers.has(userId)) {
    const user = memoryUsers.get(userId);
    return includePrivate ? user : sanitizeUser(user);
  }

  const filePath = path.join(USERS_DIR, `${userId}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const user = JSON.parse(data);
      memoryUsers.set(user.id, user);
      return includePrivate ? user : sanitizeUser(user);
    } catch (err) {
      console.error(`Error al leer usuario ${userId}:`, err);
    }
  }

  return null;
}

/**
 * Busca un usuario por username o email
 */
function findUserByLogin(login, includePrivate = false) {
  if (!login) return null;
  const normalized = login.trim().toLowerCase();

  // 1. Buscar en memoria
  for (const user of memoryUsers.values()) {
    if (user.username.toLowerCase() === normalized || (user.email && user.email.toLowerCase() === normalized)) {
      return includePrivate ? user : sanitizeUser(user);
    }
  }

  // 2. Buscar en disco
  try {
    const files = fs.readdirSync(USERS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(USERS_DIR, file);
        const data = fs.readFileSync(filePath, 'utf-8');
        const user = JSON.parse(data);
        memoryUsers.set(user.id, user);
        if (user.username.toLowerCase() === normalized || (user.email && user.email.toLowerCase() === normalized)) {
          return includePrivate ? user : sanitizeUser(user);
        }
      }
    }
  } catch (err) {
    console.error('Error buscando usuario en disco:', err);
  }

  return null;
}

/**
 * Registra un nuevo usuario en el sistema
 */
function createUser({ name, username, email, password }) {
  if (!username || !password) {
    throw new Error('El nombre de usuario y la contraseña son obligatorios.');
  }

  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length < 3) {
    throw new Error('El nombre de usuario debe tener al menos 3 caracteres.');
  }

  if (password.length < 4) {
    throw new Error('La contraseña debe tener al menos 4 caracteres.');
  }

  if (findUserByLogin(cleanUsername, true)) {
    throw new Error(`El nombre de usuario '${cleanUsername}' ya está registrado.`);
  }

  if (email && findUserByLogin(email.trim().toLowerCase(), true)) {
    throw new Error(`El correo '${email}' ya está en uso.`);
  }

  const userId = `usr-${cleanUsername}-${Date.now().toString(36)}`;
  const { hash, salt } = hashPassword(password);

  const newUser = {
    id: userId,
    name: name ? name.trim() : username.trim(),
    username: cleanUsername,
    email: email ? email.trim().toLowerCase() : null,
    password_hash: hash,
    salt,
    rating: 1200,
    games_played: 0,
    games_won: 0,
    games_lost: 0,
    games_drawn: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  saveUser(newUser);

  // Generar token de sesión inicial
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, newUser.id);

  return {
    user: sanitizeUser(newUser),
    token
  };
}

/**
 * Autentica un usuario y genera un token de sesión
 */
function authenticateUser({ login, password }) {
  if (!login || !password) {
    throw new Error('Se requiere usuario/correo y contraseña.');
  }

  const user = findUserByLogin(login, true);
  if (!user) {
    throw new Error('Credenciales incorrectas: usuario no encontrado.');
  }

  const isValid = verifyPassword(password, user.password_hash, user.salt);
  if (!isValid) {
    throw new Error('Credenciales incorrectas: contraseña no válida.');
  }

  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, user.id);

  return {
    user: sanitizeUser(user),
    token
  };
}

/**
 * Obtiene el usuario autenticado a partir de un token de sesión
 */
function getUserByToken(token) {
  if (!token || !activeSessions.has(token)) return null;
  const userId = activeSessions.get(token);
  return getUserById(userId, false);
}

/**
 * Cierra la sesión activa invalidando el token
 */
function invalidateToken(token) {
  if (token && activeSessions.has(token)) {
    activeSessions.delete(token);
    return true;
  }
  return false;
}

/**
 * Lista todos los perfiles de usuarios registrados
 */
function listUsers() {
  const users = [];
  try {
    const files = fs.readdirSync(USERS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const id = file.replace('.json', '');
        const user = getUserById(id, false);
        if (user) users.push(user);
      }
    }
  } catch (err) {
    console.error('Error al listar usuarios:', err);
  }
  return users;
}

/**
 * Actualiza las estadísticas y rating de un usuario tras finalizar una partida
 * result: 'WIN' | 'LOSS' | 'DRAW'
 */
function updateUserStats(userId, result) {
  const user = getUserById(userId, true);
  if (!user) return null;

  user.games_played = (user.games_played || 0) + 1;

  if (result === 'WIN') {
    user.games_won = (user.games_won || 0) + 1;
    user.rating = Math.max(100, (user.rating || 1200) + 15);
  } else if (result === 'LOSS') {
    user.games_lost = (user.games_lost || 0) + 1;
    user.rating = Math.max(100, (user.rating || 1200) - 10);
  } else if (result === 'DRAW') {
    user.games_drawn = (user.games_drawn || 0) + 1;
  }

  saveUser(user);
  return sanitizeUser(user);
}

/**
 * Consulta y filtra todas las partidas en las que ha participado un usuario
 */
function getUserGames(userId) {
  if (!userId) return [];
  const userGames = [];

  try {
    if (!fs.existsSync(GAMES_DIR)) return [];
    const files = fs.readdirSync(GAMES_DIR);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(GAMES_DIR, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const game = JSON.parse(raw);

        // Identificar si el usuario participó en la partida
        const isWhite = game.white_player && (game.white_player.id === userId || game.white_player.username === userId);
        const isBlack = game.black_player && (game.black_player.id === userId || game.black_player.username === userId);

        if (isWhite || isBlack) {
          const userSide = isWhite ? 'white' : 'black';
          const opponent = isWhite ? (game.black_player || { name: 'Robot / Rival' }) : (game.white_player || { name: 'Robot / Rival' });

          // Calcular resultado relativo al usuario
          let result = 'IN_PROGRESS';
          if (game.status === 'CHECKMATE' || game.status === 'RESIGNED') {
            if (game.winner === userSide) {
              result = 'WIN';
            } else if (game.winner === 'draw') {
              result = 'DRAW';
            } else {
              result = 'LOSS';
            }
          } else if (game.status === 'STALEMATE' || game.status === 'DRAW') {
            result = 'DRAW';
          }

          userGames.push({
            id: game.id,
            user_side: userSide,
            opponent,
            status: game.status,
            result,
            winner: game.winner || null,
            in_check: game.in_check || false,
            turn: game.turn,
            movements_count: game.movements ? game.movements.length : 0,
            last_move: game.movements && game.movements.length > 0 ? game.movements[game.movements.length - 1].san : null,
            created_at: game.created_at,
            updated_at: game.updated_at
          });
        }
      } catch (err) {
        console.error(`Error leyendo partida ${file}:`, err);
      }
    }
  } catch (err) {
    console.error('Error al obtener partidas de usuario:', err);
  }

  // Ordenar por fecha de actualización descendente (las más recientes primero)
  return userGames.sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
}

// Inicializar un usuario demo por defecto si el directorio está vacío
try {
  const existingFiles = fs.readdirSync(USERS_DIR).filter(f => f.endsWith('.json'));
  if (existingFiles.length === 0) {
    createUser({
      name: 'Carlos Ajedrecista',
      username: 'carlos',
      email: 'carlos@example.com',
      password: 'chess'
    });
    createUser({
      name: 'Ana Maestra',
      username: 'ana',
      email: 'ana@example.com',
      password: 'chess'
    });
    console.log('Usuarios demo inicializados: carlos y ana (contraseña: chess)');
  }
} catch (e) {
  console.error('Error al inicializar usuarios demo:', e);
}

module.exports = {
  createUser,
  authenticateUser,
  getUserById,
  getUserByToken,
  invalidateToken,
  listUsers,
  updateUserStats,
  getUserGames,
  sanitizeUser
};
