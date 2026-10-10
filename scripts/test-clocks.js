const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createGameState, applyMove } = require('../api/chessEngine');
const { snapshotClocks, settleClock, startGameClock } = require('../api/gameClocks');
const players = { white_player: { id: 'white' }, black_player: { id: 'black' } };
const base = Date.UTC(2026, 9, 10, 15);

test('jugar con negras asigna el robot a blancas y arranca el reloj de apertura', () => {
  const game = createGameState('black-player', { game_type: 'bot', black_player: { id: 'human', name: 'Jugador' } });
  assert.equal(game.black_player.id, 'human');
  assert.equal(game.white_player.is_bot, true);
  assert.equal(game.turn, 'white');
  assert.equal(game.clocks.running, true);
  assert.equal(applyMove(game, { from: 'e2', to: 'e4' }).success, true);
  assert.equal(game.turn, 'black');
});

test('cada turno acumula su tiempo y las lecturas no lo duplican', t => {
  t.mock.timers.enable({ apis: ['Date'], now: base });
  const game = createGameState('clock', players);
  t.mock.timers.tick(5500);
  assert.equal(snapshotClocks(game).elapsed_white, 5500);
  assert.equal(snapshotClocks(game).elapsed_white, 5500);
  assert.equal(game.clocks.elapsed_white, 0);
  assert.equal(applyMove(game, { from: 'e2', to: 'e4' }).success, true);
  assert.equal(game.clocks.elapsed_white, 5500);
  t.mock.timers.tick(2700);
  const snapshot = snapshotClocks(game);
  assert.equal(snapshot.elapsed_white, 5500);
  assert.equal(snapshot.elapsed_black, 2700);
  assert.equal(applyMove(game, { from: 'e7', to: 'e5' }).success, true);
  assert.equal(game.clocks.elapsed_black, 2700);
});

test('el ancla persistida recupera el tiempo despues de cerrar la pagina o reiniciar el servidor', t => {
  t.mock.timers.enable({ apis: ['Date'], now: base });
  const game = createGameState('restore', players);
  t.mock.timers.tick(10000);
  applyMove(game, { from: 'e2', to: 'e4' });
  const saved = JSON.stringify(game);
  t.mock.timers.tick(30000);
  const reloaded = JSON.parse(saved);
  assert.equal(snapshotClocks(reloaded).elapsed_white, 10000);
  assert.equal(snapshotClocks(reloaded).elapsed_black, 30000);
});

test('esperar rival no cuenta tiempo; finalizar o reiniciar detiene o limpia los relojes', t => {
  t.mock.timers.enable({ apis: ['Date'], now: base });
  const game = createGameState('waiting', { game_type: 'online', white_player: players.white_player });
  t.mock.timers.tick(20000);
  assert.equal(snapshotClocks(game).elapsed_white, 0);
  game.black_player = players.black_player;
  game.status = 'IN_PROGRESS';
  startGameClock(game);
  t.mock.timers.tick(3000);
  settleClock(game);
  game.status = 'RESIGNED';
  game.clocks.running = false;
  game.clocks.last_turn_started_at = null;
  t.mock.timers.tick(9000);
  assert.equal(snapshotClocks(game).elapsed_white, 3000);
  const reset = createGameState(game.id, players);
  assert.equal(snapshotClocks(reset).elapsed_white, 0);
  assert.equal(snapshotClocks(reset).elapsed_black, 0);
});

test('jaque mate conserva el ultimo tiempo y detiene el conteo', t => {
  t.mock.timers.enable({ apis: ['Date'], now: base });
  const game = createGameState('mate-clock', players);
  for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) {
    t.mock.timers.tick(1000);
    assert.equal(applyMove(game, { from, to }).success, true);
  }
  assert.equal(game.status, 'CHECKMATE');
  assert.equal(game.clocks.running, false);
  t.mock.timers.tick(5000);
  assert.equal(snapshotClocks(game).elapsed_white, 2000);
  assert.equal(snapshotClocks(game).elapsed_black, 2000);
});

test('el navegador restaura el snapshot y no utiliza el turno historico ni el numero de ticks', () => {
  let now = 0;
  const elements = { 'white-clock': {}, 'black-clock': {} };
  const context = { performance: { now: () => now }, data: { side: 'white' },
    document: { getElementById: id => elements[id] }, setInterval() { return 1; }, clearInterval() {} };
  vm.createContext(context);
  const source = fs.readFileSync(require.resolve('../app/js/chess-rules.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('let whiteTime = 0;')), context);
  const response = { status: 'IN_PROGRESS', turn: 'black', clocks: { elapsed_white: 12000, elapsed_black: 8000, running: true } };
  context.syncClocks(response);
  assert.equal(elements['white-clock'].textContent, '00:00:12');
  assert.equal(elements['black-clock'].textContent, '00:00:08');
  now = 9000;
  context.updateClock();
  assert.equal(elements['white-clock'].textContent, '00:00:12');
  assert.equal(elements['black-clock'].textContent, '00:00:17');
  context.syncClocks(response);
  assert.equal(elements['black-clock'].textContent, '00:00:17', 'Volver del historial no reinicia el ancla recibida');
  context.resetClocks();
  assert.equal(elements['white-clock'].textContent, '00:00:00');
  assert.equal(elements['black-clock'].textContent, '00:00:00');
});
