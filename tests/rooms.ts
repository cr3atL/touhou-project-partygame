import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Client, type Room } from '@colyseus/sdk';
import { botAction, type RoomSnapshot } from '../packages/session';
import { VERSIONS } from '../packages/core/types';
import { waitForRoomServer } from '../apps/web/src/connection';

// With ROOM_SERVER_URL, exercise a deployed service using only the public protocol.
// Otherwise launch the compiled production entry point, independent of the dev server.
const endpoint = process.env.ROOM_SERVER_URL || 'ws://127.0.0.1:2570';
const origin = 'https://cr3atl.github.io';
const child = process.env.ROOM_SERVER_URL ? null : spawn(process.execPath, ['dist-server/index.mjs'], {
  env: { ...process.env, PORT: '2570', NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let logs = '';
child?.stdout?.on('data', data => { logs += String(data); });
child?.stderr?.on('data', data => { logs += String(data); });
const peers: { room: Room; seat: number; snapshot: RoomSnapshot | null; notices: string[] }[] = [];
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, label: string) {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timeout: ${label}`);
    await pause(20);
  }
}
function attach(room: Room) {
  const peer = { room, seat: -1, snapshot: null as RoomSnapshot | null, notices: [] as string[] };
  room.onMessage('welcome', (data: { seat: number }) => { peer.seat = data.seat; });
  room.onMessage('snapshot', (snapshot: RoomSnapshot) => { peer.snapshot = snapshot; });
  room.onMessage('notice', (notice: string) => peer.notices.push(notice));
  room.send('sync'); return peer;
}
const client = () => new Client(endpoint, { headers: { Origin: origin } });
try {
  if (child) {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw new Error(`Production server exited: ${logs}`);
      try { await waitForRoomServer(endpoint); ready = true; break; } catch { await pause(100); }
    }
    assert(ready, `Production server did not start: ${logs}`);
  } else await waitForRoomServer(endpoint);
  const http = new URL(endpoint); http.protocol = http.protocol === 'wss:' ? 'https:' : 'http:';
  const health = await fetch(new URL('/health', http), { headers: { Origin: origin } });
  assert.equal(health.headers.get('access-control-allow-origin'), '*');
  const preflight = await fetch(new URL('/matchmake/create/party', http), {
    method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  peers.push(attach(await client().create('party', { name: '验证 1', protocol: VERSIONS.protocol })));
  for (let i = 1; i < 4; i++) peers.push(attach(await client().joinById(peers[0].room.roomId, { name: `验证 ${i + 1}`, protocol: VERSIONS.protocol })));
  await until(() => peers.every(p => p.seat >= 0 && p.snapshot?.seats.length === 4), 'four players');
  await assert.rejects(() => client().joinById(peers[0].room.roomId, { protocol: VERSIONS.protocol }));
  for (const peer of peers) peer.room.send('lobby', { type: 'ready' });
  await until(() => peers[0].snapshot!.seats.every(s => s.ready), 'all ready');
  peers[0].room.send('lobby', { type: 'start' });
  await until(() => peers.every(p => !!p.snapshot?.game), 'start');
  let commands = 0;
  for (; commands < 120 && peers[0].snapshot!.game!.phase !== 'over'; commands++) {
    const state = peers[0].snapshot!.game!;
    const actor = peers.find(p => p.seat === state.current)!;
    const command = botAction(state).command;
    if (commands === 0) {
      const other = peers.find(p => p !== actor)!;
      other.room.send('command', { revision: state.revision, command });
      await until(() => other.notices.length > 0, 'reject out of turn');
      assert.equal(peers[0].snapshot!.game!.revision, state.revision);
    }
    actor.room.send('command', { revision: state.revision, command });
    await until(() => peers.every(p => p.snapshot!.game!.revision === state.revision + 1), 'sync command');
    const canonical = JSON.stringify(peers[0].snapshot!.game);
    assert(peers.every(p => JSON.stringify(p.snapshot!.game) === canonical), 'all four states match');
    if (commands === 0) {
      const before = actor.notices.length;
      actor.room.send('command', { revision: state.revision, command });
      await until(() => actor.notices.length > before, 'reject stale command');
      assert.equal(peers[0].snapshot!.game!.revision, state.revision + 1);
    }
  }
  const dropped = peers[3], token = dropped.room.reconnectionToken;
  dropped.room.reconnection.enabled = false;
  await dropped.room.leave(false);
  peers[3] = attach(await client().reconnect(token));
  await until(() => peers[3].seat === dropped.seat && peers.every(p => p.snapshot?.seats.every(s => s.connected)), 'reconnect');
  assert.deepEqual(peers[3].snapshot!.game, peers[0].snapshot!.game);
  console.log(JSON.stringify({ endpoint, players: 4, commands, crossOrigin: true, fullRoomRejected: true, outOfTurnRejected: true, staleRejected: true, reconnected: true }));
} catch (error) {
  if (logs.trim()) console.error(logs);
  throw error;
} finally {
  await Promise.allSettled(peers.map(p => p.room.leave()));
  if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
}
