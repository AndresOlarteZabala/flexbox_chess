const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const elements = new Map();
const classes = new Set();
const listeners = {};
const element = id => {
  if (!elements.has(id)) elements.set(id, {
    hidden: false, attributes: {}, textContent: '',
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; }
  });
  return elements.get(id);
};
const location = { pathname: '/game/existing', search: '' };
const context = vm.createContext({
  sessionVerified: true, currentGameId: 'existing',
  localStorage: { getItem: () => null },
  document: { getElementById: element, body: { classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } } } },
  window: { location, history: { pushState(_state, _title, path) { location.pathname = path; location.search = ''; } },
    scrollTo() {}, addEventListener(name, callback) { listeners[name] = callback; } },
  clearTimeout() {}, $: () => ({ ready() {} }),
  updateGameUrl: id => { location.pathname = `/game/${id}`; },
  loadGameFromAPI: id => { context.loadedGame = id; }
});
vm.runInContext(fs.readFileSync(require.resolve('../app/js/home.js'), 'utf8'), context);
vm.runInContext('updateHomeView()', context);
assert.equal(element('home-page').hidden, true);
vm.runInContext('showHomePage()', context);
assert.equal(element('home-page').hidden, false);
assert.equal(element('nav-resume-game').hidden, false);
assert.equal(context.currentGameId, 'existing', 'Ir a Inicio conserva la partida');
assert.equal(context.sessionVerified, true, 'Ir a Inicio conserva la sesión');
assert.equal(location.pathname, '/');
vm.runInContext('updateHomeView()', context);
assert.equal(element('home-page').hidden, false, 'Una actualización de partida no interrumpe la lectura');
vm.runInContext('resumeCurrentGame()', context);
assert.equal(location.pathname, '/game/existing');
assert.equal(element('home-page').hidden, true);
location.pathname = '/';
listeners.popstate();
assert.equal(element('home-page').hidden, false, 'Atrás vuelve a Inicio');
location.pathname = '/game/existing';
listeners.popstate();
assert.equal(context.loadedGame, 'existing', 'Adelante recupera la partida');
context.sessionVerified = false;
vm.runInContext('updateHomeView()', context);
assert.equal(element('home-page').hidden, false);
assert.equal(element('nav-resume-game').hidden, true);
console.log('OK navegación: Inicio con sesión, partida conservada, retorno, actualizaciones en segundo plano y navegación del navegador.');
