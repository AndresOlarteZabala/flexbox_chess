let epicNarrator;

function initNarrator() {
  const button = document.getElementById('btn-toggle-narrator');
  const voice = document.getElementById('narrator-voice');
  const status = document.getElementById('narrator-status');
  const log = document.getElementById('narrator-log');
  const testButton = document.getElementById('btn-test-narrator');
  const voiceSelect = document.getElementById('narrator-voice-select');
  const speech = window.speechSynthesis;
  const supported = !!speech && typeof window.SpeechSynthesisUtterance === 'function';
  let currentUtterance = null;
  let voiceFailed = false;
  let speechStarted = false;
  let lastLine = 'Los estandartes se alzan. La infantería forma filas, la caballería aguarda y las fortalezas protegen al soberano. ¡Que comience la campaña!';
  const voiceErrorMessages = { 'not-allowed': 'Pulsa Probar voz para autorizar el audio.', 'language-unavailable': 'No hay una voz en español disponible.', 'voice-unavailable': 'La voz elegida no está disponible.', 'audio-busy': 'La salida de audio está ocupada.', 'synthesis-unavailable': 'Este navegador no puede reproducir la voz.' };
  let errorDetail = '';

  function cancel() {
    // Ignorar errores asincrónicos de una voz que acabamos de interrumpir.
    currentUtterance = null;
    speechStarted = false;
    if (supported) speech.cancel();
  }
  function updateStatus() {
    button.textContent = epicNarrator.enabled ? 'Narrador: encendido' : 'Activar narrador';
    button.setAttribute('aria-pressed', String(epicNarrator.enabled));
    status.textContent = voiceFailed ? `Solo texto · ${errorDetail || 'voz no disponible'}` : currentUtterance ? (speechStarted ? 'Narrando la campaña…' : 'Preparando voz…') : !epicNarrator.enabled ? 'Crónica épica opcional · pulsa Probar voz para escucharla' : epicNarrator.paused ? 'En pausa mientras consultas el historial' : !supported ? 'Solo texto · voz no disponible' : voice.checked ? 'Texto y voz · crónica de campaña' : 'Solo texto · crónica de campaña';
  }
  function speak(line) {
    cancel();
    if (!supported || document.hidden) return;
    voiceFailed = false;
    errorDetail = '';
    try {
      const utterance = new SpeechSynthesisUtterance(line);
      utterance.lang = 'es-ES';
      const voices = speech.getVoices();
      const spanish = voices.find(v => v.voiceURI === voiceSelect?.value) || voices.find(v => v.lang.toLowerCase().startsWith('es'));
      if (spanish) { utterance.voice = spanish; utterance.lang = spanish.lang; }
      utterance.rate = 0.94;
      utterance.pitch = 0.85;
      currentUtterance = utterance;
      utterance.onstart = () => { if (currentUtterance === utterance) { speechStarted = true; updateStatus(); } };
      utterance.onend = () => { if (currentUtterance === utterance) { currentUtterance = null; speechStarted = false; updateStatus(); } };
      utterance.onerror = event => {
        if (currentUtterance !== utterance) return;
        currentUtterance = null;
        voiceFailed = true;
        errorDetail = voiceErrorMessages[event?.error] || 'No se pudo reproducir. Prueba otra voz.';
        updateStatus();
      };
      speech.resume();
      speech.speak(utterance);
      updateStatus();
    } catch (error) {
      voiceFailed = true;
      errorDetail = 'No se pudo reproducir. Pulsa Probar voz.';
      updateStatus();
    }
  }
  function refreshVoices() {
    if (!voiceSelect || !supported) return;
    const selected = voiceSelect.value;
    voiceSelect.replaceChildren();
    const automatic = document.createElement('option');
    automatic.value = ''; automatic.textContent = 'Español · automática';
    voiceSelect.appendChild(automatic);
    for (const available of speech.getVoices().filter(v => v.lang.toLowerCase().startsWith('es'))) {
      const option = document.createElement('option');
      option.value = available.voiceURI; option.textContent = `${available.name} (${available.lang})`;
      voiceSelect.appendChild(option);
    }
    if ([...voiceSelect.children].some(option => option.value === selected)) voiceSelect.value = selected;
  }
  epicNarrator = new EpicNarrator.Narrator({
    cancel,
    clear() { log.replaceChildren(); },
    output(line, step) {
      lastLine = line;
      const entry = document.createElement('p');
      entry.textContent = `Jugada ${step} · ${line}`;
      log.appendChild(entry);
      while (log.children.length > 8) log.firstElementChild.remove();
      log.scrollTop = log.scrollHeight;
      cancel();
      if (!voice.checked || !supported || document.hidden) return;
      speak(line);
    }
  });
  voice.disabled = !supported;
  voice.checked = supported;
  button.addEventListener('click', () => {
    voiceFailed = false;
    epicNarrator.setEnabled(!epicNarrator.enabled);
    if (epicNarrator.enabled && !epicNarrator.game && !epicNarrator.paused) {
      log.replaceChildren();
      const welcome = document.createElement('p');
      welcome.textContent = `Bienvenida · ${lastLine} Crea o carga una partida para escuchar sus jugadas.`;
      log.appendChild(welcome);
      if (voice.checked) speak(lastLine);
    }
    updateStatus();
  });
  voice.addEventListener('change', () => { cancel(); voiceFailed = false; updateStatus(); });
  if (testButton) {
    testButton.disabled = !supported;
    testButton.addEventListener('click', () => speak('Prueba de voz. ¡Cierren las puertas! El soberano se refugia tras la fortaleza. Y en el otro extremo del campo, un soldado alcanza su destino. ¡De la infantería surge una nueva comandante!'));
  }
  if (voiceSelect) {
    voiceSelect.disabled = !supported;
    voiceSelect.addEventListener('change', () => { cancel(); voiceFailed = false; updateStatus(); });
  }
  refreshVoices();
  if (supported && speech.addEventListener) speech.addEventListener('voiceschanged', refreshVoices);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancel(); updateStatus(); } });
  window.addEventListener('pagehide', cancel);
  epicNarrator.refreshStatus = updateStatus;
  updateStatus();
}

function updateNarrator(game) {
  if (!epicNarrator) return;
  epicNarrator.setPaused(isHistoryMode);
  epicNarrator.update(game);
  epicNarrator.refreshStatus();
}
