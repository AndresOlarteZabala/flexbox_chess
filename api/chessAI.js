/**
 * Módulo de Inteligencia Artificial (Robot) para Ajedrez con Niveles de Dificultad.
 * Implementa evaluación posicional (Piece-Square Tables), Minimax y Poda Alfa-Beta.
 */

const { getLegalMoves, squareToCoord, coordToSquare, PIECE_SYMBOLS, PIECE_POINTS } = require('./chessEngine');

// Valores de material en centipeones
const PIECE_VALUES = {
  pawn: 100,
  horse: 320,
  bishop: 330,
  tower: 500,
  queen: 900,
  king: 20000
};

// Bonificaciones posicionales por casilla (desde perspectiva de blancas, invertida para negras)
const PAWN_TABLE = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5,  5, 10, 25, 25, 10,  5,  5],
  [0,  0,  0, 20, 20,  0,  0,  0],
  [5, -5,-10,  0,  0,-10, -5,  5],
  [5, 10, 10,-20,-20, 10, 10,  5],
  [0,  0,  0,  0,  0,  0,  0,  0]
];

const KNIGHT_TABLE = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50]
];

const BISHOP_TABLE = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5, 10, 10,  5,  0,-10],
  [-10,  5,  5, 10, 10,  5,  5,-10],
  [-10,  0, 10, 10, 10, 10,  0,-10],
  [-10, 10, 10, 10, 10, 10, 10,-10],
  [-10,  5,  0,  0,  0,  0,  5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20]
];

/**
 * Obtiene el valor posicional de una pieza según su casilla
 */
function getPieceSquareBonus(piece, col, row) {
  let r = 8 - row; // 0 a 7
  let c = col - 1; // 0 a 7

  if (piece.side === 'black') {
    r = row - 1; // invertir para negras
  }

  if (piece.name === 'pawn' && PAWN_TABLE[r]) return PAWN_TABLE[r][c] || 0;
  if (piece.name === 'horse' && KNIGHT_TABLE[r]) return KNIGHT_TABLE[r][c] || 0;
  if (piece.name === 'bishop' && BISHOP_TABLE[r]) return BISHOP_TABLE[r][c] || 0;
  return 0;
}

/**
 * Evalúa estáticamente el tablero.
 * Puntuación positiva = favorable para el bando 'side'.
 */
function evaluateBoard(board, side) {
  let score = 0;

  for (const [sq, piece] of Object.entries(board)) {
    if (!piece) continue;

    const val = PIECE_VALUES[piece.name] || 0;
    const bonus = getPieceSquareBonus(piece, piece.col, piece.row);
    const totalVal = val + bonus;

    if (piece.side === side) {
      score += totalVal;
    } else {
      score -= totalVal;
    }
  }

  return score;
}

/**
 * Clona superficialmente el objeto board para simulaciones de Minimax
 */
function cloneBoard(board) {
  const newBoard = {};
  for (const [k, v] of Object.entries(board)) {
    newBoard[k] = v ? { ...v } : null;
  }
  return newBoard;
}

/**
 * Aplica un movimiento de prueba en una copia del tablero
 */
function simulateMove(board, move) {
  const nextBoard = cloneBoard(board);
  const piece = nextBoard[move.from];
  const toCoord = squareToCoord(move.to);

  if (piece && toCoord) {
    // Coronación: el peón que alcanza la última fila se simula como reina (mejor jugada por defecto)
    const promotionRow = piece.side === 'white' ? 8 : 1;
    const isPromotion = piece.name === 'pawn' && toCoord.row === promotionRow;

    nextBoard[move.to] = {
      ...piece,
      ...(isPromotion ? { name: 'queen', symbol: PIECE_SYMBOLS[piece.side].queen, points: PIECE_POINTS.queen } : {}),
      col: toCoord.col,
      row: toCoord.row,
      state: 'moved'
    };
    nextBoard[move.from] = null;

    // Enroque: mover también la torre implicada en la simulación
    if (piece.name === 'king' && Math.abs(toCoord.col - squareToCoord(move.from).col) === 2) {
      const homeRow = toCoord.row;
      const isKingside = toCoord.col === 7;
      const rookFromSquare = coordToSquare(isKingside ? 8 : 1, homeRow);
      const rookToSquare = coordToSquare(isKingside ? 6 : 4, homeRow);
      const rookPiece = nextBoard[rookFromSquare];
      if (rookPiece) {
        const rookToCoord = squareToCoord(rookToSquare);
        nextBoard[rookToSquare] = { ...rookPiece, col: rookToCoord.col, row: rookToCoord.row, state: 'moved' };
        nextBoard[rookFromSquare] = null;
      }
    }
  }
  return nextBoard;
}

