import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
// CLIENT_ORIGIN may contain a comma-separated list of approved web clients.
// `true` keeps local development simple; set it in production (e.g. your GitHub Pages URL).
const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_ORIGIN?.split(',') || true } });
const PORT = process.env.PORT || 3001;
const rooms = new Map();
const WORLD = { width: 1600, height: 900 };
const ROUND_MS = 180000;
const HEAD_START_MS = 12000;
const obstacles = [
  [180, 120, 230, 46], [610, 110, 50, 260], [1040, 90, 260, 50],
  [210, 410, 55, 260], [410, 385, 265, 48], [820, 350, 60, 280],
  [1100, 410, 300, 50], [500, 650, 55, 170], [970, 650, 300, 50],
  [1330, 625, 55, 190]
];
const spawns = [[80, 790], [1510, 790], [1450, 160], [95, 170], [760, 790], [760, 160]];

app.use(express.static('public'));

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  while (rooms.has(code));
  return code;
}
function safeName(value) {
  const name = String(value || 'Sobrevivente').replace(/[<>]/g, '').trim();
  return (name || 'Sobrevivente').slice(0, 18);
}
function roomView(room) {
  return {
    code: room.code, ownerId: room.ownerId, phase: room.phase, roundEnd: room.roundEnd || null,
    freezeEnd: room.freezeEnd || null, winner: room.winner || null,
    players: [...room.players.values()].map(({ id, name, role, captured, x, y }) => ({ id, name, role, captured, x, y }))
  };
}
function announce(room) { io.to(room.code).emit('room:update', roomView(room)); }
function rectHit(x, y, r) {
  if (x - r < 0 || y - r < 0 || x + r > WORLD.width || y + r > WORLD.height) return true;
  return obstacles.some(([ox, oy, ow, oh]) => x + r > ox && x - r < ox + ow && y + r > oy && y - r < oy + oh);
}
function endGame(room, winner) {
  if (room.phase !== 'running') return;
  room.phase = 'finished'; room.winner = winner; clearInterval(room.loop);
  announce(room); io.to(room.code).emit('game:ended', { winner });
}
function beginGame(room) {
  if (room.phase === 'running' || room.players.size < 2) return;
  const roster = [...room.players.values()];
  const monster = roster[Math.floor(Math.random() * roster.length)];
  room.phase = 'running'; room.winner = null; room.freezeEnd = Date.now() + HEAD_START_MS; room.roundEnd = Date.now() + ROUND_MS;
  roster.forEach((player, i) => {
    player.role = player.id === monster.id ? 'monster' : 'hider';
    player.captured = false; [player.x, player.y] = spawns[i % spawns.length];
  });
  room.loop = setInterval(() => {
    if (Date.now() >= room.roundEnd) endGame(room, 'hiders');
    else announce(room);
  }, 100);
  announce(room); io.to(room.code).emit('game:started');
}
function leaveRoom(socket, intentional = false) {
  const code = socket.data.roomCode; if (!code) return;
  const room = rooms.get(code); socket.leave(code); socket.data.roomCode = null;
  if (!room) return;
  const gone = room.players.get(socket.id); room.players.delete(socket.id);
  if (!room.players.size) { clearInterval(room.loop); rooms.delete(code); return; }
  if (room.ownerId === socket.id) {
    room.ownerId = room.players.keys().next().value;
    io.to(code).emit('system:notice', `${gone?.name || 'O dono'} saiu. A autoridade foi transferida.`);
  }
  if (room.phase === 'running') {
    const monsters = [...room.players.values()].filter(p => p.role === 'monster');
    const hiders = [...room.players.values()].filter(p => p.role === 'hider' && !p.captured);
    if (!monsters.length) endGame(room, 'hiders'); else if (!hiders.length) endGame(room, 'monster');
  }
  announce(room);
}

io.on('connection', socket => {
  socket.on('room:create', ({ name }, done) => {
    leaveRoom(socket); const code = makeCode();
    const player = { id: socket.id, name: safeName(name), role: null, captured: false, x: 80, y: 790 };
    const room = { code, ownerId: socket.id, players: new Map([[socket.id, player]]), phase: 'lobby' };
    rooms.set(code, room); socket.join(code); socket.data.roomCode = code; announce(room); done?.({ ok: true, code });
  });
  socket.on('room:join', ({ code, name }, done) => {
    leaveRoom(socket); const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return done?.({ ok: false, error: 'Sala não encontrada.' });
    if (room.phase === 'running') return done?.({ ok: false, error: 'A rodada já começou.' });
    if (room.players.size >= 6) return done?.({ ok: false, error: 'Esta sala já está cheia.' });
    room.players.set(socket.id, { id: socket.id, name: safeName(name), role: null, captured: false, x: 1510, y: 790 });
    socket.join(room.code); socket.data.roomCode = room.code; announce(room); done?.({ ok: true, code: room.code });
  });
  socket.on('room:leave', () => leaveRoom(socket, true));
  socket.on('game:start', () => {
    const room = rooms.get(socket.data.roomCode); if (!room) return;
    if (room.ownerId !== socket.id) return socket.emit('game:error', 'Somente a autoridade pode iniciar.');
    if (room.players.size < 2) return socket.emit('game:error', 'São necessários pelo menos 2 jogadores.');
    beginGame(room);
  });
  socket.on('player:move', ({ dx, dy }) => {
    const room = rooms.get(socket.data.roomCode); const p = room?.players.get(socket.id);
    if (!room || room.phase !== 'running' || !p || p.captured) return;
    if (p.role === 'monster' && Date.now() < room.freezeEnd) return;
    const mag = Math.hypot(Number(dx) || 0, Number(dy) || 0); if (!mag) return;
    const speed = p.role === 'monster' ? 7.2 : 5.3;
    const nx = p.x + (dx / mag) * speed, ny = p.y + (dy / mag) * speed;
    if (!rectHit(nx, p.y, 18)) p.x = nx;
    if (!rectHit(p.x, ny, 18)) p.y = ny;
    if (p.role === 'monster') {
      for (const target of room.players.values()) if (target.role === 'hider' && !target.captured && Math.hypot(target.x - p.x, target.y - p.y) < 38) {
        target.captured = true; io.to(room.code).emit('system:notice', `${target.name} foi consumido pela Penumbra.`);
      }
      if (![...room.players.values()].some(q => q.role === 'hider' && !q.captured)) endGame(room, 'monster');
    }
  });
  socket.on('disconnect', () => leaveRoom(socket));
});

httpServer.listen(PORT, () => console.log(`Penumbra em http://localhost:${PORT}`));
