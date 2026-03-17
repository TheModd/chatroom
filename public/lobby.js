/* ──────────────────────────────────────────────
   lobby.js – Lobby Room Logic

   KEY DESIGN DECISIONS (fixes for reported bugs):
   ─────────────────────────────────────────────
   1. app.js no longer creates the lobby. The host
      navigates here with ?host=true and NO code.
      This page emits create_lobby once and gets the
      real server-assigned code back.

   2. After create_lobby succeeds, history.replaceState
      removes ?host=true from the URL and injects the
      real code. So a page refresh becomes a join
      (not another create), preventing duplicate lobbies.

   3. currentCode (not MY_CODE from URL) is used for
      ALL socket emissions so host chat messages work.

   4. hasJoined flag prevents re-creating/re-joining
      on socket reconnect after a brief disconnect.
────────────────────────────────────────────── */

// ── Read URL params ───────────────────────────
const params  = new URLSearchParams(window.location.search);
const MY_CODE = (params.get('code') || '').toUpperCase();
const MY_NAME = params.get('name') || '';
const IS_HOST = params.get('host') === 'true';

// Guard: must have name, and either a code or be a host
if (!MY_NAME || (!IS_HOST && !MY_CODE)) {
  window.location.href = 'index.html';
}

// ── Runtime state ─────────────────────────────
let socket      = null;
let currentCode = MY_CODE; // updated from server events - use this for all emissions
let hasJoined   = false;   // prevents re-create/re-join on reconnect

// ── DOM refs (populated after DOMContentLoaded) ──
let codeDisplay, playersList, playerCount, chatMessages, chatInput;

// ── Toast ─────────────────────────────────────
function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), duration);
}

// ── Copy code ─────────────────────────────────
function copyCode() {
  navigator.clipboard.writeText(currentCode || MY_CODE).then(() => {
    const btn = document.getElementById('copy-code-btn');
    btn.textContent = '✅';
    btn.classList.add('copied');
    showToast(`Code "${currentCode}" copied to clipboard!`);
    setTimeout(() => { btn.textContent = '📋'; btn.classList.remove('copied'); }, 2000);
  });
}
window.copyCode = copyCode;

// ── HTML Escape ───────────────────────────────
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Render Players ────────────────────────────
function renderPlayers(players, hostId) {
  if (!playersList) return;
  playersList.innerHTML = '';
  if (playerCount) playerCount.textContent = players.length;

  players.forEach(({ id, name }) => {
    const isMe    = (name === MY_NAME);
    const isHost  = (id === hostId);
    const initial = name.charAt(0).toUpperCase();

    const item = document.createElement('div');
    item.className = `player-item${isMe ? ' is-me' : ''}`;
    item.innerHTML = `
      <div class="player-avatar">${initial}</div>
      <div class="player-info">
        <div class="player-name">${escapeHTML(name)}${isMe ? ' <span style="color:var(--text-muted);font-size:0.7rem">(you)</span>' : ''}</div>
        <div class="player-role">${isHost ? '👑 Host' : '🎮 Player'}</div>
      </div>
    `;
    playersList.appendChild(item);
  });
}

// ── Chat ──────────────────────────────────────
function addMessage({ system, name, text, timestamp }) {
  if (!chatMessages) return;
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const div  = document.createElement('div');

  if (system) {
    div.className = 'chat-message system';
    div.innerHTML = `<div class="msg-bubble">${escapeHTML(text)}</div>`;
  } else {
    const isMe = (name === MY_NAME);
    div.className = `chat-message ${isMe ? 'mine' : 'theirs'}`;
    div.innerHTML = `
      <div class="msg-meta">
        ${!isMe ? `<span class="msg-name">${escapeHTML(name)}</span>` : ''}
        <span>${time}</span>
      </div>
      <div class="msg-bubble">${escapeHTML(text)}</div>
    `;
  }

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// sendMessage uses currentCode (server-confirmed), NOT MY_CODE (URL param)
function sendMessage() {
  if (!socket || !chatInput || !currentCode) return;
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('send_message', { code: currentCode, name: MY_NAME, text });
  chatInput.value = '';
  chatInput.focus();
}
window.sendMessage = sendMessage;

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}
window.handleChatKey = handleChatKey;

