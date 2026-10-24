const { createGameState, applyMove, getBoardAtStep } = require('./chessEngine');

// Ejemplos didácticos originales. No se guardan como partidas ni alteran estadísticas.
const definitions = [
  {
    id: 'opening', title: 'Una apertura con un plan', level: '1 · Primeros pasos',
    objective: 'Ocupar el centro, desarrollar piezas y preparar la seguridad del rey.',
    intro: 'Observa cómo ambos bandos ponen piezas en juego. Sigue las casillas resaltadas y lee la idea de cada movimiento.',
    moves: [
      ['e2', 'e4', 'El peón ocupa el centro y abre caminos para el alfil de f1 y la dama.'],
      ['e7', 'e5', 'Las negras también disputan el centro. Mira las casillas d4 y f4 que controla este peón.'],
      ['g1', 'f3', 'El caballo se desarrolla hacia el centro y ataca el peón de e5.'],
      ['b8', 'c6', 'Las negras desarrollan un caballo y defienden e5 al mismo tiempo.'],
      ['f1', 'c4', 'El alfil sale a una diagonal activa y apunta a f7, junto al rey rival.'],
      ['g8', 'f6', 'Otro caballo entra en juego y ataca e4. Desarrollar también puede crear amenazas.'],
      ['d2', 'd3', 'Este peón sostiene e4 y libera la diagonal del alfil de c1.'],
      ['f8', 'c5', 'El alfil negro se activa. Ambos bandos han despejado el camino para enrocar corto.'],
      ['e1', 'g1', 'Enroque corto: el rey va a g1 y la torre de h1 va a f1 en una sola jugada. No se puede enrocar en jaque ni atravesando casillas atacadas.'],
      ['e8', 'g8', 'Las negras también enrocan. Este ejemplo termina aquí: ya tienes un plan de apertura, aunque la partida continuaría.']
    ],
    takeaway: 'En la apertura, disputa el centro, activa caballos y alfiles y busca un momento seguro para enrocar.',
    question: '¿Qué combina desarrollo y una amenaza sobre el centro?',
    answers: ['Sacar el caballo de g1 a f3', 'Mover varias veces la misma torre', 'Avanzar solo peones de los bordes'], correct: 0,
    explanation: 'Cf3 desarrolla una pieza y ataca e5. Intenta que tus movimientos cumplan más de una función.'
  },
  {
    id: 'scholar', title: 'Detecta el mate en f7', level: '2 · Amenazas y defensa',
    objective: 'Reconocer una amenaza de mate y aprender una defensa antes de que llegue.',
    intro: 'Esta demostración muestra un error defensivo frecuente. No es una estrategia infalible: busca la amenaza y cómo detenerla.',
    moves: [
      ['e2', 'e4', 'Las blancas abren líneas para su alfil y su dama.'],
      ['e7', 'e5', 'Las negras responden en el centro. El peón de f7 todavía solo está defendido por su rey.'],
      ['f1', 'c4', 'El alfil apunta a f7. Conviene detectar qué piezas están mirando hacia tu rey.'],
      ['b8', 'c6', 'Cc6 desarrolla y protege e5, pero todavía hay que vigilar f7.'],
      ['d1', 'h5', 'La dama y el alfil amenazan Dxf7#. Las negras pueden jugar g6: el peón ataca la dama y corta su diagonal hacia f7.'],
      ['g8', 'f6', 'Aquí Cf6 es un error: ataca la dama, pero no evita Dxf7#. Antes de amenazar, comprueba si el rival tiene mate.'],
      ['h5', 'f7', 'Jaque mate: la dama ataca al rey desde f7 y el alfil de c4 la protege. El rey no puede capturarla.']
    ],
    takeaway: 'Antes de cada jugada revisa jaques, capturas y amenazas del rival. Atacar una dama no sirve si el rival puede dar mate.',
    question: 'Con la dama blanca en h5 y el alfil en c4, ¿qué defensa corta la diagonal hacia f7?',
    answers: ['Cf6, atacando la dama', 'g6, atacando la dama y bloqueando la diagonal', 'a6, esperando'], correct: 1,
    explanation: 'g6 interrumpe h5–g6–f7 y ataca la dama. Después de defenderte, sigue desarrollando tus piezas.'
  },
  {
    id: 'king-safety', title: 'No abras la puerta a tu rey', level: '3 · Seguridad del rey',
    objective: 'Entender por qué avanzar los peones de f y g puede dejar al rey expuesto.',
    intro: 'Una partida de solo cuatro movimientos individuales muestra el peligro de abrir diagonales junto al rey sin desarrollar piezas.',
    moves: [
      ['f2', 'f3', 'f3 debilita la diagonal e1–f2–g3–h4. El rey sigue en e1 y aún no hay piezas desarrolladas.'],
      ['e7', 'e5', 'Las negras ocupan el centro y liberan el camino de su dama hacia h4.'],
      ['g2', 'g4', 'g4 deja libre g3 y ya no permite que el peón de g2 bloquee un jaque desde h4. Las blancas ignoran el peligro.'],
      ['d8', 'h4', 'Dh4 es mate. La diagonal hasta e1 está abierta y las piezas blancas no pueden capturar la dama, bloquear el jaque ni sacar al rey.']
    ],
    takeaway: 'Cuida las diagonales que apuntan a tu rey. No avances los peones que lo protegen sin revisar qué líneas estás abriendo.',
    question: 'Antes de avanzar un peón junto al rey, ¿qué deberías revisar?',
    answers: ['Solo si puedo capturar en el siguiente turno', 'Únicamente cuántos peones tengo', 'Qué líneas de ataque se abren contra mi rey'], correct: 2,
    explanation: 'Los peones no retroceden. Cada avance cambia las casillas y diagonales que protegen a tu rey.'
  }
];

const lessons = definitions.map(definition => {
  const game = createGameState(`lesson-${definition.id}`);
  const positions = [{ step: 0, board: getBoardAtStep([], 0), current_move: null }];
  definition.moves.forEach(([from, to], index) => {
    const result = applyMove(game, { from, to });
    if (!result.success) throw new Error(`Lección ${definition.id}, paso ${index + 1}: ${JSON.stringify(result.error)}`);
    positions.push({ step: index + 1, board: getBoardAtStep(game.movements, index + 1), current_move: game.movements[index] });
  });
  return { ...definition, movements_count: definition.moves.length,
    notes: [definition.intro, ...definition.moves.map(move => move[2])],
    positions: positions.map(position => ({ ...position, total_moves: definition.moves.length })) };
});

function listLessons() {
  return lessons.map(({ id, title, level, objective, movements_count }) => ({ id, title, level, objective, movements_count }));
}

module.exports = { listLessons, getLesson: id => lessons.find(lesson => lesson.id === id) || null };
