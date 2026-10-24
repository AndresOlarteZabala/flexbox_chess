let featuredGames = [];
let featuredReplay = null;
let featuredTimer = null;
let replayRequest = 0;
let courseLessons = [];
let lessonRequest = 0;
let completedLessons = [];
let homeRequested = false;
try {
  const savedLessons = JSON.parse(localStorage.getItem('chess_course_completed_v1') || '[]');
  if (Array.isArray(savedLessons)) completedLessons = savedLessons.filter(id => typeof id === 'string');
} catch (_) { /* El curso funciona aunque el almacenamiento no esté disponible. */ }

function updateHomeView() {
  const playing = sessionVerified && !!currentGameId && !homeRequested;
  document.body.classList.toggle('home-view', !playing);
  document.body.classList.toggle('guest-view', !sessionVerified);
  document.getElementById('home-page').hidden = playing;
  document.getElementById('home-play').textContent = sessionVerified ? 'Crear una partida' : 'Iniciar sesión para jugar';
  document.getElementById('nav-resume-game').hidden = !sessionVerified || !currentGameId || playing;
  if (playing) document.getElementById('nav-home').removeAttribute('aria-current');
  else document.getElementById('nav-home').setAttribute('aria-current', 'page');
}

function showHomePage(event) {
  if (event && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0)) return;
  if (event) event.preventDefault();
  homeRequested = true;
  if (window.location.pathname !== '/' || window.location.search) window.history.pushState({}, '', '/');
  updateHomeView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resumeCurrentGame() {
  if (!sessionVerified || !currentGameId) return;
  closeFeaturedReplay();
  homeRequested = false;
  updateGameUrl(currentGameId);
  updateHomeView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('popstate', function () {
  const match = window.location.pathname.match(/^\/game\/([^/]+)\/?$/);
  if (match && sessionVerified) loadGameFromAPI(decodeURIComponent(match[1]));
  else {
    homeRequested = true;
    updateHomeView();
  }
});

function startFromHome() {
  if (sessionVerified) openCreateGameModal();
  else openAuthModal('login');
}

function featuredResult(game) {
  const results = { CHECKMATE: 'Jaque mate', STALEMATE: 'Tablas por ahogado', DRAW: 'Tablas', RESIGNED: 'Rendición', TIMEOUT: 'Tiempo agotado' };
  const winner = game.winner === 'white' ? game.white_name : game.winner === 'black' ? game.black_name : null;
  return `${results[game.status] || 'Finalizada'}${winner ? ` · Victoria de ${winner}` : ''}`;
}

async function loadFeaturedGames() {
  const container = document.getElementById('featured-games');
  container.replaceChildren();
  const status = document.createElement('p');
  status.className = 'home-empty';
  status.textContent = 'Cargando partidas destacadas…';
  container.append(status);
  try {
    const response = await fetch('/api/games/featured');
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error('featured');
    featuredGames = result.data;
    container.replaceChildren();
    if (!featuredGames.length) {
      status.textContent = 'La historia del club está por escribirse. Las partidas finalizadas aparecerán aquí para que puedas revivirlas.';
      container.append(status);
    }
    featuredGames.forEach((game, index) => {
      const card = document.createElement('article');
      card.className = 'featured-card';
      const label = document.createElement('span');
      label.className = 'home-eyebrow';
      label.textContent = `${String(index + 1).padStart(2, '0')} / ${game.status === 'CHECKMATE' ? 'FINAL CON MATE' : 'DEL ARCHIVO'}`;
      const title = document.createElement('h3');
      title.textContent = `${game.white_name} vs. ${game.black_name}`;
      const result = document.createElement('p');
      result.textContent = featuredResult(game);
      const meta = document.createElement('p');
      meta.className = 'featured-meta';
      meta.textContent = `${game.movements_count} movimientos · ${new Date(game.updated_at).toLocaleDateString('es-CO')}`;
      const play = document.createElement('button');
      play.className = 'btn-hud btn-hud-primary';
      play.textContent = '▶ Reproducir partida';
      play.onclick = () => startFeaturedReplay(game);
      card.append(label, title, result, meta, play);
      container.append(card);
    });
  } catch (_) {
    status.textContent = 'No pudimos cargar el historial. Inténtalo de nuevo.';
    const retry = document.createElement('button');
    retry.className = 'btn-hud btn-hud-secondary';
    retry.textContent = 'Reintentar';
    retry.onclick = loadFeaturedGames;
    container.replaceChildren(status, retry);
  }
}

function closeFeaturedReplay() {
  clearTimeout(featuredTimer);
  replayRequest++;
  lessonRequest++;
  featuredReplay = null;
  document.getElementById('featured-replay').hidden = true;
}

function startFeaturedReplay(game) {
  closeFeaturedReplay();
  featuredReplay = { game, step: 0, paused: false };
  document.getElementById('featured-replay').hidden = false;
  document.getElementById('replay-eyebrow').textContent = game.lesson ? 'CURSO · EJEMPLO DIDÁCTICO' : 'REPRODUCCIÓN DEL HISTORIAL';
  document.getElementById('replay-title').textContent = game.lesson ? game.title : `${game.white_name} vs. ${game.black_name}`;
  document.getElementById('replay-result').textContent = game.lesson ? game.objective : featuredResult(game);
  document.getElementById('lesson-commentary').hidden = !game.lesson;
  document.getElementById('lesson-quiz').hidden = true;
  document.getElementById('replay-speed').value = game.lesson ? '5000' : '1000';
  document.getElementById('replay-board').replaceChildren();
  document.getElementById('replay-title').focus();
  document.getElementById('featured-replay').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  renderFeaturedStep();
}

async function renderFeaturedStep() {
  clearTimeout(featuredTimer);
  const replay = featuredReplay;
  if (!replay) return;
  const request = ++replayRequest;
  document.getElementById('replay-progress').textContent = 'Cargando posición…';
  try {
    let result;
    if (replay.game.lesson) {
      result = { success: true, data: replay.game.positions[replay.step] };
    } else {
      const response = await fetch(`/api/games/${encodeURIComponent(replay.game.id)}/history/${replay.step}`);
      if (!response.ok) throw new Error('replay');
      result = await response.json();
    }
    if (request !== replayRequest) return;
    if (!result.success) throw new Error('replay');
    const board = document.getElementById('replay-board');
    board.replaceChildren();
    const symbols = { white: { king: '♔', queen: '♕', tower: '♖', bishop: '♗', horse: '♘', pawn: '♙' }, black: { king: '♚', queen: '♛', tower: '♜', bishop: '♝', horse: '♞', pawn: '♟' } };
    for (let rank = 8; rank >= 1; rank--) {
      for (let file = 0; file < 8; file++) {
        const square = `${'abcdefgh'[file]}${rank}`;
        const piece = result.data.board[square];
        const cell = document.createElement('span');
        cell.className = `replay-cell ${(file + rank) % 2 ? 'light' : 'dark'} ${piece?.side || ''}`;
        if (result.data.current_move?.from === square || result.data.current_move?.to === square) cell.classList.add('last-move');
        cell.textContent = piece ? symbols[piece.side]?.[piece.name] || '' : '';
        cell.title = `${square}${piece ? ` · ${piece.name} ${piece.side}` : ''}`;
        board.append(cell);
      }
    }
    const ended = replay.step >= result.data.total_moves;
    if (ended) replay.paused = true;
    const san = result.data.current_move?.san || '';
    const displaySan = replay.game.lesson ? san.replace(/^[KQRBN]/, piece => ({ K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' })[piece]) : san;
    document.getElementById('replay-progress').textContent = `${ended ? (replay.game.lesson ? 'Fin del ejemplo' : 'Fin de la partida') : 'Movimiento'} · ${replay.step} / ${result.data.total_moves}${displaySan ? ` · ${displaySan}` : ''}`;
    document.getElementById('replay-prev').disabled = replay.step === 0;
    document.getElementById('replay-next').disabled = ended;
    if (replay.game.lesson) {
      document.getElementById('lesson-note').textContent = replay.game.notes[replay.step];
      document.getElementById('lesson-takeaway').hidden = !ended;
      document.getElementById('lesson-takeaway').textContent = replay.game.takeaway;
      document.getElementById('lesson-quiz').hidden = !ended;
    }
    board.setAttribute('aria-label', `Posición tras ${replay.step} movimientos`);
    document.getElementById('replay-toggle').textContent = ended ? 'Reproducir de nuevo' : replay.paused ? 'Continuar' : 'Pausar';
    if (!replay.paused) featuredTimer = setTimeout(() => {
      replay.step++;
      renderFeaturedStep();
    }, Number(document.getElementById('replay-speed').value));
  } catch (_) {
    if (request !== replayRequest) return;
    replay.paused = true;
    document.getElementById('replay-progress').textContent = 'No pudimos cargar esta posición. Pulsa Continuar para reintentar.';
    document.getElementById('replay-toggle').textContent = 'Continuar';
  }
}

function toggleFeaturedReplay() {
  if (!featuredReplay) return;
  if (featuredReplay.step >= featuredReplay.game.movements_count) return restartFeaturedReplay();
  featuredReplay.paused = !featuredReplay.paused;
  clearTimeout(featuredTimer);
  document.getElementById('replay-toggle').textContent = featuredReplay.paused ? 'Continuar' : 'Pausar';
  if (!featuredReplay.paused) renderFeaturedStep();
}

function restartFeaturedReplay() {
  if (!featuredReplay) return;
  featuredReplay.step = 0;
  featuredReplay.paused = false;
  renderFeaturedStep();
}

function navigateFeaturedReplay(direction) {
  if (!featuredReplay) return;
  featuredReplay.paused = true;
  featuredReplay.step = Math.max(0, Math.min(featuredReplay.game.movements_count, featuredReplay.step + direction));
  renderFeaturedStep();
}

async function loadCourseLessons() {
  const container = document.getElementById('course-lessons');
  container.textContent = 'Cargando curso…';
  try {
    const response = await fetch('/api/lessons');
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error('course');
    courseLessons = result.data;
    renderCourseLessons();
  } catch (_) {
    container.textContent = 'No pudimos cargar el curso. ';
    const retry = document.createElement('button');
    retry.className = 'btn-hud btn-hud-secondary';
    retry.textContent = 'Reintentar';
    retry.onclick = loadCourseLessons;
    container.append(retry);
  }
}

function renderCourseLessons() {
  const container = document.getElementById('course-lessons');
  container.replaceChildren();
  const total = courseLessons.filter(lesson => completedLessons.includes(lesson.id)).length;
  document.getElementById('course-progress').textContent = `${total} de ${courseLessons.length} completadas · Sin registro`;
  courseLessons.forEach(lesson => {
    const card = document.createElement('article');
    card.className = 'featured-card course-card';
    const level = document.createElement('span');
    level.className = 'home-eyebrow';
    level.textContent = lesson.level;
    const title = document.createElement('h3');
    title.textContent = lesson.title;
    const objective = document.createElement('p');
    objective.textContent = lesson.objective;
    const meta = document.createElement('p');
    meta.className = 'featured-meta';
    meta.textContent = `${lesson.movements_count} movimientos comentados · ${completedLessons.includes(lesson.id) ? '✓ Completada' : 'Con pregunta de repaso'}`;
    const button = document.createElement('button');
    button.className = 'btn-hud btn-hud-primary';
    button.textContent = completedLessons.includes(lesson.id) ? 'Repasar lección' : '▶ Comenzar lección';
    button.onclick = () => startCourseLesson(lesson.id);
    card.append(level, title, objective, meta, button);
    container.append(card);
  });
}

async function startCourseLesson(id) {
  closeFeaturedReplay();
  const request = ++lessonRequest;
  const container = document.getElementById('featured-replay');
  container.hidden = false;
  document.getElementById('replay-title').textContent = 'Cargando lección…';
  document.getElementById('replay-result').textContent = '';
  document.getElementById('replay-progress').textContent = '';
  document.getElementById('replay-board').replaceChildren();
  document.getElementById('lesson-commentary').hidden = true;
  document.getElementById('lesson-quiz').hidden = true;
  try {
    const response = await fetch(`/api/lessons/${encodeURIComponent(id)}`);
    const result = await response.json();
    if (request !== lessonRequest) return;
    if (!response.ok || !result.success) throw new Error('lesson');
    startFeaturedReplay({ ...result.data, lesson: true });
    buildLessonQuiz(result.data);
  } catch (_) {
    if (request !== lessonRequest) return;
    document.getElementById('replay-title').textContent = 'No pudimos cargar la lección';
    document.getElementById('replay-progress').textContent = 'Vuelve a pulsar Comenzar lección para reintentar.';
  }
}

function buildLessonQuiz(lesson) {
  document.getElementById('lesson-question').textContent = lesson.question;
  document.getElementById('lesson-feedback').textContent = '';
  document.getElementById('lesson-next').hidden = true;
  const answers = document.getElementById('lesson-answers');
  answers.replaceChildren();
  lesson.answers.forEach((answer, index) => {
    const button = document.createElement('button');
    button.className = 'lesson-answer';
    button.textContent = answer;
    button.onclick = () => {
      const correct = index === lesson.correct;
      document.getElementById('lesson-feedback').textContent = correct ? `¡Correcto! ${lesson.explanation}` : 'Inténtalo de nuevo. Revisa la idea de la lección; puedes retroceder para observar la posición.';
      if (!correct) return;
      answers.querySelectorAll('button').forEach(answerButton => { answerButton.disabled = true; });
      button.classList.add('is-correct');
      if (!completedLessons.includes(lesson.id)) completedLessons.push(lesson.id);
      try { localStorage.setItem('chess_course_completed_v1', JSON.stringify(completedLessons)); } catch (_) { /* Progreso de esta visita. */ }
      renderCourseLessons();
      const indexInCourse = courseLessons.findIndex(item => item.id === lesson.id);
      document.getElementById('lesson-next').hidden = indexInCourse < 0 || indexInCourse >= courseLessons.length - 1;
    };
    answers.append(button);
  });
}

function startNextLesson() {
  if (!featuredReplay?.game.lesson) return;
  const index = courseLessons.findIndex(lesson => lesson.id === featuredReplay.game.id);
  if (index >= 0 && courseLessons[index + 1]) startCourseLesson(courseLessons[index + 1].id);
}

$(document).ready(function () { loadFeaturedGames(); loadCourseLessons(); });
