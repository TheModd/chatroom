/* ──────────────────────────────────────────────
   app.js – Landing Page Logic
   Handles Create / Join party flows via Socket.IO
────────────────────────────────────────────── */

const socket = io();

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

  setLoading('create', true);
  socket.emit('create_lobby', { name });
}

socket.on('lobby_created', ({ code, players, hostId }) => {
  setLoading('create', false);
  // Navigate to lobby page
  const params = new URLSearchParams({ code, name: document.getElementById('create-name').value.trim(), host: 'true' });
  window.location.href = `lobby.html?${params.toString()}`;
});

socket.on('create_error', ({ message }) => {
  setLoading('create', false);
  showError('create-error', message);
});

// ── JOIN LOBBY ────────────────────────────────
function handleJoin() {
  const name = document.getElementById('join-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  clearError('join-error');

  if (!name) { showError('join-error', 'Please enter your display name.'); return; }
  if (!code || code.length < 4) { showError('join-error', 'Please enter the lobby code.'); return; }

  setLoading('join', true);
  socket.emit('join_lobby', { code, name });
}

socket.on('lobby_joined', ({ code, players, hostId }) => {
  setLoading('join', false);
  const name = document.getElementById('join-name').value.trim();
  const params = new URLSearchParams({ code, name, host: 'false' });
  window.location.href = `lobby.html?${params.toString()}`;
});

socket.on('join_error', ({ message }) => {
  setLoading('join', false);
  showError('join-error', message);
});

// ── Connection feedback ───────────────────────
socket.on('connect_error', () => {
  showToast('⚠️ Cannot reach server. Make sure it is running.');
});
