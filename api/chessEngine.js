/**
 * Motor de reglas y lógica de ajedrez en el backend para Flexbox Chess.
 * Implementa la lógica oficial de movimientos, trayectorias, capturas,
 * turnos, relojes y persistencia de estados.
 */

const COLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const PIECE_NAMES = {
  k: 'king',
  q: 'queen',
  t: 'tower',
  b: 'bishop',
  h: 'horse',
  p: 'pawn'
};

const PIECE_POINTS = {
  king: 34,
  queen: 9,
  tower: 5,
  bishop: 3,
  horse: 3,
  pawn: 1
};

const PIECE_SYMBOLS = {
  white: {
    king: '♚',
    queen: '♛',
    tower: '♜',
    bishop: '♝',
    horse: '♞',
    pawn: '♟'
  },
  black: {
    king: '♚',
    queen: '♛',
    tower: '♜',
    bishop: '♝',
    horse: '♞',
    pawn: '♟'
  }
};

/**
 * Convierte casilla (ej. "e4") a coordenadas 1-indexed { col: 5, row: 4 }
 */
function squareToCoord(square) {
  if (!square || typeof square !== 'string' || square.length !== 2) return null;
  const colLetter = square[0].toLowerCase();
  const rowNum = parseInt(square[1], 10);
  const colIndex = COLS.indexOf(colLetter);
  if (colIndex === -1 || isNaN(rowNum) || rowNum < 1 || rowNum > 8) return null;
  return { col: colIndex + 1, row: rowNum, colLetter };
}

/**
 * Convierte coordenadas { col: 5, row: 4 } a casilla "e4"
 */
function coordToSquare(col, row) {
  if (col < 1 || col > 8 || row < 1 || row > 8) return null;
  return `${COLS[col - 1]}${row}`;
}

/**
 * Genera el estado inicial del tablero compatible con Flexbox Chess
 */
function createInitialBoard() {
  const board = {};
  for (let c = 1; c <= 8; c++) {
    for (let r = 1; r <= 8; r++) {
      board[coordToSquare(c, r)] = null;
    }
  }

  // Blancas
  board['a1'] = { id: 'tw1', name: 'tower', side: 'white', symbol: '♜', points: 5, col: 1, row: 1 };
  board['b1'] = { id: 'hw1', name: 'horse', side: 'white', symbol: '♞', points: 3, col: 2, row: 1 };
  board['c1'] = { id: 'bw1', name: 'bishop', side: 'white', symbol: '♝', points: 3, col: 3, row: 1 };
  board['d1'] = { id: 'qw',  name: 'queen', side: 'white', symbol: '♛', points: 9, col: 4, row: 1 };
  board['e1'] = { id: 'kw',  name: 'king', side: 'white', symbol: '♚', points: 34, col: 5, row: 1 };
  board['f1'] = { id: 'bw2', name: 'bishop', side: 'white', symbol: '♝', points: 3, col: 6, row: 1 };
  board['g1'] = { id: 'hw2', name: 'horse', side: 'white', symbol: '♞', points: 3, col: 7, row: 1 };
  board['h1'] = { id: 'tw2', name: 'tower', side: 'white', symbol: '♜', points: 5, col: 8, row: 1 };

  for (let c = 1; c <= 8; c++) {
    const colL = COLS[c - 1];
    board[`${colL}2`] = { id: `pw${c}`, name: 'pawn', side: 'white', symbol: '♟', points: 1, col: c, row: 2 };
  }

  // Negras
  board['a8'] = { id: 'tb1', name: 'tower', side: 'black', symbol: '♜', points: 5, col: 1, row: 8 };
  board['b8'] = { id: 'hb1', name: 'horse', side: 'black', symbol: '♞', points: 3, col: 2, row: 8 };
  board['c8'] = { id: 'bb1', name: 'bishop', side: 'black', symbol: '♝', points: 3, col: 3, row: 8 };
  board['d8'] = { id: 'qb',  name: 'queen', side: 'black', symbol: '♛', points: 9, col: 4, row: 8 };
  board['e8'] = { id: 'kb',  name: 'king', side: 'black', symbol: '♚', points: 34, col: 5, row: 8 };
  board['f8'] = { id: 'bb2', name: 'bishop', side: 'black', symbol: '♝', points: 3, col: 6, row: 8 };
  board['g8'] = { id: 'hb2', name: 'horse', side: 'black', symbol: '♞', points: 3, col: 7, row: 8 };
  board['h8'] = { id: 'tb2', name: 'tower', side: 'black', symbol: '♜', points: 5, col: 8, row: 8 };

  for (let c = 1; c <= 8; c++) {
    const colL = COLS[c - 1];
    board[`${colL}7`] = { id: `pb${c}`, name: 'pawn', side: 'black', symbol: '♟', points: 1, col: c, row: 7 };
  }

  return board;
}

