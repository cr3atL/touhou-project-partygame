import assert from 'node:assert/strict';
import { Client, type Room } from '@colyseus/sdk';
import { createPartyServer } from '../apps/server/src/index';
import { matchMaker } from '@colyseus/core';
import { CHARACTERS, CHARACTER_LIST } from '../packages/content';
import { getActions, reduceGame } from '../packages/core/engine';
import { scenario, finishScenario } from '../packages/session/scenarios';
import type { GameState } from '../packages/core/types';
import { VERSIONS } from '../packages/core/types';
import { botAction, type RoomSnapshot } from '../packages/session';

const server = createPartyServer();
const peers: { room: Room; seat: number; snapshot: RoomSnapshot | null; notices: string[] }[] = [];
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, label: string) {
  const deadline = Date.now() + 8000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error(`Timeout: ${label}`); await pause(15); }
}
function attach(room: Room) {
  const peer = { room, seat: -1, snapshot: null as RoomSnapshot | null, notices: [] as string[] };
  room.onMessage('welcome', (data: { seat: number }) => { peer.seat = data.seat; });
  room.onMessage('snapshot', (s: RoomSnapshot) => { peer.snapshot = s; });
  room.onMessage('notice', (s: string) => peer.notices.push(s));
  room.send('sync'); return peer;
}
try {
  await server.listen(2568, '127.0.0.1');
  for (const lineup of [['reimu','marisa','yukari','remilia'],['flandre','yuyuko','youmu','remilia']]) {
  const skills = new Set<string>();
  const client = new Client('ws://127.0.0.1:2568');
  const first = attach(await client.create('party', { name: 'network-0', protocol: VERSIONS.protocol })); peers.push(first);
  for (let i = 1; i < 4; i++) peers.push(attach(await new Client('ws://127.0.0.1:2568').joinById(first.room.roomId, { name: `network-${i}`, protocol: VERSIONS.protocol })));
  await until(() => peers.every(p => p.snapshot?.seats.length === 4 && p.seat >= 0), 'four seats');
  for (let i=0;i<4;i++) { peers[i].room.send('lobby',{type:'character',character:lineup[i]}); await until(()=>peers[0].snapshot!.seats.find(s=>s.id===peers[i].seat)?.character===lineup[i], 'character'); }
  for (const peer of peers) peer.room.send('lobby', { type: 'ready' });
  await until(() => peers[0].snapshot!.seats.every(s => s.ready), 'ready');
  first.room.send('lobby', { type: 'start' });
  await until(() => peers.every(p => p.snapshot?.game !== null && p.snapshot?.game !== undefined), 'start');
  const illegal = peers.find(p => p.seat !== peers[0].snapshot!.game!.current)!;
  illegal.room.send('command', { revision: 0, command: { type: 'roll' } });
  await until(() => illegal.notices.length > 0, 'reject out of turn');
  assert.equal(peers[0].snapshot!.game!.revision, 0);
  for (let i = 0; i < 90; i++) {
    const state = peers[0].snapshot!.game!;
    if (state.phase === 'over') break;
    const actor = peers.find(p => p.seat === state.current)!;
    const command=botAction(state).command; if(command.type==='cast')skills.add(command.skill);
    actor.room.send('command', { revision: state.revision, command });
    await until(() => peers.every(p => p.snapshot!.game!.revision === state.revision + 1), `command ${i}`);
    const canonical = JSON.stringify(peers[0].snapshot!.game);
    assert(peers.every(p => JSON.stringify(p.snapshot!.game) === canonical), 'all four game states must match');
    if (i === 0) {
      const notices = actor.notices.length;
      actor.room.send('command', { revision: state.revision, command });
      await until(() => actor.notices.length > notices, 'reject stale command');
      assert.equal(peers[0].snapshot!.game!.revision, state.revision + 1);
    }
  }
  let scenarioCommands=0;
  if(lineup[0]==='reimu') {
    // In-process test fixture only; no scenario-loading message exists in the room protocol.
    const localRoom=matchMaker.getLocalRoomById(first.room.roomId) as unknown as {game:GameState;publish():void};
    for(const character of CHARACTER_LIST) {
      const fixture=scenario(character.id);fixture.revision=peers[0].snapshot!.game!.revision+1;
      localRoom.game=fixture;localRoom.publish();
      await until(()=>peers.every(p=>p.snapshot!.game!.revision===fixture.revision),'scenario fixture');
      for(let step=0;step<6;step++) {
        const state=peers[0].snapshot!.game!;
        const command=step===0?getActions(state,CHARACTERS).find(a=>a.kind==='cast')!.command:botAction(state).command;
        if(command.type==='cast')skills.add(command.skill);
        const expected=command.type==='roll'?null:reduceGame(state,command,CHARACTERS,()=>{throw new Error('unexpected randomness');});
        peers.find(p=>p.seat===state.current)!.room.send('command',{revision:state.revision,command});
        await until(()=>peers.every(p=>p.snapshot!.game!.revision===state.revision+1),'scenario command');
        const canonical=JSON.stringify(peers[0].snapshot!.game);
        assert(peers.every(p=>JSON.stringify(p.snapshot!.game)===canonical));
        if(expected)assert.equal(canonical,JSON.stringify(expected),'server skill result must match core');
        scenarioCommands++;
      }
    }
    for(const character of CHARACTER_LIST)assert([...skills].some(skill=>skill.startsWith(character.id+'.')));
  }
  let podiumCommands=0;
  if(lineup[0]==='reimu') {
    const localRoom=matchMaker.getLocalRoomById(first.room.roomId) as unknown as {game:GameState;publish():void};
    for(let place=0;place<3;place++) {
      const fixture=place===0?finishScenario():structuredClone(peers[0].snapshot!.game!);
      fixture.current=place;fixture.phase='action';fixture.choice=null;fixture.queue=[];
      fixture.dice={value:1,natural:1,source:'natural',extra:false};
      for(const p of fixture.pieces.filter(p=>p.owner===place)){p.progress=p.index===0?52:53;p.mark=null;p.shield=null;}
      fixture.revision=peers[0].snapshot!.game!.revision+1;localRoom.game=fixture;localRoom.publish();
      await until(()=>peers.every(p=>p.snapshot!.game!.revision===fixture.revision),'podium fixture');
      const command=getActions(fixture,CHARACTERS).find(a=>a.kind==='move')!.command;
      peers.find(p=>p.seat===place)!.room.send('command',{revision:fixture.revision,command});
      await until(()=>peers.every(p=>p.snapshot!.game!.revision===fixture.revision+1),'podium placement');
      const canonical=JSON.stringify(peers[0].snapshot!.game);
      assert(peers.every(p=>JSON.stringify(p.snapshot!.game)===canonical));
      assert.deepEqual(peers[0].snapshot!.game!.rankings,Array.from({length:place+1},(_,i)=>i));
      assert.equal(peers[0].snapshot!.game!.phase==='over',place===2);podiumCommands++;
      if(place===0){
        const host=peers.find(p=>p.seat===0)!,notices=host.notices.length;
        host.room.send('rematch');await until(()=>host.notices.length>notices,'reject early rematch');
        assert(peers[0].snapshot!.game!==null);
      }
    }
  }
  const before = peers[0].snapshot!.game!.revision;
  const reconnecting = peers[3]; const token = reconnecting.room.reconnectionToken;
  // Explicitly disable the SDK's automatic retry so this tests token-based resume.
  reconnecting.room.reconnection.enabled = false;
  await reconnecting.room.leave(false);
  const resumed = attach(await new Client('ws://127.0.0.1:2568').reconnect(token));
  peers[3] = resumed;
  await until(() => resumed.snapshot?.game?.revision === before && resumed.seat >= 0, 'reconnect state');
  assert.equal(resumed.seat, reconnecting.seat);
  console.log(JSON.stringify({ lineup, skills:[...skills], clients: 4, synchronizedCommands: 90, scenarioCommands, podiumCommands, rejectedOutOfTurn: true, rejectedStale: true, reconnected: true, finalRevision: before }));
  if(podiumCommands){peers.find(p=>p.seat===0)!.room.send('rematch');await until(()=>peers.every(p=>p.snapshot!.game===null),'rematch after third place');}
  await Promise.allSettled(peers.map(p=>p.room.leave())); peers.length=0;
  }
} finally {
  await Promise.allSettled(peers.map(p => p.room.leave()));
  await server.gracefullyShutdown(false);
}
