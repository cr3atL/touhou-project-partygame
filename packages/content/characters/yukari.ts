import type { CharacterDefinition } from '../../core/types';
import { branchesFor, nodeAt } from '../../core/map';
import { publicOwn, skill } from '../shared';
import { BALANCE } from '../balance';
const p = BALANCE.yukari;
export const yukari: CharacterDefinition = {
  id:'yukari',name:'八云紫',short:'紫',glyph:'隙',color:'#b28ad5',active:'隙间穿行',passive:'境界缓冲',cooldown:p.cooldown,
  activeText:'选择一枚公共己棋，固定前进三格或在对应地面与冥界格之间换路；该棋本回合不能用骰子行动。',
  passiveText:'两次自己回合开始之间，首次受到敌方技能击退时少退一格，最低零格。保护挡下时不消耗。',
  actions(v) { return publicOwn(v).flatMap(caster=>{
    const steps=Math.min(p.advance,47-caster.progress);
    const advance=steps>0?branchesFor(caster,steps).map(branch=>skill({skill:'yukari.gap',caster:caster.id,mode:'advance',branch},`${v.label(caster.id)} → ${nodeAt(caster,caster.progress+steps,branch)}`,[caster.id],[nodeAt(caster,caster.progress+steps,branch)],steps-1,'前进三格')):[];
    const at=v.node(caster), branch=caster.branch==='spirit'?'ground':'spirit';
    return [...advance,...(/^[GR](29|30|31|32|33)$/.test(at)?[skill({skill:'yukari.gap',caster:caster.id,mode:'switch',branch},`${v.label(caster.id)} → ${nodeAt(caster,caster.progress,branch)}`,[caster.id],[nodeAt(caster,caster.progress,branch)],caster.mark ? .5 : 0,'对应支线换路')]:[])];
  }); },
  cast(_v,c) { return [{type:'lockDice',piece:c.caster!},c.mode==='switch'?{type:'switchRoute',piece:c.caster!,branch:c.branch!}:{type:'displace',piece:c.caster!,steps:p.advance,branch:c.branch!}]; },
  knockback(v,_piece,steps) { if(v.player.bufferUsed)return steps; v.player.bufferUsed=true; return Math.min(0,steps+p.buffer); }
};
