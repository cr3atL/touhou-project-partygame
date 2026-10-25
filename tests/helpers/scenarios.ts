import { LAST_PUBLIC, FINISH } from '../../packages/core/constants';
import { CHARACTERS } from '../../packages/content';
import { createGame, freshFlags } from '../../packages/core/engine';
import type { CharacterId, GameState } from '../../packages/core/types';
export const SCENARIOS: { id: CharacterId; name: string; description: string }[] = [
  { id:'reimu', name:'灵梦 · 二重结界', description:'两枚己棋附着无寿之梦，可选一至两枚净化并保护。' },
  { id:'marisa', name:'魔理沙 · 极限火花', description:'前方两枚敌棋，观察单条射线、击退和保护。' },
  { id:'yukari', name:'紫 · 隙间穿行', description:'前方一至四格任选传送，随后改用其他棋子掷骰。' },
  { id:'remilia', name:'蕾米 · 命运改写', description:'自然六点改为一格，获得保护并保留追加行动。' },
  { id:'flandre', name:'芙兰 · 莱瓦汀', description:'近距单体退四、自退一；六点可拆给另一枚公共己棋。' },
  { id:'yuyuko', name:'幽幽子 · 无寿之梦', description:'附着单枚敌棋；目标下回合接受减速或未移动回退。' },
  { id:'youmu', name:'妖梦 · 现世斩', description:'冲刺两格并击退途经敌棋；附着己棋可付一格净化。' }
];
export function scenario(id: CharacterId): GameState {
  const rest = Object.keys(CHARACTERS).filter(c => c !== id).slice(0, 3) as CharacterId[];
  const s = createGame([id, ...rest].map((character, i) => ({ character, name: i ? `玩家 ${i + 1}` : CHARACTERS[id].short })), CHARACTERS);
  const put = (owner: number, index: number, progress: number) => { const p = s.pieces.find(p => p.owner === owner && p.index === index)!; p.progress = progress+1; p.branch = 'ground'; return p; };
  s.phase = 'action'; s.dice = { value: 3, natural: 3, source: 'natural', extra: false };
  if (id === 'reimu') {
    for (const p of [put(0, 0, 10), put(0, 1, 16)]) p.mark = { caster: 1, expires: 1, slow: 2, retreat: 2 };
    put(1, 0, 0); put(2, 0, 37);
  } else if (id === 'marisa') { put(0, 0, 0); put(0, 1, 10); put(1, 0, 40); put(2, 0, 30); s.dice = { value:5,natural:5,source:'natural',extra:false }; put(3, 0, 16); }
  else if (id === 'yukari') { put(0, 0, 16); put(0, 1, 30); put(1, 0, 8); put(2, 0, 36); }
  else if (id === 'remilia') { put(0, 0, 8); put(0, 1, 16); put(1, 0, 3); s.dice = { value:6,natural:6,source:'natural',extra:true }; }
  else if (id === 'flandre') { put(0, 0, 10); put(0, 1, 5); put(1, 0, 0); put(2, 0, 38); s.dice = { value:6,natural:6,source:'natural',extra:true }; }
  else if (id === 'yuyuko') { put(0, 0, 10); put(0, 1, 4); put(1, 0, 1); put(1, 1, 2); s.dice = { value:1,natural:1,source:'natural',extra:false }; }
  else { put(0, 0, 0); put(0, 1, 2); put(1, 0, 40); s.pieces[0].mark={caster:1,expires:1,slow:2,retreat:2}; s.dice = {value:5,natural:5,source:'natural',extra:false}; }
  return s;
}

/** Local development fixture, never exposed by the room command protocol. */
export function placeForTest(previous: GameState, id: string, progress: number, branch: 'ground'): GameState {
  if (!Number.isInteger(progress) || progress < -1 || progress > FINISH) throw new Error(`赛程必须为 -1 到 ${FINISH} 的整数`);
  const s = structuredClone(previous), p = s.pieces.find(p => p.id === id);
  if (!p) throw new Error('棋子不存在');
  p.progress = progress; p.branch = progress >= 0 && progress <= LAST_PUBLIC ? branch : null; p.mark = null; p.shield = null;
  s.choice = null; s.queue = []; s.history = []; s.revision++;
  s.flags = freshFlags();
  s.dice = { value: s.dice?.value ?? 3, natural: s.dice?.value ?? 3, source: 'natural', extra: (s.dice?.value ?? 3) === 6 };
  s.players[s.current].activeAt = s.players[s.current].turns;
  s.players[s.current].passiveAt = s.players[s.current].turns;
  s.rankings=s.rankings.filter(id=>s.pieces.filter(p=>p.owner===id).every(p=>p.progress===FINISH));
  for(const player of s.players)if(!s.rankings.includes(player.id)&&s.pieces.filter(p=>p.owner===player.id).every(p=>p.progress===FINISH))s.rankings.push(player.id);
  s.rankings=s.rankings.slice(0,3);s.winner=s.rankings[0]??null;
  s.phase=s.rankings.length===3?'over':'action';
  if(s.phase!=='over'&&s.rankings.includes(s.current)){do{s.current=(s.current+1)%4;}while(s.rankings.includes(s.current));s.phase='roll';s.dice=null;}
  return s;
}
export function finishScenario(): GameState {
  const s = scenario('reimu');
  for (const p of s.pieces) { p.mark = null; p.shield = null; if (p.owner === 0) p.progress = p.index === 0 ? FINISH-1 : FINISH; }
  s.dice = { value: 1, natural:1, source: 'natural', extra: false }; return s;
}

/** The next piece earns third place; the first two players have already finished. */
export function podiumScenario(): GameState {
  const s=finishScenario();s.rankings=[1,2];s.winner=1;
  for(const p of s.pieces)if(p.owner===1||p.owner===2){p.progress=FINISH;p.mark=null;p.shield=null;}
  return s;
}
