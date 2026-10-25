import { LAST_PUBLIC } from '../../core/constants';
import type { CharacterDefinition } from '../../core/types';
import { branchesFor, nodeAt } from '../../core/map';
import { publicOwn, skill } from '../shared';
import { BALANCE } from '../balance';
const p = BALANCE.yukari;
export const yukari: CharacterDefinition = {
  id:'yukari',name:'八云紫',short:'紫',glyph:'隙',color:'#b28ad5',active:'隙间穿行',passive:'境界缓冲',cooldown:p.cooldown,
  activeText:'选择一枚公共己棋，向前传送一至四格，不越过终点入口；不撞击或触发加速，保留状态。该棋本回合不能用骰子行动。',
  passiveText:'两次自己回合开始之间，首次受到敌方技能击退时少退一格，最低零格。保护挡下时不消耗。',
  actions(v) { return publicOwn(v).flatMap(caster=>Array.from({length:Math.min(4,LAST_PUBLIC-caster.progress)},(_,i)=>{
    const steps=i+1,node=nodeAt(caster,caster.progress+steps);
    return skill({skill:'yukari.gap',caster:caster.id,steps},`${v.label(caster.id)} → ${node}`,[caster.id],[node],steps-1);
  })); },
  cast(_v,c) { return [{type:'lockDice',piece:c.caster!},{type:'displace',piece:c.caster!,steps:c.steps!}]; },
  knockback(v,_piece,steps) { if(v.player.bufferUsed)return steps; v.player.bufferUsed=true; return Math.min(0,steps+p.buffer); }
};