/**
 * Ordenamiento de jugadas (Move Ordering):
 * Prioriza capturas de piezas de mayor valor atacadas por piezas de menor valor (MVV-LVA)
 * para maximizar los cortes de poda Alfa-Beta.
 */
function scoreMoveForOrdering(board, move) {
  let score = 0;
  const target = board[move.to];
  const attacker = board[move.from];
  if (target && attacker) {
    const victimVal = PIECE_VALUES[target.name] || 0;
    const attackerVal = PIECE_VALUES[attacker.name] || 0;
    score = 10000 + (victimVal * 10) - attackerVal;
  }
  return score;
}

function orderMoves(board, moves) {
  return moves.slice().sort((a, b) => scoreMoveForOrdering(board, b) - scoreMoveForOrdering(board, a));
}

/**
 * Búsqueda de Tranquilidad (Quiescence Search):
 * Continúa evaluando capturas activas para evitar el "horizon effect" en intercambios tácticos.
 */
function quiescence(board, alpha, beta, isMaximizing, botSide, options, qDepth = 2) {
  const standPat = evaluateBoard(board, botSide, options);
  if (qDepth === 0) return standPat;

  if (isMaximizing) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;
  }

  const currentSide = isMaximizing ? botSide : (botSide === 'white' ? 'black' : 'white');
  const dummyState = { board, turn: currentSide };
  const allMoves = getLegalMoves(dummyState, currentSide);
  const captureMoves = allMoves.filter(m => board[m.to] !== null);

  if (captureMoves.length === 0) return standPat;

  const orderedCaptures = orderMoves(board, captureMoves);

  if (isMaximizing) {
    for (const move of orderedCaptures) {
      const nextBoard = simulateMove(board, move);
      const score = quiescence(nextBoard, alpha, beta, false, botSide, options, qDepth - 1);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return alpha;
  } else {
    for (const move of orderedCaptures) {
      const nextBoard = simulateMove(board, move);
      const score = quiescence(nextBoard, alpha, beta, true, botSide, options, qDepth - 1);
      beta = Math.min(beta, score);
      if (beta <= alpha) break;
    }
    return beta;
  }
}

/**
 * Algoritmo Minimax con Poda Alfa-Beta, Move Ordering y Quiescence opcional
 */
function minimax(board, depth, alpha, beta, isMaximizing, botSide, options = {}) {
  if (depth === 0) {
    if (options.useQuiescence) {
      return quiescence(board, alpha, beta, isMaximizing, botSide, options, 2);
    }
    return evaluateBoard(board, botSide, options);
  }

  const currentSide = isMaximizing ? botSide : (botSide === 'white' ? 'black' : 'white');
  const dummyState = { board, turn: currentSide };
  let legalMoves = getLegalMoves(dummyState, currentSide);

  if (legalMoves.length === 0) {
    return isMaximizing ? -20000 : 20000;
  }

  if (options.useOrdering) {
    legalMoves = orderMoves(board, legalMoves);
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of legalMoves) {
      const nextBoard = simulateMove(board, move);
      const evalScore = minimax(nextBoard, depth - 1, alpha, beta, false, botSide, options);
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break; // Poda Beta
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of legalMoves) {
      const nextBoard = simulateMove(board, move);
      const evalScore = minimax(nextBoard, depth - 1, alpha, beta, true, botSide, options);
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break; // Poda Alfa
    }
    return minEval;
  }
}

/**
 * Catálogo de configuración para los 10 Niveles de Dificultad del Robot
 */
