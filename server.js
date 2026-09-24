import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { chooseMap } from './maps.js';

const app = express(), httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_ORIGIN?.split(',') || true } });
const PORT = process.env.PORT || 3001, ROUND_MS = 180000, HEAD_START_MS = 12000, KILL_STUN_MS = 3000, QUEST_RANGE = 58;
const rooms = new Map();
app.use(express.static('public'));

function makeCode() { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code; do code = Array.from({length:5}, () => chars[Math.floor(Math.random()*chars.length)]).join(''); while (rooms.has(code)); return code; }
function safeName(value) { const name = String(value || 'Sobrevivente').replace(/[<>]/g,'').trim(); return (name || 'Sobrevivente').slice(0,18); }
function safeClass(value) { return ['explorer','technician','scout'].includes(value) ? value : 'explorer'; }
function playerView(p) { return { id:p.id, name:p.name, classId:p.classId, role:p.role, captured:p.captured, x:p.x, y:p.y, stunEnd:p.stunEnd || null }; }
function roomView(room) { return { code:room.code, ownerId:room.ownerId, phase:room.phase, roundEnd:room.roundEnd || null, freezeEnd:room.freezeEnd || null, winner:room.winner || null, map:room.map || null, quests:room.quests || [], players:[...room.players.values()].map(playerView) }; }
function announce(room) { io.to(room.code).emit('room:update', roomView(room)); }
function collides(map, x, y, r=18) { if (x-r<0 || y-r<0 || x+r>map.width || y+r>map.height) return true; return map.obstacles.some(([ox,oy,ow,oh]) => x+r>ox && x-r<ox+ow && y+r>oy && y-r<oy+oh); }
function endGame(room, winner) { if (room.phase !== 'running') return; room.phase='finished'; room.winner=winner; clearInterval(room.loop); announce(room); io.to(room.code).emit('game:ended',{winner}); }
function questDuration(player) { return player.classId === 'technician' ? 1600 : 2500; }
function updateQuests(room, now) {
  for (const quest of room.quests) {
    if (!quest.activeBy || quest.completed) continue;
    const player = room.players.get(quest.activeBy);
    if (!player || player.captured || Math.hypot(player.x-quest.x,player.y-quest.y)>QUEST_RANGE) { quest.activeBy=null; quest.startedAt=null; continue; }
    if (now-quest.startedAt >= questDuration(player)) { quest.completed=true; quest.activeBy=null; quest.startedAt=null; io.to(room.code).emit('system:notice','Tarefa concluída: '+quest.label); }
  }
  if (room.quests.length && room.quests.every(q => q.completed)) endGame(room,'hiders');
}
function beginGame(room) {
  if (room.phase === 'running' || room.players.size < 2) return;
  const roster=[...room.players.values()], monster=roster[Math.floor(Math.random()*roster.length)];
  room.map=chooseMap(); room.quests=room.map.quests.map(([x,y,label],id) => ({id,x,y,label,completed:false,activeBy:null,startedAt:null}));
  room.phase='running'; room.winner=null; room.freezeEnd=Date.now()+HEAD_START_MS; room.roundEnd=Date.now()+ROUND_MS;
  roster.forEach((p,i) => { p.role=p.id===monster.id?'monster':'hider'; p.captured=false; p.stunEnd=0; [p.x,p.y]=room.map.spawns[i%room.map.spawns.length]; });
  room.loop=setInterval(() => { const now=Date.now(); if(now>=room.roundEnd) endGame(room,'hiders'); else { updateQuests(room,now); announce(room); } },100);
  announce(room); io.to(room.code).emit('game:started');
}
function leaveRoom(socket) {
  const code=socket.data.roomCode; if(!code) return; const room=rooms.get(code); socket.leave(code); socket.data.roomCode=null; if(!room) return;
  const gone=room.players.get(socket.id); room.players.delete(socket.id);
  if(!room.players.size) { clearInterval(room.loop); rooms.delete(code); return; }
  room.quests?.forEach(q => { if(q.activeBy===socket.id) { q.activeBy=null; q.startedAt=null; } });
  if(room.ownerId===socket.id) { room.ownerId=room.players.keys().next().value; io.to(code).emit('system:notice',(gone?.name || 'O dono')+' saiu. A autoridade foi transferida.'); }
  if(room.phase==='running') { const monster=[...room.players.values()].some(p=>p.role==='monster'); const hider=[...room.players.values()].some(p=>p.role==='hider'&&!p.captured); if(!monster) endGame(room,'hiders'); else if(!hider) endGame(room,'monster'); }
  announce(room);
}
io.on('connection', socket => {
  socket.on('room:create',({name,classId},done) => { leaveRoom(socket); const code=makeCode(), player={id:socket.id,name:safeName(name),classId:safeClass(classId),role:null,captured:false,x:180,y:180}; const room={code,ownerId:socket.id,players:new Map([[socket.id,player]]),phase:'lobby'}; rooms.set(code,room); socket.join(code); socket.data.roomCode=code; announce(room); done?.({ok:true,code}); });
  socket.on('room:join',({code,name,classId},done) => { leaveRoom(socket); const room=rooms.get(String(code||'').toUpperCase()); if(!room) return done?.({ok:false,error:'Sala não encontrada.'}); if(room.phase==='running') return done?.({ok:false,error:'A rodada já começou.'}); if(room.players.size>=6) return done?.({ok:false,error:'Esta sala já está cheia.'}); room.players.set(socket.id,{id:socket.id,name:safeName(name),classId:safeClass(classId),role:null,captured:false,x:200,y:200}); socket.join(room.code); socket.data.roomCode=room.code; announce(room); done?.({ok:true,code:room.code}); });
  socket.on('room:leave',() => leaveRoom(socket));
  socket.on('game:start',() => { const room=rooms.get(socket.data.roomCode); if(!room) return; if(room.ownerId!==socket.id) return socket.emit('game:error','Somente a autoridade pode iniciar.'); if(room.players.size<2) return socket.emit('game:error','São necessários pelo menos 2 jogadores.'); beginGame(room); });
  socket.on('player:move',({dx,dy}) => {
    const room=rooms.get(socket.data.roomCode), p=room?.players.get(socket.id), now=Date.now(); if(!room||room.phase!=='running'||!p||p.captured) return;
    if(p.role==='monster' && (now<room.freezeEnd || now<p.stunEnd)) return;
    const mag=Math.hypot(Number(dx)||0,Number(dy)||0); if(!mag) return; const speed=5.3, nx=p.x+(dx/mag)*speed, ny=p.y+(dy/mag)*speed;
    if(!collides(room.map,nx,p.y)) p.x=nx; if(!collides(room.map,p.x,ny)) p.y=ny;
    if(p.role==='monster') for(const target of room.players.values()) if(target.role==='hider'&&!target.captured&&Math.hypot(target.x-p.x,target.y-p.y)<38) { target.captured=true; p.stunEnd=now+KILL_STUN_MS; room.quests.forEach(q=>{if(q.activeBy===target.id){q.activeBy=null;q.startedAt=null;}}); io.to(room.code).emit('system:notice',target.name+' foi consumido. A Penumbra está saciada por 3 segundos.'); break; }
    if(![...room.players.values()].some(q=>q.role==='hider'&&!q.captured)) endGame(room,'monster');
  });
  socket.on('quest:interact',() => { const room=rooms.get(socket.data.roomCode), p=room?.players.get(socket.id); if(!room||room.phase!=='running'||!p||p.role!=='hider'||p.captured) return; const range=p.classId==='scout'?82:QUEST_RANGE, quest=room.quests.find(q=>!q.completed&&!q.activeBy&&Math.hypot(q.x-p.x,q.y-p.y)<=range); if(!quest) return socket.emit('game:error','Aproxime-se de uma tarefa para interagir.'); quest.activeBy=p.id; quest.startedAt=Date.now(); io.to(room.code).emit('system:notice',p.name+' está realizando: '+quest.label); });
  socket.on('disconnect',() => leaveRoom(socket));
});
httpServer.listen(PORT, () => console.log('Penumbra em http://localhost:'+PORT));
