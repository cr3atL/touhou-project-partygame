import type { CharacterDefinition } from '../../core/types';
import { skill } from '../shared';
import { BALANCE } from '../balance';
const p=BALANCE.remilia;
export const remilia: CharacterDefinition = {
  id:'remilia',name:'蕾米莉亚',short:'蕾米',glyph:'命',color:'#d28cc0',active:'命运改写',passive:'红雾庇护',cooldown:p.cooldown,
  activeText:'将首次自然骰d的移动格数改为7−d，仅限起点与落点都在公共道路的移动。自然六点追加资格保持。',
  passiveText:'首次骰子行动最终使用一或两格时，该棋获得一次保护，持续至自己下回合开始，出场也适用。',
  actions(v) { const d=7-v.state.dice!.natural,moves=v.moves(d,true); return moves.length?[skill({skill:'remilia.rewrite'},`改为 ${d} 格`,[],[],Math.max(...moves.map(a=>a.score??0))-Math.max(0,...v.moves(v.state.dice!.value).map(a=>a.score??0))+.1)]:[]; },
  cast(v) { return [{type:'rewriteDice',value:7-v.state.dice!.natural}]; },
  afterDice(_v,r) { return r.first && r.steps<=2 && (!r.spawn || p.spawnShield===true) ? [{type:'shield',ids:[r.piece]}] : []; }
};
