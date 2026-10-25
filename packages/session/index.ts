import type { DecisionTime } from './decisionClock';
import { CHARACTERS } from '../content';
import { assertGame, reduceGame } from '../core/engine';
import { VERSIONS, type Action, type CharacterId, type Command, type GameState } from '../core/types';
export interface Save { format: number; rules: string; game: GameState; timer?: DecisionTime; }
export function saveGame(game: GameState, timer?: DecisionTime): string { return JSON.stringify({ format: VERSIONS.save, rules: VERSIONS.rules, game, timer } satisfies Save, null, 2); }
export function loadGame(text: string): GameState {
  const data = JSON.parse(text) as Save;
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
export interface RoomSnapshot { protocol: number; rules: string; roomId: string; revision: number; hostSeat?: number | null; seats: Seat[]; game: GameState | null; timer?: DecisionTime; serverTime?: number; }
