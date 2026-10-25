import assert from 'node:assert/strict';
import { Client,type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { createPartyServer } from '../apps/server/src/index';
import { VERSIONS,type GameState } from '../packages/core/types';
import { CHARACTERS } from '../packages/content';
import { getActions } from '../packages/core/engine';
import { freshFlags } from '../packages/core/engine';
import { DecisionClock } from '../packages/session/decisionClock';
import type { RoomSnapshot } from '../packages/session';

const server=createPartyServer(),peers:{room:Room;seat:number;snapshot:RoomSnapshot|null;notices:string[]}[]=[];
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test:()=>boolean,label:string){const end=Date.now()+10_000;while(!test()){if(Date.now()>end)throw new Error(label);await pause(20);}}
function attach(room:Room){
  room.reconnection.enabled=false;
  const peer={room,seat:-1,snapshot:null as RoomSnapshot|null,notices:[] as string[]};
  room.onMessage('welcome',(data:{seat:number})=>{peer.seat=data.seat;});
  room.onMessage('snapshot',(data:RoomSnapshot)=>{peer.snapshot=data;});
  room.onMessage('timer',()=>{});room.onMessage('notice',(notice:string)=>peer.notices.push(notice));
  room.send('sync');return peer;
}
try{
  await server.listen(2571,'127.0.0.1');
  const client=()=>new Client('ws://127.0.0.1:2571');
  peers.push(attach(await client().create('party',{protocol:VERSIONS.protocol})));
  for(let i=1;i<4;i++)peers.push(attach(await client().joinById(peers[0].room.roomId,{protocol:VERSIONS.protocol})));
  await until(()=>peers.every(p=>p.seat>=0&&p.snapshot?.seats.length===4),'join');
  for(const p of peers)p.room.send('lobby',{type:'ready'});
  await until(()=>peers[0].snapshot!.seats.every(s=>s.ready),'ready');peers[0].room.send('lobby',{type:'start'});
  await until(()=>peers.every(p=>!!p.snapshot?.game),'start');
  const local=matchMaker.getLocalRoomById(peers[0].room.roomId) as unknown as {game:GameState;decisionClock:DecisionClock;publish():void};
  let actor=peers.find(p=>p.seat===local.game.current)!;
  // A short in-process starting budget avoids a minute-long test; all subsequent ticks are real.
  local.decisionClock.value.remainingMs=12_000;
  local.decisionClock.value.at=Date.now();local.publish();
  const turn=local.game.turn;
  for(let i=0;i<4;i++)actor.room.send('sync');
  await pause(300);
  assert(local.decisionClock.update(local.game).remainingMs<12_000,'sync must not reset timer');
  const token=actor.room.reconnectionToken,oldSeat=actor.seat;
  await actor.room.leave(false);
  const resumed=attach(await client().reconnect(token));peers[peers.indexOf(actor)]=resumed;actor=resumed;
  await until(()=>!!actor.snapshot?.game&&actor.seat===oldSeat,'reconnect');
  assert(actor.snapshot!.timer!.remainingMs<12_000,'reconnect keeps remaining budget');
  actor.room.send('command',{revision:local.game.revision,command:{type:'roll'}});
  await until(()=>local.game.revision===1,'roll');
  const during=local.decisionClock.update(local.game),revision=local.game.revision;
  const command=getActions(local.game,CHARACTERS).find(a=>a.kind==='move')!.command;
  const notices=actor.notices.length;
  actor.room.send('command',{revision,command});
  await until(()=>actor.notices.length>notices,'reject input during server presentation');
  assert.equal(local.game.revision,revision);
  await pause(500);
  assert.equal(local.decisionClock.update(local.game).remainingMs,during.remainingMs,'presentation pauses budget');
  await until(()=>Date.now()>=local.decisionClock.value.blockedUntil,'presentation completes');
  await pause(300);
  assert(local.decisionClock.update(local.game).remainingMs<during.remainingMs,'budget resumes automatically');
  // Start a timeout at a pending choice/action; the seat remains a human seat.
  local.game.flags=freshFlags();local.game.dice={value:1,natural:1,source:'natural',extra:false};local.game.phase='action';
  local.decisionClock.value.remainingMs=100;local.decisionClock.value.at=Date.now();local.publish();
  await until(()=>local.game.turn>turn,'temporary shikigami completes turn');
  assert(local.game.players.every(p=>!p.bot),'temporary timeout does not change permanent control');
  assert.equal(local.decisionClock.value.takeover,false,'next turn restores human control');
  assert(local.decisionClock.value.remainingMs>59_000);
  console.log(JSON.stringify({authoritativeTimer:true,syncCannotExtend:true,reconnectKeepsBudget:true,presentationPauseBounded:true,timeoutFinishesTurn:true,humanControlRestored:true}));
}finally{
  await Promise.allSettled(peers.map(p=>p.room.leave()));await server.gracefullyShutdown(false);
}
