import assert from 'node:assert/strict';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { createPartyServer } from '../apps/server/src/index';
import { ROOM_KICKED_CODE, type RoomSnapshot } from '../packages/session';
import { VERSIONS, type GameState } from '../packages/core/types';

const endpoint='ws://127.0.0.1:2569', server=createPartyServer();
interface Peer { room:Room; seat:number; snapshot:RoomSnapshot|null; notices:string[]; closed:boolean; closeCode:number }
const peers: Peer[]=[];
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate:()=>boolean,label:string) {
  const deadline=Date.now()+8000;
  while(!predicate()){if(Date.now()>deadline)throw new Error(`Timeout: ${label}`);await pause(15);}
}
function attach(room:Room):Peer {
  room.reconnection.enabled=false;
  const peer={room,seat:-1,snapshot:null as RoomSnapshot|null,notices:[] as string[],closed:false,closeCode:0};
  room.onMessage('welcome',(data:{seat:number})=>{peer.seat=data.seat;});
  room.onMessage('snapshot',(snapshot:RoomSnapshot)=>{peer.snapshot=snapshot;});
  room.onMessage('timer',()=>{});
  room.onMessage('notice',(notice:string)=>peer.notices.push(notice));
  room.onLeave(code=>{peer.closed=true;peer.closeCode=code;});
  peers.push(peer);room.send('sync');return peer;
}
async function join(roomId?:string,name='玩家') {
  const client=new Client(endpoint),options={name,protocol:VERSIONS.protocol};
  const peer=attach(roomId?await client.joinById(roomId,options):await client.create('party',options));
  await until(()=>!!peer.snapshot&&peer.seat>=0,'join');return peer;
}
async function denied(peer:ReturnType<typeof attach>,action:Record<string,unknown>,message:RegExp) {
  const count=peer.notices.length;
  peer.room.send('manage',{revision:peer.snapshot!.revision,...action});
  await until(()=>peer.notices.length>count,'management rejected');
  assert.match(peer.notices.at(-1)!,message);
}
let failed=false;
try {
  await server.listen(2569,'127.0.0.1');
  const host=await join(undefined,'房主'),guest=await join(host.room.roomId,'玩家二');
  const offline=await join(host.room.roomId,'断线玩家'),removed=await join(host.room.roomId,'待移出玩家');
  await until(()=>host.snapshot!.seats.length===4,'four seats');
  await denied(guest,{type:'kick',seat:host.seat},/房主/);
  await denied(host,{type:'kick',seat:host.seat},/自己/);
  await denied(host,{type:'kick',seat:99},/席位不存在/);
  await denied(host,{type:'removeBot',seat:guest.seat},/不是式神/);
  const oldRevision=host.snapshot!.revision,oldSeat=removed.seat,oldToken=removed.room.reconnectionToken;
  host.room.send('manage',{type:'kick',seat:oldSeat,revision:oldRevision});
  await until(()=>removed.closed&&host.snapshot!.seats.length===3,'kick lobby player');
  assert.equal(removed.closeCode,ROOM_KICKED_CODE);
  await assert.rejects(()=>new Client(endpoint).reconnect(oldToken));
  const replacement=await join(host.room.roomId,'新入席玩家');
  assert.equal(replacement.seat,oldSeat);
  await until(()=>host.snapshot!.seats.length===4,'replacement visible');
  await denied(host,{type:'kick',seat:oldSeat,revision:oldRevision},/已更新/);
  assert(!replacement.closed);
  host.room.send('manage',{type:'kick',seat:replacement.seat,revision:host.snapshot!.revision});
  await until(()=>replacement.closed&&host.snapshot!.seats.length===3,'clear replacement');
  host.room.send('lobby',{type:'bots'});
  await until(()=>host.snapshot!.seats.length===4,'add bot');
  const bot=host.snapshot!.seats.find(s=>s.bot)!;
  await until(()=>guest.snapshot!.revision===host.snapshot!.revision,'guest bot snapshot');
  await denied(guest,{type:'removeBot',seat:bot.id},/房主/);
  host.room.send('manage',{type:'removeBot',seat:bot.id,revision:host.snapshot!.revision});
  await until(()=>host.snapshot!.seats.length===3,'remove bot');

  const offlineToken=offline.room.reconnectionToken;
  await offline.room.leave(false);
  await until(()=>host.snapshot!.seats.find(s=>s.id===offline.seat)?.connected===false,'disconnect grace period');
  host.room.send('manage',{type:'kick',seat:offline.seat,revision:host.snapshot!.revision});
  await until(()=>host.snapshot!.seats.length===2,'kick disconnected player');
  await assert.rejects(()=>new Client(endpoint).reconnect(offlineToken));
  host.room.send('lobby',{type:'bots'});
  await until(()=>host.snapshot!.seats.length===4,'refill bots');
  host.room.send('lobby',{type:'ready'});guest.room.send('lobby',{type:'ready'});
  await until(()=>host.snapshot!.seats.every(s=>s.ready),'ready');
  host.room.send('lobby',{type:'start'});
  await until(()=>!!host.snapshot!.game&&!!guest.snapshot!.game,'start');
  assert.equal(host.snapshot!.hostSeat,host.seat,'shuffle must retain the same host connection');
  await denied(guest,{type:'kick',seat:host.seat},/房主/);
  const local=matchMaker.getLocalRoomById(host.room.roomId) as unknown as {game:GameState;publish():void};
  // Put the human guest on turn so takeover must actually continue their turn.
  local.game={...local.game,current:guest.seat,phase:'roll',dice:null,choice:null,queue:[],revision:local.game.revision+1};
  const fixtureRevision=local.game.revision;
  local.publish();
  await until(()=>host.snapshot!.game!.revision===fixtureRevision&&host.snapshot!.game!.current===guest.seat&&host.snapshot!.game!.phase==='roll','guest turn fixture');
  const pieces=structuredClone(host.snapshot!.game!.pieces),guestToken=guest.room.reconnectionToken;
  const takeoverRevision=host.snapshot!.game!.revision+1;
  host.room.send('manage',{type:'kick',seat:guest.seat,revision:host.snapshot!.revision});
  await until(()=>guest.closed&&host.snapshot!.game!.players[guest.seat].bot,'take over kicked player');
  assert.equal(guest.closeCode,ROOM_KICKED_CODE);
  assert.equal(host.snapshot!.seats.length,4);
  assert.equal(host.snapshot!.hostSeat,host.seat);
  assert.deepEqual(host.snapshot!.game!.pieces,pieces,'kick itself preserves all pieces');
  await assert.rejects(()=>new Client(endpoint).reconnect(guestToken));
  await denied(host,{type:'removeBot',seat:guest.seat},/返回大厅/);
  await until(()=>host.snapshot!.game!.revision>takeoverRevision,'bot continues kicked player turn');

  local.game={...local.game,phase:'over'};local.publish();
  await until(()=>host.snapshot!.game!.phase==='over','end fixture');
  host.room.send('rematch');
  await until(()=>host.snapshot!.game===null,'return to lobby');
  assert(host.snapshot!.seats.filter(s=>s.bot).every(s=>s.ready&&s.connected));
  host.room.send('manage',{type:'removeBot',seat:guest.seat,revision:host.snapshot!.revision});
  await until(()=>host.snapshot!.seats.length===3,'remove takeover bot in lobby');
  const newcomer=await join(host.room.roomId,'重新加入的旅人');
  assert.equal(newcomer.seat,guest.seat);

  const first=await join(undefined,'新房主'),second=await join(first.room.roomId,'继任房主'),third=await join(first.room.roomId,'普通玩家');
  await first.room.leave();
  await until(()=>second.snapshot!.hostSeat===second.seat,'host transfers on departure');
  await denied(third,{type:'kick',seat:second.seat},/房主/);
  second.room.send('lobby',{type:'bots'});
  await until(()=>second.snapshot!.seats.length===4,'new host management');
  console.log(JSON.stringify({lobbyKick:true,removeBot:true,permissions:true,staleTargetProtected:true,disconnectedKick:true,reconnectRevoked:true,hostPreservedAfterShuffle:true,hostTransferred:true,inGameTakeover:true,botContinues:true,rematchAndRefill:true}));
} catch(error) {
  failed=true;console.error(error);
} finally {
  await Promise.allSettled(peers.filter(p=>!p.closed).map(p=>p.room.leave()));
  await server.gracefullyShutdown(false);
}
if(failed)process.exitCode=1;