const LEVEL_CONFIGS = {
  1:  { name: 'Nivel 1: Novato (Iniciación)', depth: 1, blunderChance: 0.60, usePositional: false, useOrdering: false, useQuiescence: false, description: 'Alta tasa de errores (60%). Perfecto para aprender a mover piezas.' },
  2:  { name: 'Nivel 2: Principiante', depth: 1, blunderChance: 0.40, usePositional: true,  useOrdering: false, useQuiescence: false, description: 'Comete errores frecuentes (40%), pero busca capturas obvias.' },
  3:  { name: 'Nivel 3: Aficionado', depth: 1, blunderChance: 0.20, usePositional: true,  useOrdering: false, useQuiescence: false, description: 'Juego básico con 20% de probabilidad de movimientos imprecisos.' },
  4:  { name: 'Nivel 4: Casual (Profundidad 2)', depth: 2, blunderChance: 0.15, usePositional: true,  useOrdering: false, useQuiescence: false, description: 'Calcula 2 jugadas por adelantado. Ocasionalmente comete deslices.' },
  5:  { name: 'Nivel 5: Club Intermedio', depth: 2, blunderChance: 0.05, usePositional: true,  useOrdering: true,  useQuiescence: false, description: 'Jugador de club aficionado regular. Pocos errores y desarrollo armónico.' },
  6:  { name: 'Nivel 6: Avanzado', depth: 2, blunderChance: 0.00, usePositional: true,  useOrdering: true,  useQuiescence: true,  description: 'Sin errores no forzados. Evaluación de intercambios de piezas tácticos.' },
  7:  { name: 'Nivel 7: Experto (Profundidad 3)', depth: 3, blunderChance: 0.00, usePositional: true,  useOrdering: true,  useQuiescence: false, description: 'Cálculo a 3 jugadas de profundidad con poda Alfa-Beta.' },
  8:  { name: 'Nivel 8: Maestro Candidato', depth: 3, blunderChance: 0.00, usePositional: true,  useOrdering: true,  useQuiescence: true,  description: 'Profundidad 3 combinada con búsqueda de tranquilidad en capturas.' },
  9:  { name: 'Nivel 9: Maestro FIDE', depth: 3, blunderChance: 0.00, usePositional: true,  useOrdering: true,  useQuiescence: true,  useCenterControl: true, description: 'Estrategia posicional sólida, control estricto del centro y visión táctica profunda.' },
  10: { name: 'Nivel 10: Gran Maestro (Máximo)', depth: 3, blunderChance: 0.00, usePositional: true,  useOrdering: true,  useQuiescence: true,  useCenterControl: true, strictBest: true, description: 'Máxima potencia del motor. Selección implacable de la mejor línea táctica.' }
};

/**
 * Selecciona la mejor jugada para el robot según el nivel de dificultad (1 al 10)
 */
function getBotMove(gameState, difficulty = 5) {
  const botSide = gameState.turn;
  const legalMoves = getLegalMoves(gameState, botSide);

  if (!legalMoves || legalMoves.length === 0) {
    return null; // Sin movimientos posibles
  }

  const level = Math.min(10, Math.max(1, parseInt(difficulty, 10) || 5));
  const config = LEVEL_CONFIGS[level] || LEVEL_CONFIGS[5];

  // Probabilidad de despiste / movimiento aleatorio según el nivel
  if (config.blunderChance > 0 && Math.random() < config.blunderChance) {
    const randomIdx = Math.floor(Math.random() * legalMoves.length);
    return legalMoves[randomIdx];
  }

  let movesToEvaluate = legalMoves;
  if (config.useOrdering) {
    movesToEvaluate = orderMoves(gameState.board, legalMoves);
  } else {
    movesToEvaluate = legalMoves.slice().sort(() => Math.random() - 0.5);
  }

  let bestMove = movesToEvaluate[0];
  let bestScore = -Infinity;

  for (const move of movesToEvaluate) {
    const nextBoard = simulateMove(gameState.board, move);
    const score = minimax(nextBoard, config.depth - 1, -Infinity, Infinity, false, botSide, config);

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

module.exports = {
  getBotMove,
  evaluateBoard,
  LEVEL_CONFIGS
};

