/* ──────────────────────────────────────────────
   lobby.js – Lobby Room Logic
   Manages real-time player list and chat
────────────────────────────────────────────── */

// ── Read URL params ───────────────────────────
const params  = new URLSearchParams(window.location.search);
const MY_CODE = (params.get('code') || '').toUpperCase();
const MY_NAME = params.get('name') || 'Anonymous';
const IS_HOST = params.get('host') === 'true';

// Guards
if (!MY_CODE || !MY_NAME) {
  window.location.href = 'index.html';
}

// ── Connect Socket.IO ─────────────────────────
const socket = io();

// ── DOM refs ──────────────────────────────────
const codeDisplay  = document.getElementById('lobby-code-display');
const playersList  = document.getElementById('players-list');
const playerCount  = document.getElementById('player-count');
const chatMessages = document.getElementById('chat-messages');
const chatInput    = document.getElementById('chat-input');

codeDisplay.textContent = MY_CODE;
document.title = `Lobby ${MY_CODE} – Shared Lobbies`;

// ── State ─────────────────────────────────────
let currentHostId = null;
let mySocketId    = null;

// ── Toast ─────────────────────────────────────
function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), duration);
}

// ── Copy code ─────────────────────────────────
function copyCode() {
  navigator.clipboard.writeText(MY_CODE).then(() => {
    const btn = document.getElementById('copy-code-btn');
    btn.textContent = '✅';
    btn.classList.add('copied');
    showToast(`Code "${MY_CODE}" copied to clipboard!`);
    setTimeout(() => { btn.textContent = '📋'; btn.classList.remove('copied'); }, 2000);
  });
}
window.copyCode = copyCode;

// ── Render Players ────────────────────────────
function renderPlayers(players, hostId) {
  currentHostId = hostId;
  playersList.innerHTML = '';
  playerCount.textContent = players.length;

  players.forEach(({ id, name }) => {
    const isMe   = (name === MY_NAME);
    const isHost = (id === hostId);
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

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('send_message', { code: MY_CODE, name: MY_NAME, text });
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

// ── Leave ─────────────────────────────────────
function leaveLobby() {
  socket.emit('leave_lobby', { code: MY_CODE });
  window.location.href = 'index.html';
}
window.leaveLobby = leaveLobby;

// ── HTML Escape ───────────────────────────────
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Socket Events ─────────────────────────────
socket.on('connect', () => {
  mySocketId = socket.id;

  if (IS_HOST) {
    // Host: re-create lobby (socket re-connected after page navigation)
    socket.emit('create_lobby', { name: MY_NAME });
  } else {
    // Joiner: re-join room
    socket.emit('join_lobby', { code: MY_CODE, name: MY_NAME });
  }
});

// Host: lobby re-created after navigation
socket.on('lobby_created', ({ code, players, hostId }) => {
  mySocketId = socket.id;
  renderPlayers(players, hostId);
  addMessage({ system: true, text: `Lobby "${code}" created. Share the code with your friends!`, timestamp: Date.now() });
});

// Joiner: confirmed join
socket.on('lobby_joined', ({ code, players, hostId }) => {
  mySocketId = socket.id;
  renderPlayers(players, hostId);
  addMessage({ system: true, text: `You joined lobby "${code}".`, timestamp: Date.now() });
});

// Live player list update
socket.on('players_updated', ({ players, hostId, joined, left }) => {
  renderPlayers(players, hostId);
  // System toast (the system chat message is already sent by server)
});

// New chat message
socket.on('new_message', (payload) => {
  addMessage(payload);
});

// Join error on re-join attempt
socket.on('join_error', ({ message }) => {
  showToast(`⚠️ ${message}`);
  setTimeout(() => window.location.href = 'index.html', 2500);
});

// Connection dropped
socket.on('disconnect', () => {
  addMessage({ system: true, text: 'Connection lost. Trying to reconnect…', timestamp: Date.now() });
});

socket.on('reconnect', () => {
  addMessage({ system: true, text: 'Reconnected! ✓', timestamp: Date.now() });
});
