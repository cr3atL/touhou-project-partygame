import { Server, Room, type Client } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { CHARACTERS, CHARACTER_LIST } from '../../../packages/content';
import { createGame, reduceGame } from '../../../packages/core/engine';
import { VERSIONS, type CharacterId, type Command, type GameState } from '../../../packages/core/types';
import { botAction, ROOM_KICKED_CODE, type RoomSnapshot, type Seat } from '../../../packages/session';

export class PartyRoom extends Room {
  maxClients = 4;
  private seats: (Seat & { session?: string; bot?: boolean })[] = [];
  private game: GameState | null = null;
  private revision = 0;
  private hostSession: string | null = null;
  private reconnecting = new Map<string, ReturnType<Room['allowReconnection']>>();
  private random = () => randomInt(0, 0x1000000) / 0x1000000;
  onCreate() {
    this.onMessage('sync', client => this.guard(client, () => { this.seat(client); this.welcome(client); client.send('snapshot', this.snapshot()); }));
    this.onMessage('manage', (client, data) => this.guard(client, () => {
      this.requireHost(client);
      if (data?.revision !== this.revision) throw new Error('房间已更新，请重新选择');
      if (!Number.isInteger(data?.seat)) throw new Error('无效席位');
      const target = this.seats.find(s => s.id === data.seat);
      if (!target) throw new Error('席位不存在');
      if (target === this.seat(client)) throw new Error('不能移除自己，请使用离开房间');
      if (data.type === 'removeBot') {
        if (!target.bot) throw new Error('该席位不是式神');
        if (this.game) throw new Error('请返回大厅后移除式神');
        this.seats = this.seats.filter(s => s !== target);
      } else if (data.type === 'kick') {
        if (target.bot || !target.session) throw new Error('该席位不是玩家');
        const session = target.session;
        const kicked = this.clients.find(c => c.sessionId === session);
        if (this.game) this.takeOver(target);
        else this.seats = this.seats.filter(s => s !== target);
        // Revoke an already-disconnected player's pending reconnection as well.
        this.reconnecting.get(session)?.reject(new Error('已被房主移出房间'));
        kicked?.leave(ROOM_KICKED_CODE, '你已被房主移出房间');
      } else throw new Error('未知管理操作');
      this.publish();
    }));
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
    const pending = this.allowReconnection(client, 120);
    this.reconnecting.set(client.sessionId, pending);
    try {
      const reconnected = await pending;
      if (!this.seats.includes(seat) || seat.session !== client.sessionId) { reconnected.leave(ROOM_KICKED_CODE); return; }
      seat.connected = true; this.welcome(reconnected); this.publish();
    } catch { /* onLeave takes over the abandoned seat. */ }
    finally { if(this.reconnecting.get(client.sessionId)===pending)this.reconnecting.delete(client.sessionId); }
  }
  onReconnect(client: Client) {
    const seat = this.seats.find(s => s.session === client.sessionId);
    if (seat) { seat.connected = true; this.welcome(client); this.publish(); }
    else client.leave(ROOM_KICKED_CODE);
  }
  onLeave(client: Client) {
    const seat = this.seats.find(s => s.session === client.sessionId); if (!seat) return;
    if (this.game) this.takeOver(seat);
    else this.seats = this.seats.filter(s => s !== seat);
    this.publish();
  }
  private seat(client: Client) {
    const seat = this.seats.find(s => s.session === client.sessionId); if (!seat) throw new Error('席位不存在'); return seat;
  }
  private requireHost(client: Client) {
    if (this.seat(client) !== this.host()) throw new Error('需要房主操作');
  }
  private host() {
    const candidates = this.seats.filter(s => s.session && s.connected && !s.bot);
    const host = candidates.find(s => s.session === this.hostSession) ?? candidates.sort((a,b) => a.id-b.id)[0];
    this.hostSession = host?.session ?? null; return host;
  }
  private takeOver(seat: typeof this.seats[number]) {
    seat.connected = true; seat.bot = true; seat.ready = true; delete seat.session;
    if(this.game&&!this.game.players[seat.id].bot)this.game={...this.game,revision:this.game.revision+1,players:this.game.players.map(p=>p.id===seat.id?{...p,bot:true}:p)};
  }
  private guard(client: Client, callback: () => void) { try { callback(); } catch (error) { client.send('notice', error instanceof Error ? error.message : '操作失败'); } }
  private welcome(client: Client) { const seat = this.seats.find(s => s.session === client.sessionId); if (seat) client.send('welcome', { seat: seat.id, protocol: VERSIONS.protocol }); }
  private snapshot(): RoomSnapshot { return { protocol: VERSIONS.protocol, rules: VERSIONS.rules, roomId: this.roomId, revision: this.revision, hostSeat: this.host()?.id ?? null, seats: this.seats.map(({ id, name, character, connected, ready, bot }) => ({ id, name, character, connected, ready, bot })), game: this.game }; }
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
