// Usa SQLite en memoria; no modifica partidas ni usuarios reales.
const fs = require('node:fs');
const Module = require('node:module');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const dbPath = require.resolve('../api/db');
const isolatedDb = new Module(dbPath, module);
isolatedDb.filename = dbPath;
isolatedDb.paths = module.paths;
require.cache[dbPath] = isolatedDb;
isolatedDb._compile(fs.readFileSync(dbPath, 'utf8').replace('new DatabaseSync(DB_PATH)', "new DatabaseSync(':memory:')"), dbPath);
const app = require('../server');
const users = require('../api/userStore');
const games = require('../api/gameStore');

(async () => {
  const [white, black, observer] = ['resignwhite', 'resignblack', 'resignobserver'].map(username => users.createUser({ username, password: 'test-only' }));
  const createGame = () => games.createGame({ game_type: 'online', white_player: white.user, black_player: black.user });
  const game = createGame();
  game.turn = 'black';
  game.clocks.last_turn_started_at = new Date(Date.now() - 5000).toISOString();
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const resign = (session, id = game.id, body = {}) => fetch(`${base}/api/games/${id}/resign`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) }, body: JSON.stringify(body)
  });
  try {
    assert.equal((await resign(null)).status, 401);
    assert.equal((await resign(observer)).status, 403);
    assert.equal((await resign(white, 'missing')).status, 404);
    const response = await resign(white, game.id, { side: 'black' });
    assert.equal(response.status, 200);
    const result = (await response.json()).data;
    assert.equal(result.status, 'RESIGNED');
    assert.equal(result.winner, 'black', 'Se rinde quien envia la solicitud, no el jugador del turno ni el side enviado');
    assert.equal(result.clocks.running, false);
    assert.equal(result.clocks.last_turn_started_at, null);
    assert.ok(result.clocks.elapsed_black >= 5000);
    const savedGame = JSON.parse(isolatedDb.exports.prepare('SELECT data FROM games WHERE id = ?').get(game.id).data);
    assert.equal(savedGame.clocks.elapsed_black, result.clocks.elapsed_black, 'SQLite conserva el acumulado al terminar');
    assert.equal(games.getGame(game.id).winner, 'black');
    const recordedStats = users.getUserById(white.user.id).games_played;
    assert.equal((await resign(black)).status, 409);
    assert.equal(games.getGame(game.id).winner, 'black');
    assert.equal(users.getUserById(white.user.id).games_played, recordedStats);
    const secondGame = createGame();
    assert.equal((await resign(black, secondGame.id)).status, 200);
    assert.equal(games.getGame(secondGame.id).winner, 'white');
    const waiting = games.createGame({ game_type: 'online', white_player: white.user });
    assert.equal((await resign(white, waiting.id)).status, 409);

    const source = fs.readFileSync(require.resolve('../app/js/index.js'), 'utf8');
    const functionSource = source.slice(source.indexOf('let resignPending = false;'), source.indexOf('function onGameModeChange()'));
    const button = { disabled: false };
    let requests = 0, rendered = null, confirmed = false;
    const context = {
      currentGameId: 'demo', latestLiveGame: { id: 'demo', status: 'IN_PROGRESS', white_player: { id: 'white' } },
      authToken: 'test-token', currentUser: { id: 'white' }, isHistoryMode: false,
      window: { confirm: () => confirmed }, document: { getElementById: () => button },
      messageShow() {}, clearBoardSelection() {}, renderGameState: state => { rendered = state; },
      fetch: async (url, options) => {
        requests++;
        assert.equal(url, '/api/games/demo/resign');
        assert.equal(options.headers.Authorization, 'Bearer test-token');
        assert.equal(options.body, undefined);
        return { ok: true, json: async () => ({ success: true, data: { status: 'RESIGNED', winner: 'black', movements: [] } }) };
      }
    };
    vm.createContext(context);
    vm.runInContext(functionSource, context);
    await context.resignGameAPI('demo');
    assert.equal(requests, 0, 'Cancelar no envia la solicitud');
    confirmed = true;
    await context.resignGameAPI('demo');
    assert.equal(requests, 1);
    assert.equal(rendered.status, 'RESIGNED');
    assert.equal(button.disabled, false);
    await context.resignGameAPI('demo');
    assert.equal(requests, 1, 'Una partida terminada no vuelve a enviarse');
    console.log('OK rendicion: autorizacion, bando correcto, relojes, resultado irreversible, confirmacion y actualizacion del tablero.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    isolatedDb.exports.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
