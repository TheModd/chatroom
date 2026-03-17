/* ──────────────────────────────────────────────
   app.js – Landing Page Logic
   No socket needed here — all socket work is in lobby.js
   Create: validate name → navigate (lobby.js creates the lobby)
   Join:   validate name + code → navigate (lobby.js joins the lobby)
────────────────────────────────────────────── */

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
// No socket on the landing page for create.
// lobby.js will emit create_lobby once the socket connects there.
function handleCreate() {
  const name = document.getElementById('create-name').value.trim();
  clearError('create-error');
  if (!name) {
    showError('create-error', 'Please enter your display name.');
    return;
  }
  window.location.href = `lobby.html?${new URLSearchParams({ name, host: 'true' })}`;
}

// ── JOIN LOBBY ────────────────────────────────
// Basic local validation only — lobby.js will handle server-side validation.
function handleJoin() {
  const name = document.getElementById('join-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  clearError('join-error');

  if (!name) {
    showError('join-error', 'Please enter your display name.');
    return;
  }
  if (!code || code.length < 4) {
    showError('join-error', 'Please enter a valid lobby code.');
    return;
  }

  window.location.href = `lobby.html?${new URLSearchParams({ code, name })}`;
}
