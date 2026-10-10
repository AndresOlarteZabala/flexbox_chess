// Milisegundos acumulados y un ancla persistida: no requiere escrituras por tick.
function ensureClocks(game, now = Date.now()) {
  const clocks = game.clocks ||= { white: 0, black: 0 };
  if (!Number.isFinite(clocks.elapsed_white) || !Number.isFinite(clocks.elapsed_black)) {
    clocks.elapsed_white = 0;
    clocks.elapsed_black = 0;
    // Compatibilidad con partidas anteriores que nunca guardaban los cronometros.
    clocks.last_turn_started_at = game.updated_at || game.created_at || new Date(now).toISOString();
    clocks.running = game.status === 'IN_PROGRESS';
  }
  return clocks;
}

function snapshotClocks(game, now = Date.now()) {
  const clocks = ensureClocks(game, now);
  const snapshot = { ...clocks, server_now: new Date(now).toISOString() };
  snapshot.running = !!clocks.running && game.status === 'IN_PROGRESS';
  const started = Date.parse(clocks.last_turn_started_at);
  if (snapshot.running && Number.isFinite(started) && ['white', 'black'].includes(game.turn)) {
    snapshot[`elapsed_${game.turn}`] += Math.max(0, now - started);
  }
  return snapshot;
}

function settleClock(game, now = Date.now()) {
  const snapshot = snapshotClocks(game, now);
  game.clocks.elapsed_white = snapshot.elapsed_white;
  game.clocks.elapsed_black = snapshot.elapsed_black;
  game.clocks.last_turn_started_at = snapshot.running ? new Date(now).toISOString() : null;
  game.clocks.running = snapshot.running;
}

function startGameClock(game, now = Date.now()) {
  const clocks = ensureClocks(game, now);
  clocks.running = true;
  clocks.last_turn_started_at = new Date(now).toISOString();
}

module.exports = { ensureClocks, snapshotClocks, settleClock, startGameClock };
