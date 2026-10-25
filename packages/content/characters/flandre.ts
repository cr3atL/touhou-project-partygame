import type { CharacterDefinition } from '../../core/types';
import { publicOwn,skill } from '../shared';
import { BALANCE } from '../balance';
const p=BALANCE.flandre;
export const flandre: CharacterDefinition = {
  id:'flandre',name:'芙兰朵露',short:'芙兰',glyph:'毁',color:'#e98665',active:'莱瓦汀',passive:'四重存在',cooldown:p.cooldown,range:p.range,splitThreshold:p.splitThreshold,
  activeText:'从公共己棋三格内选择一枚敌棋击退四格。自身先实际后退一格，保护不退还代价。',
  passiveText:'本回合首次从公共格用至少四点移动时，可分出一点：主棋正常移动，另一枚公共己棋随后前进一格。',
  actions(v) { return publicOwn(v).filter(c=>c.progress>=p.cost).flatMap(caster=>v.enemies.filter(t=>v.distance(v.node(caster),v.node(t))<=p.range).map(target=>skill({skill:'flandre.laevatein',caster:caster.id,targets:[target.id]},`${v.label(caster.id)} → ${v.label(target.id)}`,[caster.id,target.id],[v.node(caster),v.node(target)],target.shield!==null?-1:Math.min(target.progress,p.knockback)-p.cost+.3))); },
  cast(_v,c) { return [{type:'displace',piece:c.caster!,steps:-p.cost},{type:'displace',piece:c.targets![0],steps:-p.knockback,hostile:true}]; }
};