/**
 * Valida si el camino entre dos casillas está libre (para Torre, Alfil, Dama)
 */
function isTrajectoryClear(board, fromCoord, toCoord) {
  const dCol = toCoord.col - fromCoord.col;
  const dRow = toCoord.row - fromCoord.row;

  const stepCol = dCol === 0 ? 0 : dCol / Math.abs(dCol);
  const stepRow = dRow === 0 ? 0 : dRow / Math.abs(dRow);

  let curCol = fromCoord.col + stepCol;
  let curRow = fromCoord.row + stepRow;

  while (curCol !== toCoord.col || curRow !== toCoord.row) {
    const sq = coordToSquare(curCol, curRow);
    if (board[sq] !== null && board[sq] !== undefined) {
      return false; // Obstáculo encontrado
    }
    curCol += stepCol;
    curRow += stepRow;
  }

  return true;
}

/**
 * Valida un movimiento según el tipo de pieza
 */
function validatePieceMove(board, piece, fromCoord, toCoord, targetPiece) {
  const dCol = toCoord.col - fromCoord.col;
  const dRow = toCoord.row - fromCoord.row;
  const absDCol = Math.abs(dCol);
  const absDRow = Math.abs(dRow);

  // No se puede capturar una pieza del mismo bando
  if (targetPiece && targetPiece.side === piece.side) {
    return { valid: false, error: 'No puedes capturar una pieza de tu propio bando' };
  }

  switch (piece.name) {
    case 'king':
      if (absDCol <= 1 && absDRow <= 1) {
        return { valid: true };
      }
      return { valid: false, error: 'El rey solo puede moverse una casilla en cualquier dirección' };

    case 'queen':
      if ((dCol === 0 || dRow === 0 || absDCol === absDRow) && (dCol !== 0 || dRow !== 0)) {
        if (!isTrajectoryClear(board, fromCoord, toCoord)) {
          return { valid: false, error: 'Hay piezas bloqueando la trayectoria de la reina' };
        }
        return { valid: true };
      }
      return { valid: false, error: 'Movimiento inválido para la reina (debe ser línea recta o diagonal)' };

    case 'tower':
      if ((dCol === 0 && dRow !== 0) || (dRow === 0 && dCol !== 0)) {
        if (!isTrajectoryClear(board, fromCoord, toCoord)) {
          return { valid: false, error: 'Hay piezas bloqueando la trayectoria de la torre' };
        }
        return { valid: true };
      }
      return { valid: false, error: 'La torre solo puede moverse en línea recta horizontal o vertical' };

    case 'bishop':
      if (absDCol === absDRow && absDCol > 0) {
        if (!isTrajectoryClear(board, fromCoord, toCoord)) {
          return { valid: false, error: 'Hay piezas bloqueando la trayectoria del alfil' };
        }
        return { valid: true };
      }
      return { valid: false, error: 'El alfil solo puede moverse en diagonal' };

    case 'horse':
      // Salto en "L": 2 en un eje y 1 en el otro
      if ((absDCol === 1 && absDRow === 2) || (absDCol === 2 && absDRow === 1)) {
        return { valid: true }; // Salta sobre piezas
      }
      return { valid: false, error: 'El caballo debe moverse en forma de "L" (2 casillas en un eje y 1 en el otro)' };

    case 'pawn': {
      const direction = piece.side === 'white' ? 1 : -1;
      const initialRow = piece.side === 'white' ? 2 : 7;

      // Avance frontal simple (sin captura)
      if (dCol === 0 && dRow === direction && !targetPiece) {
        return { valid: true };
      }

      // Avance frontal doble (desde casilla inicial, sin piezas en medio)
      if (dCol === 0 && dRow === 2 * direction && fromCoord.row === initialRow && !targetPiece) {
        const intermediateSquare = coordToSquare(fromCoord.col, fromCoord.row + direction);
        if (!board[intermediateSquare]) {
          return { valid: true };
        }
        return { valid: false, error: 'La casilla intermedia del peón está bloqueada' };
      }

      // Captura en diagonal (1 casilla adelante, 1 al lado)
      if (absDCol === 1 && dRow === direction && targetPiece && targetPiece.side !== piece.side) {
        return { valid: true };
      }

      return { valid: false, error: 'Movimiento inválido para el peón' };
    }

    default:
      return { valid: false, error: `Tipo de pieza desconocido: ${piece.name}` };
  }
}

