// Aislamiento completo: SQLite en memoria, sin modificar el historial real.
const fs = require('node:fs');
const Module = require('node:module');
const assert = require('node:assert/strict');
const dbPath = require.resolve('../api/db');
const isolatedDb = new Module(dbPath, module);
isolatedDb.filename = dbPath;
isolatedDb.paths = module.paths;
require.cache[dbPath] = isolatedDb;
isolatedDb._compile(fs.readFileSync(dbPath, 'utf8').replace('new DatabaseSync(DB_PATH)', "new DatabaseSync(':memory:')"), dbPath);
const app = require('../server');
const games = require('../api/gameStore');
const { getBoardAtStep, applyMove, createGameState } = require('../api/chessEngine');

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const featured = async () => (await (await fetch(`${base}/api/games/featured`)).json()).data;
    assert.deepEqual(await featured(), []);
    const course = await (await fetch(`${base}/api/lessons`)).json();
    assert.equal(course.success, true);
    assert.equal(course.data.length, 3);
    for (const summary of course.data) {
      const response = await fetch(`${base}/api/lessons/${summary.id}`);
      assert.equal(response.status, 200, 'El curso es público');
      const lesson = (await response.json()).data;
      assert.equal(lesson.notes.length, lesson.movements_count + 1);
      assert.equal(lesson.positions.length, lesson.notes.length);
      assert.ok(lesson.answers[lesson.correct]);
      const demo = createGameState('test-lesson');
      lesson.moves.forEach(([from, to], index) => {
        assert.equal(applyMove(demo, { from, to }).success, true);
        assert.deepEqual(lesson.positions[index + 1].board, demo.board, 'La posición grabada coincide con las reglas, incluido el enroque');
      });
      if (summary.id !== 'opening') assert.equal(demo.status, 'CHECKMATE');
      if (summary.id === 'scholar') {
        const defense = createGameState('test-defense');
        lesson.moves.slice(0, 5).forEach(([from, to]) => applyMove(defense, { from, to }));
        assert.equal(applyMove(defense, { from: 'g7', to: 'g6' }).success, true);
        assert.equal(applyMove(defense, { from: 'h5', to: 'f7' }).success, false, 'La defensa enseñada evita Dxf7');
      }
    }
    assert.equal((await fetch(`${base}/api/lessons/missing`)).status, 404);
    assert.equal(games.listGames().length, 0, 'El curso no crea partidas en el historial');
    const live = games.createGame();
    const mate = games.createGame({ white_player: { id: 'test-player', name: '<Jugador>', token: 'private' } });
    for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) {
      assert.equal(applyMove(mate, { from, to }).success, true);
    }
    games.saveGame(mate);
    for (let i = 0; i < 8; i++) {
      const game = games.createGame();
      game.status = 'RESIGNED';
      game.movements = Array.from({ length: 5 + i }, () => ({ from: 'a2', to: 'a3' }));
      games.saveGame(game);
    }
    const list = await featured();
    assert.equal(list.length, 6);
    assert.equal(list[0].id, mate.id, 'El mate tiene prioridad');
    assert.equal(list[0].white_name, '<Jugador>');
    assert.equal(JSON.stringify(list).includes('private'), false);
    assert.equal(list.some(game => game.id === live.id), false);
    assert.equal(list[1].movements_count, 12);
    for (let step = 0; step <= mate.movements.length; step++) {
      const response = await fetch(`${base}/api/games/${mate.id}/history/${step}`);
      assert.equal(response.status, 200, 'Reproducción pública sin sesión');
      const position = (await response.json()).data;
      assert.equal(position.step, step);
      if (step === mate.movements.length) assert.deepEqual(position.board, mate.board);
    }
    const castle = getBoardAtStep([{ from: 'e1', to: 'g1', castling: { rookFrom: 'h1', rookTo: 'f1' } }], 1);
    assert.equal(castle.h1, null);
    assert.equal(castle.f1.name, 'tower');
    assert.equal(castle.f1.col, 6);
    const promotion = getBoardAtStep([{ from: 'a2', to: 'a8', promotion: 'horse' }], 1);
    assert.equal(promotion.a8.name, 'horse');
    assert.equal(promotion.a8.points, 3);
    console.log('OK portada y curso: selección, acceso público, lecciones legales, defensa contra mate, posiciones grabadas, enroque, promoción y aislamiento del historial.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    isolatedDb.exports.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
