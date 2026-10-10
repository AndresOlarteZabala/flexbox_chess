let chatContext = '';
let chatGameId = null;
let chatMessages = new Map();
let chatFetching = false;
let chatSending = false;

function initGameChat() {
  document.getElementById('chat-form').addEventListener('submit', sendGameChat);
  setInterval(refreshGameChat, 5000);
}

function updateGameChat(game) {
  const players = game ? [game.white_player, game.black_player] : [];
  const eligible = authToken && currentUser && players.length === 2 &&
    players.every(p => p && p.id && p.id.startsWith('usr-')) &&
    players.some(p => p.id === currentUser.id);
  const context = eligible ? `${game.id}:${authToken}` : '';
  if (context !== chatContext) {
    chatContext = context;
    chatGameId = eligible ? game.id : null;
    chatMessages.clear();
    document.getElementById('chat-messages').replaceChildren();
    document.getElementById('chat-input').value = '';
    chatFetching = false;
    chatSending = false;
    if (eligible) refreshGameChat();
  }
  document.getElementById('chat-input').disabled = !eligible;
  document.getElementById('chat-send').disabled = !eligible || chatSending;
  if (!eligible) document.getElementById('chat-status').textContent =
    game && players.some(p => p && p.is_bot) ? 'El chat está disponible en partidas entre dos personas.' :
    !authToken ? 'Inicia sesión para conversar con tu rival.' : 'Disponible para los dos jugadores cuando se una el rival.';
}

function receiveChatMessage(message) {
  if (!chatContext || message.game_id !== chatGameId || chatMessages.has(message.id)) return;
  chatMessages.set(message.id, message);
  const log = document.getElementById('chat-messages');
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  // Se renderiza texto sin interpretar HTML enviado por un jugador.
  const item = message;
  const row = document.createElement('div');
  row.dataset.messageId = item.id;
  row.className = 'chat-message' + (item.user_id === currentUser.id ? ' chat-message-own' : '');
  const meta = document.createElement('div');
  meta.className = 'chat-message-meta';
  const name = document.createElement('strong');
  name.textContent = item.user_id === currentUser.id ? 'Tú' : item.name;
  const time = document.createElement('time');
  time.dateTime = item.created_at;
  time.textContent = new Date(item.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  meta.append(name, time);
  const body = document.createElement('p');
  body.textContent = item.text;
  row.append(meta, body);
  const next = [...log.children].find(child => Number(child.dataset.messageId) > item.id);
  log.insertBefore(row, next || null);
  // Limitar también la memoria de una conversación larga.
  const ids = [...chatMessages.keys()].sort((a,b) => a-b);
  ids.slice(0, Math.max(0, ids.length - 100)).forEach(id => {
    chatMessages.delete(id);
    log.querySelector(`[data-message-id="${id}"]`).remove();
  });
  document.getElementById('chat-status').textContent = '';
  if (nearBottom || message.user_id === currentUser.id) log.scrollTop = log.scrollHeight;
}

async function refreshGameChat() {
  if (!chatContext || chatFetching) return;
  const context = chatContext;
  chatFetching = true;
  try {
    const after = Math.max(0, ...chatMessages.keys());
    const response = await fetch(`/api/games/${encodeURIComponent(chatGameId)}/chat?after=${after}`, {headers:{Authorization:`Bearer ${authToken}`}});
    const result = await response.json();
    if (context !== chatContext) return;
    if (!result.success) throw new Error(result.error);
    result.data.forEach(receiveChatMessage);
    document.getElementById('chat-status').textContent = chatMessages.size ? '' : 'Saluda a tu rival. Los mensajes se guardan con la partida.';
  } catch (error) {
    if (context === chatContext) document.getElementById('chat-status').textContent = 'No se pudo actualizar el chat. Se reintentará automáticamente.';
  } finally {
    if (context === chatContext) chatFetching = false;
  }
}

async function sendGameChat(event) {
  event.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!chatContext || chatSending || !text) return;
  const context = chatContext;
  chatSending = true;
  document.getElementById('chat-send').disabled = true;
  try {
    const response = await fetch(`/api/games/${encodeURIComponent(chatGameId)}/chat`, {
      method:'POST', headers:{Authorization:`Bearer ${authToken}`, 'Content-Type':'application/json'}, body:JSON.stringify({text})
    });
    const result = await response.json();
    if (context !== chatContext) return;
    if (!result.success) throw new Error(result.error || 'No se pudo enviar el mensaje.');
    receiveChatMessage(result.data);
    if (input.value.trim() === text) input.value = '';
    document.getElementById('chat-status').textContent = '';
  } catch (error) {
    if (context === chatContext) document.getElementById('chat-status').textContent = error.message;
  } finally {
    if (context === chatContext) {
      chatSending = false;
      document.getElementById('chat-send').disabled = false;
    }
  }
}