/**
 * Genera la Notación Algebraica Estándar (SAN) clásica para un movimiento
 */
function formatMoveSAN(piece, fromSquare, toSquare, captured, isCheck, isCheckmate) {
  let pieceLetter = '';
  switch (piece.name) {
    case 'king': pieceLetter = 'K'; break;
    case 'queen': pieceLetter = 'Q'; break;
    case 'tower': pieceLetter = 'R'; break;
    case 'bishop': pieceLetter = 'B'; break;
    case 'horse': pieceLetter = 'N'; break;
    case 'pawn': pieceLetter = ''; break;
  }

  let san = '';
  if (piece.name === 'pawn') {
    if (captured) {
      san = `${fromSquare[0]}x${toSquare}`;
    } else {
      san = toSquare;
    }
  } else {
    san = `${pieceLetter}${captured ? 'x' : ''}${toSquare}`;
  }

  if (isCheckmate) san += '#';
  else if (isCheck) san += '+';

  return san;
}

/**
 * Clona el tablero
 */
function cloneBoard(board) {
  const newBoard = {};
  for (const [k, v] of Object.entries(board)) {
    newBoard[k] = v ? { ...v } : null;
  }
  return newBoard;
}

/**
 * Encuentra la casilla del rey de un bando
 */
function findKing(board, side) {
  for (const [sq, piece] of Object.entries(board)) {
    if (piece && piece.name === 'king' && piece.side === side) {
      return sq;
    }
  }
  return null;
}

/**
 * Determina si una casilla está siendo atacada por un bando
 */
