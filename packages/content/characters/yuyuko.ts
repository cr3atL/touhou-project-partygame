import type { CharacterDefinition } from '../../core/types';
import { publicOwn,skill } from '../shared';
import { BALANCE } from '../balance';
const p=BALANCE.yuyuko;
export const yuyuko: CharacterDefinition = {
  id:'yuyuko',name:'西行寺幽幽子',short:'幽幽子',glyph:'蝶',color:'#8dc5d2',active:'无寿之梦',passive:'幽蝶引路',cooldown:p.cooldown,range:p.range,
  activeText:'从公共己棋四格内附着一枚敌棋。其下回合用骰子移动时减两格，最低一格；若未移动，回合末后退两格。',
  passiveText:'首次自然骰为1或2并完成公共棋子的骰子移动后，可让另一枚公共己棋前进一格。',
  actions(v) { return publicOwn(v).flatMap(caster=>v.enemies.filter(t=>!t.mark&&v.distance(v.node(caster),v.node(t))<=p.range).map(target=>skill({skill:'yuyuko.dream',caster:caster.id,targets:[target.id]},`${v.label(caster.id)} → ${v.label(target.id)}`,[caster.id,target.id],[v.node(caster),v.node(target)],target.shield!==null?.2:2.3))); },
  cast(_v,c) { return [{type:'mark',ids:c.targets!,slow:p.slow,retreat:p.knockback}]; },
  afterDice(v,r) { return r.first && r.natural<=2 && r.fromPublic && v.optionsAdvance(r.piece,p.advance).length ? [{type:'offerAdvance',exclude:r.piece,steps:p.advance,prompt:'幽蝶引路 · 另一枚前进一格？',skip:true}] : []; }
};
