// node --test scripts/test-narrator.js (sin base de datos ni servicios externos).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameState, applyMove } = require('../api/chessEngine');
const { Narrator, describe, cavalry } = require('../app/js/epic-narrator');
const copy = game => structuredClone(game);
const fs = require('node:fs');
const vm = require('node:vm');
function move(game, from, to, promotion) {
  const result = applyMove(game, { from, to, promotion });
  assert.equal(result.success, true, result.error?.message);
  return game;
}

test('una partida real relata maniobras y termina con mate', () => {
  const game = createGameState('mate');
  assert.match(describe(game), /campaña comienza/);
  move(game, 'f2', 'f3');
  assert.match(describe(game), /reino blanco/);
  move(game, 'e7', 'e5');
  move(game, 'g2', 'g4');
  assert.match(describe(game), /infantería.*g4|g4.*infantería/);
  move(game, 'd8', 'h4');
  assert.equal(game.status, 'CHECKMATE');
  assert.match(describe(game), /reino negro.*jaque mate/);
});

test('captura legal del último caballo y posterior asedio real de dama', () => {
  const game = createGameState('siege');
  game.board = Object.fromEntries(Object.keys(game.board).map(square => [square, null]));
  game.board.a1 = { id: 'kw', side: 'white', name: 'king', col: 1, row: 1, state: 'moved' };
  game.board.h8 = { id: 'kb', side: 'black', name: 'king', col: 8, row: 8, state: 'moved' };
  game.board.c3 = { id: 'hw2', side: 'white', name: 'horse', col: 3, row: 3 };
  game.board.d4 = { id: 'qb', side: 'black', name: 'queen', col: 4, row: 4 };
  game.movements = [{ captured: { side: 'white', name: 'horse' }, side: 'black' }];
  game.turn_count = 1;
  game.turn = 'black';
  move(game, 'd4', 'c3');
  assert.match(describe(game), /último jinete.*Sin caballería/i);
  move(game, 'a1', 'b1');
  move(game, 'c3', 'c2');
  assert.equal(game.in_check, true);
  assert.match(describe(game), /Sin caballería.*asedio de la dama/);
  game.board.b2 = { side: 'white', name: 'pawn' };
  game.board.c2 = null;
  game.board.c3 = { side: 'black', name: 'queen' };
  game.board.b1 = null;
  game.board.a1 = { side: 'white', name: 'king' };
  // Un alfil u otra pieza puede dar jaque con la dama bloqueada.
  assert.doesNotMatch(describe(game), /asedio de la dama/);
});

test('promoción a caballo repone la caballería; los eventos especiales se relatan', () => {
  const game = createGameState('events');
  game.movements = [
    { captured: { side: 'white', name: 'horse' }, side: 'black' },
    { captured: { side: 'white', name: 'horse' }, side: 'black' },
    { side: 'white', promotion: 'horse', to: 'a8' }
  ];
  assert.deepEqual(cavalry(game.movements, 'white'), { remaining: 1, lost: 2 });
  assert.match(describe(game), /infantería.*caballería/);
  game.movements.push({ side: 'black', castling: { side: 'kingside' } });
  assert.match(describe(game), /refugio tras la torre/);
  game.movements.push({ side: 'white', to: 'd8', captured: { side: 'black', name: 'queen' } });
  assert.match(describe(game), /comandante ha caído/i);
  for (const reason of ['INSUFFICIENT_MATERIAL', 'FIFTY_MOVE_RULE', 'THREEFOLD_REPETITION']) {
    game.status = 'STALEMATE'; game.draw_reason = reason;
    assert.match(describe(game), /tablas, sin vencedor/);
  }
  game.status = 'RESIGNED'; game.winner = 'black';
  assert.match(describe(game), /reino negro.*rendición/);
});

test('control: sin duplicados, contexto apagado, sin cola al retomar, reinicio y cambio', () => {
  const lines = [];
  let cancels = 0, clears = 0;
  const narrator = new Narrator({ output: line => lines.push(line), cancel: () => cancels++, clear: () => clears++ });
  const game = createGameState('control');
  narrator.update(copy(game));
  assert.equal(lines.length, 0);
  narrator.setEnabled(true);
  assert.equal(lines.length, 1);
  narrator.update(copy(game));
  assert.equal(lines.length, 1);
  narrator.setEnabled(false);
  const canceled = cancels;
  move(game, 'f2', 'f3'); move(game, 'e7', 'e5');
  narrator.update(copy(game));
  assert.equal(lines.length, 1);
  narrator.setEnabled(true);
  assert.equal(lines.length, 2);
  assert.match(lines.at(-1), /2 jugadas/);
  assert.ok(cancels > canceled);
  narrator.setPaused(true);
  move(game, 'g2', 'g4'); move(game, 'd8', 'h4');
  narrator.update(copy(game));
  assert.equal(lines.length, 2);
  narrator.setPaused(false);
  narrator.update(copy(game));
  assert.equal(lines.length, 2);
  narrator.update(createGameState('control'));
  assert.match(lines.at(-1), /campaña comienza/);
  const before = clears;
  narrator.leaveGame();
  narrator.update(createGameState('other'));
  assert.ok(clears > before);
  assert.match(lines.at(-1), /campaña comienza/);
});

test('rendición remota sin nueva jugada se narra una sola vez', () => {
  const lines = [];
  const narrator = new Narrator({ output: line => lines.push(line) });
  const game = createGameState('remote');
  narrator.update(copy(game)); narrator.setEnabled(true);
  game.status = 'RESIGNED'; game.winner = 'white';
  narrator.update(copy(game)); narrator.update(copy(game));
  assert.equal(lines.length, 2);
  assert.match(lines.at(-1), /rendición/);
});