function isSquareAttacked(board, targetSq, bySide) {
  const targetCoord = squareToCoord(targetSq);
  if (!targetCoord) return false;

  for (const [fromSq, piece] of Object.entries(board)) {
    if (piece && piece.side === bySide) {
      const fromCoord = squareToCoord(fromSq);
      if (!fromCoord) continue;

      if (piece.name === 'pawn') {
        const direction = bySide === 'white' ? 1 : -1;
        const dCol = Math.abs(targetCoord.col - fromCoord.col);
        const dRow = targetCoord.row - fromCoord.row;
        if (dCol === 1 && dRow === direction) {
          return true;
        }
      } else {
        const dummyTargetPiece = { side: bySide === 'white' ? 'black' : 'white', name: 'dummy' };
        const val = validatePieceMove(board, piece, fromCoord, targetCoord, dummyTargetPiece);
        if (val.valid) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Determina si el rey de un bando se encuentra en jaque
 */
function isKingInCheck(board, side) {
  const kingSq = findKing(board, side);
  if (!kingSq) return false;
  const bySide = side === 'white' ? 'black' : 'white';
  return isSquareAttacked(board, kingSq, bySide);
}

/**
 * Determina si un movimiento deja o mantiene al propio rey en jaque
 */
function isMoveLeavingKingInCheck(board, move, side) {
  const simBoard = cloneBoard(board);
  const piece = simBoard[move.from];
  if (!piece) return false;

  const toCoord = squareToCoord(move.to);
  if (!toCoord) return false;

  simBoard[move.to] = {
    ...piece,
    col: toCoord.col,
    row: toCoord.row,
    state: 'moved'
  };
  simBoard[move.from] = null;

  return isKingInCheck(simBoard, side);
}

/**
 * Obtiene todos los movimientos 100% legales para un bando
 */
function getAllLegalMoves(board, side) {
  const legalMoves = [];
  for (const [fromSq, piece] of Object.entries(board)) {
    if (piece && piece.side === side) {
      const fromCoord = squareToCoord(fromSq);
      if (!fromCoord) continue;

      for (let c = 1; c <= 8; c++) {
        for (let r = 1; r <= 8; r++) {
          const toSq = coordToSquare(c, r);
          if (fromSq === toSq) continue;
          const targetPiece = board[toSq];
          const val = validatePieceMove(board, piece, fromCoord, { col: c, row: r }, targetPiece);
          if (val.valid) {
            if (!isMoveLeavingKingInCheck(board, { from: fromSq, to: toSq }, side)) {
              legalMoves.push({
                from: fromSq,
                to: toSq,
                piece: piece.name,
                captured: targetPiece ? { name: targetPiece.name, points: targetPiece.points } : null
              });
            }
          }
        }
      }
    }
  }
  return legalMoves;
}

/**
 * Inicializa un nuevo estado completo de partida
 */
function createGameState(gameId, options = {}) {
  const now = new Date();
  return {
    id: gameId || `game-${Date.now()}`,
    status: 'IN_PROGRESS', // IN_PROGRESS, CHECKMATE, STALEMATE, RESIGNED, TIMEOUT
    winner: null, // 'white', 'black', 'draw', null
    in_check: false,
    mode: options.mode || 'timed', // 'timed' o 'async'
    turn: 'white',
    turn_count: 0,
    board: createInitialBoard(),
    captured_pieces: {
      white: [],
      black: []
    },
    points: {
      white: 0,
      black: 0
    },
    clocks: {
      white: 0,
      black: 0,
      last_turn_started_at: now.toISOString()
    },
    movements: [],
    white_player: options.white_player || { id: 'guest-w', username: 'blancas', name: 'Jugador Blancas' },
    black_player: options.black_player || (options.mode === 'bot' ? { id: 'bot', username: 'robot', name: 'Robot IA' } : { id: 'guest-b', username: 'negras', name: 'Jugador Negras' }),
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };
}

/**
 * Ejecuta un movimiento en la partida validando reglas, jaque, jaque mate y persistiendo
 */
function applyMove(gameState, { from, to }) {
  if (!gameState) {
    return { success: false, error: { message: 'Partida no encontrada' } };
  }

  if (gameState.status === 'CHECKMATE' || gameState.status === 'RESIGNED' || gameState.status === 'STALEMATE') {
    const winnerText = gameState.winner === 'draw' ? 'Tablas' : (gameState.winner === 'white' ? 'Blancas' : 'Negras');
    return {
      success: false,
      error: { message: `La partida ha finalizado por ${gameState.status}. Ganador: ${winnerText}.` }
    };
  }

  const fromSquare = from.toLowerCase().trim();
  const toSquare = to.toLowerCase().trim();

  if (fromSquare === toSquare) {
    return { success: false, error: { message: 'La casilla de origen y destino deben ser distintas' } };
  }

  const fromCoord = squareToCoord(fromSquare);
  const toCoord = squareToCoord(toSquare);

  if (!fromCoord || !toCoord) {
    return { success: false, error: { message: `Coordenadas inválidas: de ${from} a ${to}` } };
  }

  const piece = gameState.board[fromSquare];
  if (!piece) {
    return { success: false, error: { message: `No hay ninguna pieza en la casilla ${fromSquare}` } };
  }

  if (piece.side !== gameState.turn) {
    return {
      success: false,
      error: {
        message: `Turno de las ${gameState.turn === 'white' ? 'blancas' : 'negras'}. No puedes mover la pieza de ${fromSquare}.`
      }
    };
  }

  const targetPiece = gameState.board[toSquare];

  // Validar reglas del movimiento de la pieza
  const validation = validatePieceMove(gameState.board, piece, fromCoord, toCoord, targetPiece);
  if (!validation.valid) {
    return { success: false, error: { message: validation.error } };
  }

  // Validar que el movimiento no deje al rey propio en jaque
  if (isMoveLeavingKingInCheck(gameState.board, { from: fromSquare, to: toSquare }, piece.side)) {
    return {
      success: false,
      error: { message: 'Movimiento ilegal: el rey quedaría o permanecería en jaque.' }
    };
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('es-CO');
  const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Procesar captura si hubo
  let capturedInfo = null;
  if (targetPiece) {
    capturedInfo = {
      id: targetPiece.id,
      name: targetPiece.name,
      side: targetPiece.side,
      points: targetPiece.points || PIECE_POINTS[targetPiece.name] || 1,
      square: toSquare
    };

    gameState.captured_pieces[gameState.turn].push(capturedInfo);
    gameState.points[gameState.turn] += capturedInfo.points;
  }

  // Actualizar pieza en el tablero
  const updatedPiece = {
    ...piece,
    col: toCoord.col,
    row: toCoord.row,
    state: 'moved'
  };

  gameState.board[toSquare] = updatedPiece;
  gameState.board[fromSquare] = null;

  // Evaluar Jaque y Jaque Mate para el bando contrario
  const movingSide = gameState.turn;
  const nextSide = movingSide === 'white' ? 'black' : 'white';

  const opponentInCheck = isKingInCheck(gameState.board, nextSide);
  const opponentLegalMoves = getAllLegalMoves(gameState.board, nextSide);

  let isCheck = false;
  let isCheckmate = false;
  let isStalemate = false;

  if (opponentLegalMoves.length === 0) {
    if (opponentInCheck) {
      // ¡JAQUE MATE!
      isCheckmate = true;
      gameState.status = 'CHECKMATE';
      gameState.winner = movingSide; // ¡El bando que ejecutó el mate es el GANADOR!
      gameState.in_check = true;
    } else {
      // REY AHOGADO (STALEMATE / TABLAS)
      isStalemate = true;
      gameState.status = 'STALEMATE';
      gameState.winner = 'draw';
      gameState.in_check = false;
    }
  } else if (opponentInCheck) {
    isCheck = true;
    gameState.in_check = true;
  } else {
    gameState.in_check = false;
  }

  // Notación SAN
  const san = formatMoveSAN(piece, fromSquare, toSquare, !!targetPiece, isCheck, isCheckmate);
  const classicVal = `${piece.id} -> ${toCoord.row}${COLS[toCoord.col - 1]}`;

  // Registrar movimiento
  const moveRecord = {
    id: piece.id,
    type: piece.name,
    side: movingSide,
    turn: gameState.turn_count + 1,
    from: fromSquare,
    to: toSquare,
    date: dateStr,
    time: timeStr,
    san: san,
    classic_val: classicVal,
    captured: capturedInfo,
    is_check: isCheck,
    is_checkmate: isCheckmate,
    is_stalemate: isStalemate,
    pos: {
      initial: { id: fromSquare, col: fromCoord.col, row: fromCoord.row },
      final: { id: toSquare, col: toCoord.col, row: toCoord.row }
    }
  };

  if (!gameState.movements) gameState.movements = [];
  gameState.movements.push(moveRecord);

  // Avanzar contador y cambiar turno solo si el juego sigue en curso
  gameState.turn_count += 1;
  if (gameState.status === 'IN_PROGRESS') {
    gameState.turn = nextSide;
  }
  gameState.updated_at = now.toISOString();

  return {
    success: true,
    data: {
      move: moveRecord,
      status: gameState.status,
      winner: gameState.winner || null,
      in_check: gameState.in_check || false,
      turn: gameState.turn,
      turn_count: gameState.turn_count,
      points: gameState.points,
      captured_pieces: gameState.captured_pieces,
      board: gameState.board,
      clocks: gameState.clocks
    }
  };
}

/**
 * Obtiene la lista de todos los movimientos legales posibles para un bando
 */
function getLegalMoves(gameState, side) {
  const currentSide = side || gameState.turn;
  const board = gameState.board || gameState;
  return getAllLegalMoves(board, currentSide);
}

/**
 * Reconstruye la posición del tablero tras un número determinado de jugadas (step)
 * step = 0 retorna el tablero inicial.
 */
function getBoardAtStep(movements, step) {
  const board = createInitialBoard();
  if (!Array.isArray(movements)) return board;

  const maxSteps = step !== undefined && step !== null ? Math.min(step, movements.length) : movements.length;

  for (let i = 0; i < maxSteps; i++) {
    const mov = movements[i];
    if (!mov || !mov.from || !mov.to) continue;

    const piece = board[mov.from];
    if (piece) {
      const toCoord = squareToCoord(mov.to);
      board[mov.to] = {
        ...piece,
        col: toCoord ? toCoord.col : piece.col,
        row: toCoord ? toCoord.row : piece.row,
        state: 'moved'
      };
      board[mov.from] = null;
    }
  }

  return board;
}

module.exports = {
  COLS,
  PIECE_NAMES,
  PIECE_POINTS,
  PIECE_SYMBOLS,
  squareToCoord,
  coordToSquare,
  createInitialBoard,
  createGameState,
  applyMove,
  getLegalMoves,
  getBoardAtStep
};

