const socket = io(window.PENUMBRA_SERVER_URL || undefined);
const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d', { alpha: false });
const mapCanvas = document.createElement('canvas'), map = mapCanvas.getContext('2d');
const world = { w: 1600, h: 900, obstacles: [[180,120,230,46],[610,110,50,260],[1040,90,260,50],[210,410,55,260],[410,385,265,48],[820,350,60,280],[1100,410,300,50],[500,650,55,170],[970,650,300,50],[1330,625,55,190]] };
let me, room, keys = {}, noticeTimer, raf = 0, rendering = false, lastRoster = '', lastSecond = -1;
const actors = new Map();
function buildMap() {
  mapCanvas.width = world.w; mapCanvas.height = world.h; map.fillStyle = '#171719'; map.fillRect(0, 0, world.w, world.h); map.strokeStyle = '#ffffff0a'; map.lineWidth = 1;
  for (let x = 0; x <= world.w; x += 50) { map.beginPath(); map.moveTo(x, 0); map.lineTo(x, world.h); map.stroke(); }
  for (let y = 0; y <= world.h; y += 50) { map.beginPath(); map.moveTo(0, y); map.lineTo(world.w, y); map.stroke(); }
  world.obstacles.forEach(([x,y,w,h]) => { map.fillStyle = '#303034'; map.fillRect(x,y,w,h); map.strokeStyle = '#696264'; map.strokeRect(x+.5,y+.5,w-1,h-1); map.fillStyle = '#ffffff09'; map.fillRect(x+5,y+5,w-10,4); });
}
function resize() { const rect = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 1.25); canvas.width = Math.max(640, Math.round(rect.width * ratio)); canvas.height = Math.max(360, Math.round(rect.height * ratio)); }
buildMap(); addEventListener('resize', resize); resize();
function show(el, visible) { el.hidden = !visible; }
function setError(text) { $('landing-error').textContent = text || ''; }
function playerName() { return $('name').value.trim() || localStorage.penumbraName || 'Sobrevivente'; }
function enter(code) { localStorage.penumbraName = playerName(); $('landing').hidden = true; $('room').hidden = false; $('room-code').textContent = code; }
$('create').onclick = () => socket.emit('room:create', { name: playerName() }, r => r.ok ? enter(r.code) : setError(r.error));
$('join').onclick = () => socket.emit('room:join', { name: playerName(), code: $('code').value }, r => r.ok ? enter(r.code) : setError(r.error));
$('code').oninput = e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
$('copy').onclick = async () => { await navigator.clipboard?.writeText($('room-code').textContent); toast('Código copiado para a área de transferência.'); };
$('leave').onclick = () => { socket.emit('room:leave'); location.reload(); }; $('start').onclick = () => socket.emit('game:start');
$('back').onclick = () => { $('end-card').hidden = true; show($('game'), false); show($('lobby'), true); };
socket.on('connect', () => { me = socket.id; }); socket.on('connect_error', () => setError('Não foi possível conectar ao servidor da Penumbra.'));
socket.on('room:update', data => { room = data; syncActors(); updateInterface(); startRender(); });
socket.on('game:started', () => { show($('lobby'), false); show($('game'), true); $('end-card').hidden = true; resize(); startRender(); });
socket.on('game:ended', ({ winner }) => { $('winner').textContent = winner === 'monster' ? 'A PENUMBRA VENCEU' : 'OS ESCONDEDORES SOBREVIVERAM'; $('end-card').hidden = false; });
socket.on('system:notice', toast); socket.on('game:error', toast);
function syncActors() { if (!room) return; const known = new Set(room.players.map(p => p.id)); for (const id of actors.keys()) if (!known.has(id)) actors.delete(id); room.players.forEach(p => { const a = actors.get(p.id) || { x: p.x, y: p.y, tx: p.x, ty: p.y }; a.tx = p.x; a.ty = p.y; actors.set(p.id, a); }); }
function rosterKey() { return room.players.map(p => p.id + ':' + p.name + ':' + p.role + ':' + p.captured + ':' + (p.id === room.ownerId)).join('|') + room.phase; }
function updateInterface() {
  if (!room) return; $('room-code').textContent = room.code; const key = rosterKey(), mine = room.players.find(p => p.id === me);
  if (key !== lastRoster) { lastRoster = key; $('players').innerHTML = room.players.map(p => '<div class="player"><i class="dot"></i><span>' + escapeHtml(p.name) + '</span>' + (p.id === room.ownerId ? '<b class="tag">AUTORIDADE</b>' : '') + (p.role ? '<b class="tag">' + (p.role === 'monster' ? 'MONSTRO' : p.captured ? 'CAPTURADO' : 'ESCONDIDO') + '</b>' : '') + '</div>').join(''); $('start').classList.toggle('hidden', room.ownerId !== me); $('start').disabled = room.players.length < 2; $('authority-note').textContent = room.ownerId === me ? 'Você é a autoridade desta sala.' : 'A autoridade inicia a rodada.'; $('alive').textContent = room.players.filter(p => p.role === 'hider' && !p.captured).length + '/' + room.players.filter(p => p.role === 'hider').length; }
  if (mine && room.phase === 'running') $('status').textContent = mine.captured ? 'VOCÊ FOI CAPTURADO' : mine.role === 'monster' ? (Date.now() < room.freezeEnd ? 'A SOMBRA ESTÁ PRESA...' : 'ENCONTRE TODOS OS ESCONDEDORES') : 'SOBREVIVA ATÉ O RELÓGIO ZERAR';
}
function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c])); }
function toast(message) { $('notice').textContent = message; $('notice').style.opacity = 1; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('notice').style.opacity = 0, 3200); }
function drawHider(x, y, captured) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = captured ? '#4f494a' : '#c9d0bf'; ctx.strokeStyle = '#111214'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -11, 9, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(-13, 16); ctx.lineTo(-10, -5); ctx.quadraticCurveTo(0, -12, 10, -5); ctx.lineTo(14, 16); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#c8424f'; ctx.fillRect(-4, -12, 2, 2); ctx.fillRect(3, -12, 2, 2); ctx.restore(); }
function drawMonster(x, y) { ctx.save(); ctx.translate(x, y); ctx.shadowColor = '#c51f37'; ctx.shadowBlur = 22; ctx.fillStyle = '#a92737'; ctx.strokeStyle = '#27090d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -27); ctx.quadraticCurveTo(-19, -12, -15, 5); ctx.lineTo(-25, 28); ctx.lineTo(-4, 19); ctx.lineTo(0, 35); ctx.lineTo(7, 17); ctx.lineTo(25, 28); ctx.lineTo(15, 4); ctx.quadraticCurveTo(20, -13, 0, -27); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff4e5'; ctx.fillRect(-9, -9, 5, 3); ctx.fillRect(4, -9, 5, 3); ctx.restore(); }
function drawFrame() {
  if (!room || room.phase !== 'running') { rendering = false; return; } const mine = room.players.find(p => p.id === me), mineActor = mine && actors.get(mine.id); if (!mineActor) { raf = requestAnimationFrame(drawFrame); return; }
  const scale = canvas.width / canvas.clientWidth, vw = canvas.clientWidth, vh = canvas.height / scale, camX = Math.max(0, Math.min(world.w - vw, mineActor.x - vw / 2)), camY = Math.max(0, Math.min(world.h - vh, mineActor.y - vh / 2));
  ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.drawImage(mapCanvas, camX, camY, vw, vh, 0, 0, vw, vh);
  room.players.forEach(p => { const a = actors.get(p.id); a.x += (a.tx - a.x) * .28; a.y += (a.ty - a.y) * .28; });
  room.players.forEach(p => { const a = actors.get(p.id), x = a.x - camX, y = a.y - camY; if (p.role === 'monster') drawMonster(x,y); else drawHider(x,y,p.captured); ctx.fillStyle = '#050505'; ctx.font = '10px DM Mono'; ctx.textAlign = 'center'; ctx.fillText(p.name, x, y - (p.role === 'monster' ? 39 : 28)); });
  const fog = ctx.createRadialGradient(mineActor.x-camX, mineActor.y-camY, 100, mineActor.x-camX, mineActor.y-camY, 390); fog.addColorStop(0, '#0000'); fog.addColorStop(1, '#000c'); ctx.fillStyle = fog; ctx.fillRect(0, 0, vw, vh);
  const seconds = Math.ceil(Math.max(0, (room.roundEnd - Date.now()) / 1000)); if (seconds !== lastSecond) { lastSecond = seconds; $('timer').textContent = String(Math.floor(seconds/60)).padStart(2,'0') + ':' + String(seconds%60).padStart(2,'0'); } raf = requestAnimationFrame(drawFrame);
}
function startRender() { if (!rendering && room?.phase === 'running') { rendering = true; raf = requestAnimationFrame(drawFrame); } }
addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; }); addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
setInterval(() => { if (!room || room.phase !== 'running') return; const dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), dy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0); if (dx || dy) socket.emit('player:move', { dx, dy }); }, 50);
