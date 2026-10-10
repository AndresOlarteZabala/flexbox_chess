/* Crónica medieval basada exclusivamente en el estado validado del servidor. */
(function (global) {
  const rival = side => side === 'white' ? 'black' : 'white';
  const kingdom = side => side === 'white' ? 'el reino blanco' : 'el reino negro';
  const ofKingdom = side => side === 'white' ? 'del reino blanco' : 'del reino negro';
  const roles = {
    pawn: { title: 'Infantería', detail: 'Soldados que abren camino y pueden ascender al cruzar el campo.' },
    horse: { title: 'Caballería', detail: 'Jinetes que saltan las líneas y sorprenden al enemigo.' },
    bishop: { title: 'Consejeros de guerra', detail: 'Estrategas que recorren las diagonales del campo.' },
    tower: { title: 'Fortalezas', detail: 'Bastiones móviles que dominan filas y columnas.' },
    queen: { title: 'Comandante', detail: 'La dama dirige la ofensiva más poderosa del reino.' },
    king: { title: 'Soberano', detail: 'Su protección decide el destino de la campaña.' }
  };
  const maneuvers = {
    pawn: ['La infantería marcha a {to}. Cada paso acerca a los soldados a su destino.', 'Un soldado ocupa {to}. El frente empieza a cambiar.', 'La infantería avanza a {to}. El reino sostiene su marcha.'],
    horse: ['La caballería salta hacia {to}. Los jinetes buscan una nueva ruta de ataque.', 'Los cascos retumban en {to}. La caballería cambia de posición.', 'Un destacamento de jinetes alcanza {to}. La maniobra está en marcha.'],
    bishop: ['Un consejero de guerra toma la diagonal hacia {to}. La estrategia cobra forma.', 'El alfil se despliega en {to}. Los consejeros extienden su influencia.', 'Desde {to}, el consejero prepara la siguiente maniobra.'],
    tower: ['La fortaleza se desplaza a {to}. Su bastión domina una nueva posición.', 'Una torre ocupa {to}. El reino mueve sus murallas al frente.', 'El bastión llega a {to}. La fortaleza queda preparada para combatir.'],
    queen: ['La comandante se despliega en {to}. La dama entra en escena.', 'La dama alcanza {to}. La comandante dirige una nueva maniobra.', 'Desde {to}, la comandante prepara su próxima ofensiva.'],
    king: ['El soberano se desplaza a {to}. El destino del reino viaja con él.', 'El rey ocupa {to}. Su guardia reorganiza la defensa.', 'El soberano cambia su posición a {to}. La campaña continúa.']
  };

  function cavalry(moves, side) {
    let remaining = 2;
    let lost = 0;
    for (const move of moves) {
      if (move.side === side && move.promotion === 'horse') remaining++;
      if (move.captured?.side === side && move.captured.name === 'horse') { remaining--; lost++; }
    }
    return { remaining, lost };
  }

  // Un jaque de dama requiere una línea libre hasta el rey: mover una dama
  // también puede descubrir un jaque de otra pieza y no basta para atribuírselo.
  function queenBesieges(board, side) {
    const entries = Object.entries(board || {});
    const king = entries.find(([, p]) => p?.side === side && p.name === 'king');
    if (!king) return false;
    const [square] = king;
    const x = square.charCodeAt(0), y = Number(square[1]);
    return entries.some(([from, p]) => {
      if (p?.side !== rival(side) || p.name !== 'queen') return false;
      const dx = x - from.charCodeAt(0), dy = y - Number(from[1]);
      if (!(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) return false;
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      for (let i = 1; i < steps; i++) {
        const through = String.fromCharCode(from.charCodeAt(0) + Math.sign(dx) * i) + (Number(from[1]) + Math.sign(dy) * i);
        if (board[through]) return false;
      }
      return steps > 0;
    });
  }

  function ending(game) {
    if (game.status === 'CHECKMATE') return `¡Las defensas han cedido! La última salida del soberano ha sido cerrada. ${kingdom(game.winner)} vence por jaque mate; sus estandartes coronan el final de la campaña.`;
    if (game.status === 'RESIGNED') return `${kingdom(rival(game.winner))} depone las armas. ${kingdom(game.winner)} vence por rendición.`;
    if (game.status === 'STALEMATE' || game.status === 'DRAW' || game.winner === 'draw') {
      const reasons = { INSUFFICIENT_MATERIAL: 'Faltan fuerzas para dar mate.', FIFTY_MOVE_RULE: 'Cincuenta movimientos sin capturas ni avances de peón sellan la tregua.', THREEFOLD_REPETITION: 'La misma posición ha regresado tres veces.' };
      return `${reasons[game.draw_reason] || 'Ningún reino consigue imponerse.'} La campaña termina en tablas, sin vencedor.`;
    }
    if (game.status === 'TIMEOUT') return `El tiempo se ha agotado. ${kingdom(game.winner)} gana la campaña.`;
    return '';
  }

  function check(game) {
    if (!game.in_check) return '';
    const side = game.turn;
    const horses = cavalry(game.movements || [], side);
    if (queenBesieges(game.board, side)) {
      const context = horses.lost > 0 ? (horses.remaining === 0 ? 'Sin caballería que lo auxilie, ' : 'Tras perder parte de su caballería, ') : '';
      return `${context}${kingdom(side)} afronta el asedio de la dama enemiga. ¡Jaque!`;
    }
    return `${kingdom(side)} tiene a su soberano bajo ataque. ¡Jaque!`;
  }

  function describe(game) {
    const end = ending(game);
    if (end) return end;
    const moves = game.movements || [];
    const move = moves.at(-1);
    if (!move) return game.status === 'WAITING_FOR_PLAYER' ? 'Un reino espera a su adversario antes de iniciar la campaña.' : 'Dos reinos despliegan sus ejércitos. La campaña comienza.';
    const lines = [];
    if (move.captured) {
      const victim = move.captured;
      if (victim.name === 'horse' && cavalry(moves, victim.side).remaining === 0) lines.push(`El último jinete ${ofKingdom(victim.side)} cayó. Su soberano deberá resistir sin caballería.`);
      else if (victim.name === 'queen') lines.push(`¡La comandante ha caído! La dama ${ofKingdom(victim.side)} deja a sus fuerzas sin su arma más poderosa.`);
      else if (victim.name === 'tower') lines.push(`¡Una fortaleza ${ofKingdom(victim.side)} se derrumba en ${move.to}! ${kingdom(move.side)} ha tomado el bastión.`);
      else if (victim.name === 'bishop') lines.push(`Un consejero de guerra ${ofKingdom(victim.side)} cae en ${move.to}. El reino pierde uno de sus estrategas.`);
      else if (victim.name === 'horse') lines.push(`La caballería ${ofKingdom(victim.side)} pierde un jinete en ${move.to}. El combate deja su huella.`);
      else lines.push(`Un soldado de infantería ${ofKingdom(victim.side)} cae en ${move.to}. ${kingdom(move.side)} gana terreno en el combate.`);
      const previousCapture = moves.slice(0, -1).reverse().find(m => m.captured);
      if (previousCapture && previousCapture.side !== move.side) lines.push('¡El reino responde al último golpe enemigo!');
    }
    if (move.castling) lines.push(`¡Cierren las puertas! El soberano ${ofKingdom(move.side)} busca refugio tras la torre. Rey y fortaleza se reúnen en un enroque ${move.castling.side === 'queenside' ? 'largo' : 'corto'}. La defensa se reorganiza.`);
    if (move.promotion) {
      const ascension = { queen: 'asciende a comandante. ¡Una nueva dama se alza entre sus filas!', tower: 'levanta una nueva fortaleza. ¡Una torre refuerza el reino!', bishop: 'asciende a consejero de guerra. Un nuevo alfil toma su puesto.', horse: 'se une a la caballería. ¡Un nuevo jinete entra en combate!' };
      lines.push(`¡De soldado a leyenda! Un peón de la infantería ${ofKingdom(move.side)} cruza el campo hasta ${move.to} y ${ascension[move.promotion] || 'alcanza una nueva dignidad.'}`);
    }
    const siege = check(game);
    if (siege) lines.push(siege);
    if (!lines.length) {
      const options = maneuvers[move.type] || ['Las fuerzas se despliegan en {to}.'];
      lines.push(`${kingdom(move.side)}: ${options[(moves.length - 1) % options.length].replace('{to}', move.to)}`);
      if (moves.at(-2)?.is_check) lines.push('El soberano ha superado el jaque. El reino respira de nuevo.');
    }
    return lines.join(' ');
  }

  function summary(game) {
    return ending(game) || check(game) || (!(game.movements || []).length ? describe(game) : `La campaña continúa tras ${game.movements.length} jugadas. Los reinos preparan su siguiente maniobra.`);
  }

  class Narrator {
    constructor({ output, clear = () => {}, cancel = () => {} }) {
      this.output = output;
      this.clear = clear;
      this.cancel = cancel;
      this.enabled = false;
      this.paused = false;
      this.game = null;
      this.moves = [];
    }
    setEnabled(enabled) {
      this.enabled = enabled;
      this.cancel();
      if (enabled && !this.paused && this.game) this.output(summary(this.game), this.game.movements?.length || 0);
    }
    setPaused(paused) {
      this.paused = paused;
      if (paused) this.cancel();
    }
    leaveGame() {
      this.cancel();
      this.game = null;
      this.moves = [];
      this.clear();
    }
    update(game) {
      const moves = game.movements || [];
      const signatures = moves.map(m => JSON.stringify(m));
      const reset = !this.game || this.game.id !== game.id || moves.length < this.moves.length || this.moves.some((m, i) => m !== signatures[i]);
      const changed = reset || moves.length !== this.moves.length || game.status !== this.game.status || game.winner !== this.game.winner;
      this.game = game;
      this.moves = signatures;
      if (reset) { this.cancel(); this.clear(); }
      if (changed && this.enabled && !this.paused) {
        const line = reset ? summary(game) : describe(game);
        if (line) this.output(line, moves.length);
      }
    }
  }

  const api = { Narrator, describe, summary, cavalry, queenBesieges, roles };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EpicNarrator = api;
})(typeof window === 'undefined' ? globalThis : window);
