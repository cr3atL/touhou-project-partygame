import type { DecisionTime } from './decisionClock';
import type { PlayTime } from './playClock';
import { CHARACTERS } from '../content';
import { assertGame, reduceGame } from '../core/engine';
import { VERSIONS, type Action, type CharacterId, type Command, type GameState } from '../core/types';
export interface Save { format: number; rules: string; game: GameState; timer?: DecisionTime; playTime?: PlayTime; }
export function saveGame(game: GameState, timer?: DecisionTime, playTime?: PlayTime): string { return JSON.stringify({ format: VERSIONS.save, rules: VERSIONS.rules, game, timer, playTime } satisfies Save, null, 2); }
export function loadGame(text: string): GameState {
  const data = JSON.parse(text) as Save;
  // v0.1.5 uses the same map and movement rules; retain its already assigned seats/order.
  const old = { rules:'0.5.0', map:'1.1.0', protocol:5, save:5 };
  if(data.format===5&&data.rules===old.rules&&data.game?.versions&&Object.entries(old).every(([key,value])=>(data.game.versions as unknown as Record<string,unknown>)[key]===value)){
    data.format=VERSIONS.save;data.rules=VERSIONS.rules;data.game.versions={...VERSIONS};data.game.turnOrder=[0,1,2,3];
    for(const player of data.game.players)if(player.bot)player.name=player.name.replace(/^式神(?=\s*\d)/,'机器人');
    for(const event of data.game.events)event.text=event.text.replace(/式神(?=\s*\d)/g,'机器人');
  }
  if (data.format !== VERSIONS.save || data.rules !== VERSIONS.rules || data.game?.versions?.rules !== VERSIONS.rules || data.game?.versions?.save !== VERSIONS.save || data.game?.versions?.protocol !== VERSIONS.protocol || data.game?.versions?.map !== VERSIONS.map) throw new Error('存档版本不兼容，旧对局已保留');
  assertGame(data.game); return data.game;
}
export { botAction } from './bot';
export function replayGame(initial: GameState, history: GameState['history']): GameState {
  let state = structuredClone(initial);
  for (const record of history) {
    let cursor = 0;
    state = reduceGame(state, record.command, CHARACTERS, () => {
      if (cursor >= record.random.length) throw new Error('回放缺少随机结果');
      return record.random[cursor++];
    });
    if (cursor !== record.random.length) throw new Error('回放随机结果不匹配');
  }
  return state;
}
export interface Seat { id: number; name: string; character: CharacterId; ready: boolean; connected: boolean; bot?: boolean; }
export const ROOM_KICKED_CODE = 4100;
export interface RoomSnapshot { protocol: number; rules: string; roomId: string; revision: number; hostSeat?: number | null; seats: Seat[]; game: GameState | null; timer?: DecisionTime; playTime?: PlayTime; serverTime?: number; }
