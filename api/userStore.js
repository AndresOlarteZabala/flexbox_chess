/**
 * Módulo de almacenamiento y autenticación de usuarios para Flexbox Chess.
 * Gestiona el registro, hashing seguro con salt (crypto nativo pbkdf2),
 * sesiones activas y estadísticas de partidas por usuario.
 * Persiste en SQLite (data/chess.db).
 */

const crypto = require('crypto');
const db = require('./db');

// Caché en memoria para usuarios
const memoryUsers = new Map();

const upsertUserStmt = db.prepare(`
  INSERT INTO users (id, username, email, created_at, updated_at, data)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    username = excluded.username,
    email = excluded.email,
    updated_at = excluded.updated_at,
    data = excluded.data
`);
const selectUserByIdStmt = db.prepare('SELECT data FROM users WHERE id = ?');
const selectUserByUsernameStmt = db.prepare('SELECT data FROM users WHERE username = ?');
const selectUserByEmailStmt = db.prepare('SELECT data FROM users WHERE email = ?');
const selectAllUsersStmt = db.prepare('SELECT data FROM users');
const countUsersStmt = db.prepare('SELECT COUNT(*) AS n FROM users');

const insertSessionStmt = db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)');
const selectSessionStmt = db.prepare('SELECT user_id FROM sessions WHERE token = ?');
const deleteSessionStmt = db.prepare('DELETE FROM sessions WHERE token = ?');

const selectUserGamesStmt = db.prepare(
  'SELECT data FROM games WHERE white_player_id = ? OR black_player_id = ? ORDER BY updated_at DESC'
);

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
 * Guarda un usuario en memoria y en SQLite
 */
function saveUser(user) {
  if (!user || !user.id) return;
  user.updated_at = new Date().toISOString();
  memoryUsers.set(user.id, user);

  try {
    upsertUserStmt.run(user.id, user.username, user.email || null, user.created_at, user.updated_at, JSON.stringify(user));
  } catch (err) {
    console.error(`Error al guardar usuario ${user.id} en SQLite:`, err);
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

  const row = selectUserByIdStmt.get(userId);
  if (row) {
    try {
      const user = JSON.parse(row.data);
      memoryUsers.set(user.id, user);
      return includePrivate ? user : sanitizeUser(user);
    } catch (err) {
      console.error(`Error al parsear usuario ${userId}:`, err);
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

  // 2. Buscar en SQLite (por username o email)
  const row = selectUserByUsernameStmt.get(normalized) || selectUserByEmailStmt.get(normalized);
  if (row) {
    try {
      const user = JSON.parse(row.data);
      memoryUsers.set(user.id, user);
      return includePrivate ? user : sanitizeUser(user);
    } catch (err) {
      console.error('Error al parsear usuario encontrado por login:', err);
    }
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
  insertSessionStmt.run(token, newUser.id);

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
  insertSessionStmt.run(token, user.id);

  return {
    user: sanitizeUser(user),
    token
  };
}

/**
 * Obtiene el usuario autenticado a partir de un token de sesión
 */
function getUserByToken(token) {
  if (!token) return null;
  const row = selectSessionStmt.get(token);
  if (!row) return null;
  return getUserById(row.user_id, false);
}

/**
 * Cierra la sesión activa invalidando el token
 */
function invalidateToken(token) {
  if (!token) return false;
  const result = deleteSessionStmt.run(token);
  return result.changes > 0;
}

/**
 * Lista todos los perfiles de usuarios registrados
 */
function listUsers() {
  try {
    return selectAllUsersStmt.all().map((row) => sanitizeUser(JSON.parse(row.data)));
  } catch (err) {
    console.error('Error al listar usuarios:', err);
    return [];
  }
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
    const rows = selectUserGamesStmt.all(userId, userId);

    for (const row of rows) {
      try {
        const game = JSON.parse(row.data);

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
        console.error(`Error leyendo partida ${row && row.id}:`, err);
      }
    }
  } catch (err) {
    console.error('Error al obtener partidas de usuario:', err);
  }

  return userGames;
}

// Inicializar usuarios demo por defecto si la base de datos está vacía
try {
  const { n } = countUsersStmt.get();
  if (n === 0) {
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
  findUserByLogin,
  invalidateToken,
  listUsers,
  updateUserStats,
  getUserGames,
  sanitizeUser
};
