const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
//  In-memory lobby store
//  lobbies = Map<code, { host: string, players: [{id, name}] }>
// ──────────────────────────────────────────────
const lobbies = new Map();

/** Generate a random 6-character alphanumeric code (uppercase) */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Generate a unique code that doesn't clash with existing lobbies */
function uniqueCode() {
  let code;
  do { code = generateCode(); } while (lobbies.has(code));
  return code;
}

// ──────────────────────────────────────────────
//  Socket.IO event handlers
// ──────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // ── CREATE LOBBY ─────────────────────────────
  socket.on('create_lobby', ({ name }) => {
    if (!name || !name.trim()) {
      socket.emit('create_error', { message: 'Please enter a name.' });
      return;
    }

    const code = uniqueCode();
    const player = { id: socket.id, name: name.trim() };

    lobbies.set(code, {
      host: socket.id,
      players: [player]
    });

    socket.join(code);
    socket.data.code = code;
    socket.data.name = player.name;

    console.log(`[+] Lobby created: ${code} by "${player.name}"`);

    socket.emit('lobby_created', {
      code,
      players: [player],
      hostId: socket.id
    });
  });

  // ── JOIN LOBBY ────────────────────────────────
  socket.on('join_lobby', ({ code, name }) => {
    const trimmedCode = (code || '').trim().toUpperCase();
    const trimmedName = (name || '').trim();

    if (!trimmedName) {
      socket.emit('join_error', { message: 'Please enter your name.' });
      return;
    }

    if (!lobbies.has(trimmedCode)) {
      socket.emit('join_error', { message: `Lobby "${trimmedCode}" not found. Check the code and try again.` });
      return;
    }

    const lobby = lobbies.get(trimmedCode);

    // Check for duplicate names — treat disconnected sockets as ghosts and remove them
    const existingIdx = lobby.players.findIndex(
      p => p.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existingIdx !== -1) {
      const ghost = lobby.players[existingIdx];
      const ghostSocket = io.sockets.sockets.get(ghost.id);
      if (ghostSocket && ghostSocket.connected) {
        // Genuinely duplicate — a live socket already has this name
        socket.emit('join_error', { message: `The name "${trimmedName}" is already taken in this lobby.` });
        return;
      }
      // Ghost (disconnected socket) — clean up silently
      console.log(`[~] Removing ghost player "${ghost.name}" from lobby ${trimmedCode}`);
      lobby.players.splice(existingIdx, 1);
      if (lobby.host === ghost.id) {
        lobby.host = lobby.players.length > 0 ? lobby.players[0].id : socket.id;
      }
    }

    const player = { id: socket.id, name: trimmedName };
    lobby.players.push(player);

    socket.join(trimmedCode);
    socket.data.code = trimmedCode;
    socket.data.name = trimmedName;

    console.log(`[+] "${trimmedName}" joined lobby ${trimmedCode}`);

    // Confirm join to the new player
    socket.emit('lobby_joined', {
      code: trimmedCode,
      players: lobby.players,
      hostId: lobby.host
    });

    // Broadcast updated list to everyone else in the room
    socket.to(trimmedCode).emit('players_updated', {
      players: lobby.players,
      hostId: lobby.host,
      joined: trimmedName
    });

    // System chat message
    io.to(trimmedCode).emit('new_message', {
      system: true,
      text: `${trimmedName} joined the lobby.`,
      timestamp: Date.now()
    });
  });

  // ── SEND CHAT MESSAGE ─────────────────────────
  socket.on('send_message', ({ code, name, text }) => {
    if (!text || !text.trim()) return;
    if (!lobbies.has(code)) return;

    const payload = {
      system: false,
      name: name,
      text: text.trim(),
      timestamp: Date.now()
    };

    io.to(code).emit('new_message', payload);
  });

  // ── LEAVE LOBBY ───────────────────────────────
  socket.on('leave_lobby', ({ code }) => {
    handleLeave(socket, code);
  });

  // ── DISCONNECT ────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] Socket disconnected: ${socket.id}`);
    const code = socket.data.code;
    if (code) handleLeave(socket, code);
  });
});

/**
 * Remove a player from a lobby, notify remaining players,
 * and clean up the lobby if it's empty or reassign host.
 */
function handleLeave(socket, code) {
  if (!lobbies.has(code)) return;

  const lobby = lobbies.get(code);
  const leavingPlayer = lobby.players.find(p => p.id === socket.id);
  if (!leavingPlayer) return;

  lobby.players = lobby.players.filter(p => p.id !== socket.id);
  socket.leave(code);
  socket.data.code = null;

  console.log(`[-] "${leavingPlayer.name}" left lobby ${code}`);

  if (lobby.players.length === 0) {
    lobbies.delete(code);
    console.log(`[x] Lobby ${code} deleted (empty)`);
    return;
  }

  // Reassign host if the host left
  if (lobby.host === socket.id) {
    lobby.host = lobby.players[0].id;
    console.log(`[~] New host in ${code}: "${lobby.players[0].name}"`);
  }

  // Notify remaining players
  io.to(code).emit('players_updated', {
    players: lobby.players,
    hostId: lobby.host,
    left: leavingPlayer.name
  });

  io.to(code).emit('new_message', {
    system: true,
    text: `${leavingPlayer.name} left the lobby.`,
    timestamp: Date.now()
  });
}

// ──────────────────────────────────────────────
//  Start server
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Chatroom server running at http://localhost:${PORT}\n`);
});
