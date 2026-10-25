import { LAST_PUBLIC } from '../../core/constants';
import type { CharacterDefinition } from '../../core/types';
import { branchesFor } from '../../core/map';
import { publicOwn,skill } from '../shared';
import { BALANCE } from '../balance';
const p=BALANCE.youmu;
export const youmu: CharacterDefinition = {
  id:'youmu',name:'魂魄妖梦',short:'妖梦',glyph:'斩',color:'#a4c7a2',active:'现世斩',passive:'白楼剑',cooldown:p.cooldown,cleanseCooldown:p.cleanseCooldown,
  activeText:'沿一条公共路线冲刺两格，可将途经的一枚敌棋击退两格，随后照常用骰子行动。',
  passiveText:'骰子移动前，可清除该棋一项负面；本次少走一格，最低一格。成功净化后冷却两回合。',
  actions(v) { return publicOwn(v).filter(c=>c.progress<LAST_PUBLIC).flatMap(caster=>branchesFor(caster,Math.min(p.dash,LAST_PUBLIC-caster.progress)).flatMap(branch=>{
    const path=v.path(caster,p.dash,branch),targets=v.enemies.filter(t=>path.includes(v.node(t)));
    return [undefined,...targets].map(target=>skill({skill:'youmu.dash',caster:caster.id,branch,...(target?{targets:[target.id]}:{})},`${v.label(caster.id)} → ${path.at(-1)}${target?` · ${v.label(target.id)}`:''}`,[caster.id,...(target?[target.id]:[])],[v.node(caster),...path],path.length+(target?(target.shield!==null?.2:Math.min(p.knockback,target.progress)):0)));
  })); },
  cast(_v,c) { return [{type:'displace',piece:c.caster!,steps:p.dash,branch:c.branch!},...(c.targets??[]).map(piece=>({type:'displace',piece,steps:-p.knockback,hostile:true}))]; }
};
