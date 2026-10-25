import { CHARACTERS } from '../content';
import { assertGame, createGame, getActions, reduceGame, seededRandom } from '../core/engine';
import { VERSIONS, type Action, type CharacterId, type Command, type GameState } from '../core/types';
export interface Save { format: number; rules: string; game: GameState; }
export function saveGame(game: GameState): string { return JSON.stringify({ format: VERSIONS.save, rules: VERSIONS.rules, game } satisfies Save, null, 2); }
export function loadGame(text: string): GameState {
  const data = JSON.parse(text) as Save;
  if(data.format===2&&data.rules==='0.4.0'&&Number(data.game?.versions?.protocol)===2&&data.game?.versions?.map===VERSIONS.map) {
    if(data.game.phase==='over')throw new Error('旧版已结束对局保持原结果；新局将决出前三名。旧存档未覆盖。');
    const initial=createGame(data.game.players.map(p=>({name:p.name,character:p.character,bot:p.bot})),CHARACTERS);
    const migrated=replayGame(initial,data.game.history);
    for(const key of ['pieces','players','current','turn','phase','dice','queue','choice','revision'] as const)if(JSON.stringify(migrated[key])!==JSON.stringify(data.game[key]))throw new Error('旧存档无法验证迁移，请保留原文件');
    assertGame(migrated);return migrated;
  }
  if (data.format !== VERSIONS.save || data.rules !== VERSIONS.rules || data.game?.versions?.rules !== VERSIONS.rules || data.game?.versions?.save !== VERSIONS.save || data.game?.versions?.protocol !== VERSIONS.protocol || data.game?.versions?.map !== VERSIONS.map) throw new Error('存档版本不兼容，旧对局已保留');
  assertGame(data.game); return data.game;
}
export { botAction, legacyBotAction } from './bot';
import { botAction } from './bot';
export function simulate(game: GameState, maxSteps = 15000, seed = 42) {
  let state = structuredClone(game); const random = seededRandom(seed);
  const commands: Command[] = [];
  while (state.phase !== 'over' && commands.length < maxSteps) {
    const a = botAction(state); commands.push(a.command); state = reduceGame(state, a.command, CHARACTERS, random);
  }
  return { state, commands };
}
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
export interface RoomSnapshot { protocol: number; rules: string; roomId: string; revision: number; hostSeat?: number | null; seats: Seat[]; game: GameState | null; }