function uiFixture(supported = true) {
  const elements = new Map();
  function element() {
    return {
      children: [], listeners: {}, attributes: {}, checked: true,
      addEventListener(name, fn) { this.listeners[name] = fn; },
      setAttribute(name, value) { this.attributes[name] = value; },
      replaceChildren() { this.children = []; },
      appendChild(child) { this.children.push(child); child.remove = () => this.children.splice(this.children.indexOf(child), 1); },
      get firstElementChild() { return this.children[0]; }
    };
  }
  for (const id of ['btn-toggle-narrator', 'narrator-voice', 'narrator-status', 'narrator-log']) elements.set(id, element());
  const spoken = [];
  let canceled = 0;
  const document = { hidden: false, listeners: {}, getElementById: id => elements.get(id), createElement: element, addEventListener(name, fn) { this.listeners[name] = fn; } };
  const context = vm.createContext({
    EpicNarrator: require('../app/js/epic-narrator'), isHistoryMode: false, document,
    window: { addEventListener() {}, ...(supported ? { speechSynthesis: { cancel() { canceled++; }, resume() {}, getVoices: () => [{ lang: 'es-CO' }], speak: value => spoken.push(value) }, SpeechSynthesisUtterance: function (text) { this.text = text; } } : {}) }
  });
  context.SpeechSynthesisUtterance = context.window.SpeechSynthesisUtterance;
  vm.runInContext(fs.readFileSync(require.resolve('../app/js/narrator-ui'), 'utf8'), context);
  context.initNarrator();
  return { context, document, elements, spoken, get canceled() { return canceled; } };
}

test('interfaz: cancelar voz al apagar o silenciar, y seguir con texto', () => {
  const ui = uiFixture();
  const button = ui.elements.get('btn-toggle-narrator');
  const voice = ui.elements.get('narrator-voice');
  const game = createGameState('voice');
  ui.context.updateNarrator(copy(game));
  button.listeners.click();
  assert.equal(button.attributes['aria-pressed'], 'true');
  assert.equal(ui.spoken.length, 1);
  assert.equal(ui.spoken[0].lang, 'es-CO');
  const before = ui.canceled;
  voice.checked = false; voice.listeners.change();
  assert.ok(ui.canceled > before);
  // Un callback tardío de la voz cancelada no cambia el estado.
  ui.spoken[0].onerror();
  assert.match(ui.elements.get('narrator-status').textContent, /Solo texto/);
  move(game, 'f2', 'f3'); ui.context.updateNarrator(copy(game));
  assert.equal(ui.spoken.length, 1);
  assert.equal(ui.elements.get('narrator-log').children.length, 2);
  button.listeners.click();
  assert.equal(button.attributes['aria-pressed'], 'false');
  ui.context.isHistoryMode = true;
  button.listeners.click();
  ui.context.updateNarrator(copy(game));
  assert.match(ui.elements.get('narrator-status').textContent, /pausa/);
});

test('interfaz: sin síntesis disponible la crónica funciona como texto', () => {
  const ui = uiFixture(false);
  assert.equal(ui.elements.get('narrator-voice').disabled, true);
  ui.context.updateNarrator(createGameState('text'));
  ui.elements.get('btn-toggle-narrator').listeners.click();
  assert.match(ui.elements.get('narrator-status').textContent, /voz no disponible/);
  assert.equal(ui.elements.get('narrator-log').children.length, 1);
});

test('las seis piezas reciben un papel y una maniobra propia', () => {
  const { roles } = require('../app/js/epic-narrator');
  for (const type of ['pawn', 'horse', 'bishop', 'tower', 'queen', 'king']) {
    assert.ok(roles[type].title);
    const game = createGameState(type);
    game.movements = [{ type, side: 'white', to: 'e4' }];
    assert.match(describe(game), /e4/);
    assert.match(describe(game), /reino blanco/);
  }
});

test('enroque legal y las cuatro coronaciones legales tienen giros propios', () => {
  const game = createGameState('castle');
  for (const [from, to] of [['e2','e4'], ['e7','e5'], ['g1','f3'], ['b8','c6'], ['f1','c4'], ['g8','f6'], ['e1','g1']]) move(game, from, to);
  assert.ok(game.movements.at(-1).castling);
  assert.match(describe(game), /Cierren las puertas.*enroque corto/);
  for (const promotion of ['queen', 'tower', 'bishop', 'horse']) {
    const promoted = createGameState(promotion);
    const source = promoted.board;
    promoted.board = Object.fromEntries(Object.keys(source).map(square => [square, null]));
    promoted.board.a1 = source.e1;
    promoted.board.h6 = source.e8;
    promoted.board.a7 = source.a2;
    promoted.board.h5 = source.h7; // Mantener material: alfil/caballo no deben terminar en tablas.
    move(promoted, 'a7', 'a8', promotion);
    assert.equal(promoted.board.a8.name, promotion);
    assert.match(describe(promoted), /De soldado a leyenda/);
    assert.match(describe(promoted), new RegExp({queen:'comandante',tower:'fortaleza',bishop:'consejero',horse:'caballería'}[promotion]));
  }
});

test('una captura responde a una pérdida anterior sin inventar ventaja', () => {
  const game = createGameState('counter');
  game.movements = [
    { side:'black', captured:{side:'white',name:'pawn'}, to:'d5' },
    { side:'white', captured:{side:'black',name:'pawn'}, to:'d5' }
  ];
  assert.match(describe(game), /responde al último golpe/);
});

test('activar sin partida da una bienvenida audible y visible', () => {
  const ui = uiFixture();
  ui.elements.get('btn-toggle-narrator').listeners.click();
  assert.equal(ui.spoken.length, 1);
  assert.match(ui.elements.get('narrator-log').children[0].textContent, /Bienvenida.*infantería/);
});