// leaveLobby uses currentCode
function leaveLobby() {
  if (socket && currentCode) socket.emit('leave_lobby', { code: currentCode });
  window.location.href = 'index.html';
}
window.leaveLobby = leaveLobby;

// ── Socket init — deferred until DOM ready ────
document.addEventListener('DOMContentLoaded', () => {
  codeDisplay  = document.getElementById('lobby-code-display');
  playersList  = document.getElementById('players-list');
  playerCount  = document.getElementById('player-count');
  chatMessages = document.getElementById('chat-messages');
  chatInput    = document.getElementById('chat-input');

  // Show placeholder until server confirms the real code
  if (codeDisplay) codeDisplay.textContent = MY_CODE || '…';
  document.title = `Lobby – Chatroom`;

  if (typeof io === 'undefined') {
    showToast('⚠️ Could not connect — please refresh the page.');
    return;
  }

  try { socket = io(); }
  catch (e) { showToast('⚠️ Connection failed — please refresh.'); return; }

  // ── connect fires on initial connection AND reconnects ──
  socket.on('connect', () => {
    if (hasJoined) {
      // Reconnecting after a brief disconnect — rejoin with the confirmed code
      if (currentCode) {
        socket.emit('join_lobby', { code: currentCode, name: MY_NAME });
      }
      return;
    }

    if (IS_HOST) {
      // First-time host: create a fresh lobby
      socket.emit('create_lobby', { name: MY_NAME });
    } else if (MY_CODE) {
      // Joiner: join the lobby specified in URL
      socket.emit('join_lobby', { code: MY_CODE, name: MY_NAME });
    } else {
      window.location.href = 'index.html';
    }
  });

  // ── Lobby created (host only) ──────────────────
  socket.on('lobby_created', ({ code, players, hostId }) => {
    hasJoined   = true;
    currentCode = code;

    if (codeDisplay) codeDisplay.textContent = code;
    document.title = `Lobby ${code} – Chatroom`;

    // IMPORTANT: Replace URL so that refreshing the page does a join
    // (not another create), and removes the host=true flag permanently.
    const safeParams = new URLSearchParams({ code, name: MY_NAME });
    window.history.replaceState({}, '', `lobby.html?${safeParams.toString()}`);

    renderPlayers(players, hostId);
    addMessage({
      system: true,
      text: `Lobby "${code}" created! Share this code with your friends.`,
      timestamp: Date.now()
    });
  });

  // ── Lobby joined (joiner) ──────────────────────
  socket.on('lobby_joined', ({ code, players, hostId }) => {
    hasJoined   = true;
    currentCode = code;

    if (codeDisplay) codeDisplay.textContent = code;
    document.title = `Lobby ${code} – Chatroom`;

    renderPlayers(players, hostId);
    addMessage({ system: true, text: `You joined lobby "${code}".`, timestamp: Date.now() });
  });

  // ── Player list updated ────────────────────────
  socket.on('players_updated', ({ players, hostId }) => {
    renderPlayers(players, hostId);
  });

  // ── New chat message ───────────────────────────
  socket.on('new_message', (payload) => {
    addMessage(payload);
  });

  // ── Join / create error ────────────────────────
  socket.on('join_error', ({ message }) => {
    showToast(`⚠️ ${message}`);
    setTimeout(() => window.location.href = 'index.html', 3000);
  });

  socket.on('create_error', ({ message }) => {
    showToast(`⚠️ ${message}`);
    setTimeout(() => window.location.href = 'index.html', 3000);
  });

  // ── Connection status ──────────────────────────
  socket.on('disconnect', () => {
    addMessage({ system: true, text: 'Connection lost. Trying to reconnect…', timestamp: Date.now() });
  });

  socket.on('reconnect', () => {
    addMessage({ system: true, text: 'Reconnected! ✓', timestamp: Date.now() });
  });

  socket.on('connect_error', () => {
    showToast('⚠️ Cannot reach server — please refresh.');
  });
});
