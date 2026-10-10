// Ejecutar con Node >=22.5: node scripts/test-chat.js.
// La base de datos se sustituye por SQLite en memoria; no modifica partidas reales.
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
const users = require('../api/userStore');
const games = require('../api/gameStore');
const gateway = require('../api/socketGateway');

(async () => {
  const sessions = ['chatwhite', 'chatblack', 'observer'].map(username => users.createUser({username, password:'test-only'}));
  const game = games.createGame({game_type:'online', white_player:sessions[0].user, black_player:sessions[1].user});
  const botGame = games.createGame({white_player:sessions[0].user});
  const events = sessions.map(() => []);
  gateway.initSocketGateway({use() {}, on() {}, sockets:{sockets:new Map(sessions.map((s,i) => [i, {
    handshake:{auth:{token:s.token}}, emit:(event,message) => events[i].push({event,message})
  }]))}});
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(session, body, suffix = '', gameId = game.id) {
    return fetch(`${base}/api/games/${gameId}/chat${suffix}`, {
      method:body === undefined ? 'GET' : 'POST',
      headers:{'Content-Type':'application/json', ...(session ? {Authorization:`Bearer ${session.token}`} : {})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)})
    });
  }
  try {
    assert.equal((await request(null)).status,401);
    assert.equal((await request(sessions[2])).status,403);
    assert.equal((await request(sessions[2],{text:'intrusion'})).status,403);
    assert.equal((await request(sessions[0],undefined,'?after=bad')).status,400);
    assert.equal((await request(sessions[0],undefined,'',botGame.id)).status,403);
    for(const text of ['', ' ', 'a'.repeat(501)]) assert.equal((await request(sessions[0],{text})).status,400);
    const sent = await request(sessions[0],{text:'  Hola rival  ',user_id:sessions[2].user.id});
    assert.equal(sent.status,201);
    const message = (await sent.json()).data;
    assert.equal(message.text,'Hola rival');
    assert.equal(message.user_id,sessions[0].user.id);
    assert.equal(events[0].length,1);
    assert.equal(events[1].length,1);
    assert.equal(events[2].length,0);
    isolatedDb.exports.prepare('UPDATE game_chat SET created_at = ? WHERE id = ?').run(new Date().toISOString(), message.id);
    assert.equal((await request(sessions[0],{text:'spam'})).status,429);
    const history = await (await request(sessions[1])).json();
    assert.equal(history.data.length,1);
    assert.equal(history.data[0].id,message.id);
    assert.equal((await (await request(sessions[1],undefined,`?after=${message.id}`)).json()).data.length,0);
    // Una sesión revocada tampoco recibe mensajes por su socket existente.
    users.invalidateToken(sessions[0].token);
    assert.equal((await request(sessions[0])).status,401);
    assert.equal((await request(sessions[1],{text:'Buena partida'})).status,201);
    assert.equal(events[0].length,1);
    assert.equal(events[1].length,2);
    assert.equal(events[2].length,0);
    console.log('OK chat: autorización, validación, identidad, persistencia, cursor, límite de envío y destinatarios.');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    isolatedDb.exports.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
