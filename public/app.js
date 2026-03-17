/* ──────────────────────────────────────────────
   app.js – Landing Page Logic
   Handles Create / Join party flows via Socket.IO
────────────────────────────────────────────── */

// ── Lazy socket — only connect when user acts ─
let socket = null;
let socketReady = false;

function getSocket() {
  if (socket) return socket;

  if (typeof io === 'undefined') {
    showError('create-error', '⚠️ Could not connect to server. Please refresh the page.');
    showError('join-error',   '⚠️ Could not connect to server. Please refresh the page.');
    return null;
  }

  try {
    socket = io();
  } catch (e) {
    showError('create-error', '⚠️ Connection failed. Please refresh.');
    showError('join-error',   '⚠️ Connection failed. Please refresh.');
    return null;
  }

  // ── Socket listeners (registered once) ───────

  socket.on('lobby_created', ({ code }) => {
    setLoading('create', false);
    const name = document.getElementById('create-name').value.trim();
    const params = new URLSearchParams({ code, name, host: 'true' });
    window.location.href = `lobby.html?${params.toString()}`;
  });

  socket.on('create_error', ({ message }) => {
    setLoading('create', false);
    showError('create-error', message);
  });

  socket.on('lobby_joined', ({ code }) => {
    setLoading('join', false);
    const name = document.getElementById('join-name').value.trim();
    const params = new URLSearchParams({ code, name, host: 'false' });
    window.location.href = `lobby.html?${params.toString()}`;
  });

  socket.on('join_error', ({ message }) => {
    setLoading('join', false);
    showError('join-error', message);
  });

  socket.on('connect_error', () => {
    setLoading('create', false);
    setLoading('join', false);
    showToast('⚠️ Cannot reach server — please refresh.');
  });

  return socket;
}

// ── Helpers ───────────────────────────────────
function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('show');
}
function clearError(id) {
  const el = document.getElementById(id);
  el.textContent = '';
  el.classList.remove('show');
}
function setLoading(prefix, loading) {
  document.getElementById(`${prefix}-btn-text`).style.opacity = loading ? '0' : '1';
  const sp = document.getElementById(`${prefix}-spinner`);
  sp.classList.toggle('show', loading);
  document.getElementById(`${prefix}-btn`).disabled = loading;
}

function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), duration);
}

// ── Enter-key support ─────────────────────────
document.getElementById('create-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleCreate();
});
document.getElementById('join-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleJoin();
});
document.getElementById('join-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleJoin();
});

// Auto-uppercase lobby code as user types
document.getElementById('join-code').addEventListener('input', function () {
  this.value = this.value.toUpperCase();
});

// ── CREATE LOBBY ──────────────────────────────
function handleCreate() {
  const name = document.getElementById('create-name').value.trim();
  clearError('create-error');

  if (!name) {
    showError('create-error', 'Please enter your display name.');
    return;
  }

  const s = getSocket();
  if (!s) return;

  setLoading('create', true);
  s.emit('create_lobby', { name });
}

// ── JOIN LOBBY ────────────────────────────────
function handleJoin() {
  const name = document.getElementById('join-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  clearError('join-error');

  if (!name) { showError('join-error', 'Please enter your display name.'); return; }
  if (!code || code.length < 4) { showError('join-error', 'Please enter the lobby code.'); return; }

  const s = getSocket();
  if (!s) return;

  setLoading('join', true);
  s.emit('join_lobby', { code, name });
}

