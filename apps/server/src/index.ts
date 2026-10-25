import { Server, Room, type Client } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { CHARACTERS, CHARACTER_LIST } from '../../../packages/content';
import { createGame, reduceGame } from '../../../packages/core/engine';
import { VERSIONS, type CharacterId, type Command, type GameState } from '../../../packages/core/types';
import { botAction, type RoomSnapshot, type Seat } from '../../../packages/session';

export class PartyRoom extends Room {
  maxClients = 4;
  private seats: (Seat & { session?: string; bot?: boolean })[] = [];
  private game: GameState | null = null;
  private revision = 0;
  private random = () => randomInt(0, 0x1000000) / 0x1000000;
  onCreate() {
    this.onMessage('sync', client => { this.welcome(client); client.send('snapshot', this.snapshot()); });
    this.onMessage('lobby', (client, data) => this.guard(client, () => {
      if (this.game) throw new Error('对局已经开始');
      const seat = this.seat(client);
      if (data?.type === 'character') {
        if (!CHARACTERS[data.character as CharacterId] || this.seats.some(s => s.id !== seat.id && s.character === data.character)) throw new Error('角色已被选择');
        seat.character = data.character; seat.ready = false;
      } else if (data?.type === 'ready') seat.ready = !seat.ready;
      else if (data?.type === 'bots') {
        this.requireHost(client);
        for (let id = 0; id < 4; id++) if (!this.seats.some(s => s.id === id)) {
          const character = CHARACTER_LIST.find(c => !this.seats.some(s => s.character === c.id))!.id;
          this.seats.push({ id, character, name: `式神 ${id + 1}`, ready: true, connected: true, bot: true });
        }
      } else if (data?.type === 'start') {
        this.requireHost(client);
        if (this.seats.length !== 4 || this.seats.some(s => !s.ready || !s.connected)) throw new Error('四个席位都需要准备');
        for (let i = this.seats.length - 1; i > 0; i--) { const j = randomInt(i + 1); [this.seats[i], this.seats[j]] = [this.seats[j], this.seats[i]]; }
        this.seats.forEach((s, id) => { s.id = id; });
        this.game = createGame(this.seats.map(s => ({ name: s.name, character: s.character, bot: !!s.bot })), CHARACTERS);
        for (const connected of this.clients) this.welcome(connected);
        this.lock();
      } else throw new Error('未知房间操作');
      this.publish();
    }));
    this.onMessage('command', (client, payload) => this.guard(client, () => {
      if (!this.game) throw new Error('对局尚未开始');
      const seat = this.seat(client);
      if (seat.id !== this.game.current || this.game.players[seat.id].bot) throw new Error('当前不是你的回合');
      if (payload?.revision !== this.game.revision) throw new Error('局面已更新，请重新选择');
      if (!payload.command || JSON.stringify(payload.command).length > 6000) throw new Error('无效指令');
      this.game = reduceGame(this.game, payload.command as Command, CHARACTERS, this.random); this.publish();
    }));
    this.onMessage('rematch', client => this.guard(client, () => {
      this.requireHost(client);
      if (this.game && this.game.phase !== 'over') throw new Error('请先完成当前对局');
      this.game = null; this.seats = this.seats.filter(s => s.connected || s.bot);
      for (const seat of this.seats) seat.ready = !!seat.bot;
      this.unlock(); this.publish();
    }));
    this.clock.setInterval(() => {
      if (this.game && this.game.phase !== 'over' && this.game.players[this.game.current].bot) {
        try { this.game = reduceGame(this.game, botAction(this.game).command, CHARACTERS, this.random); this.publish(); }
        catch (error) { console.error('Room bot failed', error); }
      }
    }, 650);
  }
  onJoin(client: Client, options: { name?: string; protocol?: number }) {
    if (options.protocol !== VERSIONS.protocol) throw new Error('客户端通信版本不兼容');
    const id = [0, 1, 2, 3].find(i => !this.seats.some(s => s.id === i));
    if (id === undefined || this.game) throw new Error('房间已满或已经开始');
    const character = CHARACTER_LIST.find(c => !this.seats.some(s => s.character === c.id))!.id;
    this.seats.push({ id, name: String(options.name || `玩家 ${id + 1}`).trim().slice(0, 16) || `玩家 ${id + 1}`, character, connected: true, ready: false, session: client.sessionId });
    this.welcome(client); this.publish();
  }
  async onDrop(client: Client) {
    const seat = this.seats.find(s => s.session === client.sessionId); if (!seat) return;
    seat.connected = false; this.publish();
    try {
      const reconnected = await this.allowReconnection(client, 120);
      seat.connected = true; this.welcome(reconnected); this.publish();
    } catch { /* onLeave takes over the abandoned seat. */ }
  }
  onReconnect(client: Client) {
    const seat = this.seats.find(s => s.session === client.sessionId);
    if (seat) { seat.connected = true; this.welcome(client); this.publish(); }
  }
  onLeave(client: Client) {
    const seat = this.seats.find(s => s.session === client.sessionId); if (!seat) return;
    if (this.game) { seat.connected = false; seat.bot = true; this.game.players[seat.id].bot = true; }
    else this.seats = this.seats.filter(s => s !== seat);
    this.publish();
  }
  private seat(client: Client) {
    const seat = this.seats.find(s => s.session === client.sessionId); if (!seat) throw new Error('席位不存在'); return seat;
  }
  private requireHost(client: Client) {
    const host = this.seats.filter(s => s.session && s.connected).sort((a, b) => a.id - b.id)[0];
    if (this.seat(client) !== host) throw new Error('需要房主操作');
  }
  private guard(client: Client, callback: () => void) { try { callback(); } catch (error) { client.send('notice', error instanceof Error ? error.message : '操作失败'); } }
  private welcome(client: Client) { const seat = this.seats.find(s => s.session === client.sessionId); if (seat) client.send('welcome', { seat: seat.id, protocol: VERSIONS.protocol }); }
  private snapshot(): RoomSnapshot { return { protocol: VERSIONS.protocol, rules: VERSIONS.rules, roomId: this.roomId, revision: this.revision, seats: this.seats.map(({ id, name, character, connected, ready, bot }) => ({ id, name, character, connected, ready, bot })), game: this.game }; }
  private publish() { this.revision++; this.broadcast('snapshot', this.snapshot()); }
}
export function createPartyServer() {
  const transport = new WebSocketTransport();
  transport.getExpressApp().get('/health', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, protocol: VERSIONS.protocol, rules: VERSIONS.rules });
  });
  const server = new Server({ transport, greet: false }); server.define('party', PartyRoom); return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createPartyServer();
  const port = Number(process.env.PORT || 2567);
  await server.listen(port, '0.0.0.0');
  console.log(`Party rooms listening on 0.0.0.0:${port}`);
}
