import { LAST_PUBLIC } from '../../core/constants';
import type { CharacterDefinition } from '../../core/types';
import { groups, publicOwn, skill, targetsLabel } from '../shared';
import { branchesFor } from '../../core/map';
import { BALANCE } from '../balance';
const p = BALANCE.marisa;
export const marisa: CharacterDefinition = {
  id: 'marisa', name: '雾雨魔理沙', short: '魔理沙', glyph: '星', color: '#e8c66c', active: '极限火花', passive: '高速飞行', cooldown: p.cooldown, range: p.range,
  activeText: '沿前方六格的一条公共路线，选择最多两枚敌棋，各击退两格。',
  passiveText: '首次自然骰为5或6，首次行动完成公共道路移动后，可额外前进一格。',
  actions(v) { return publicOwn(v).flatMap(caster => branchesFor(caster,Math.min(p.range,LAST_PUBLIC-caster.progress)).flatMap(branch => {
    const path = v.path(caster,p.range,branch);
    return groups(v.enemies.filter(e => path.includes(v.node(e))),p.targets).map(targets => skill({ skill: 'marisa.spark', caster: caster.id, targets: targets.map(p=>p.id), branch }, `${v.label(caster.id)} → ${targetsLabel(v,targets)}`, [caster.id,...targets.map(p=>p.id)], [v.node(caster),...path], targets.reduce((n,t)=>n+(t.shield !== null ? .4 : Math.min(t.progress,p.knockback)+.5),0), '前方射线'));
  })); },
  cast(_v,c) { return c.targets!.map(piece=>({type:'displace',piece,steps:-p.knockback,hostile:true})); },
  afterDice(_v,r) { return r.first && r.natural >= 5 && r.fromPublic && r.toPublic ? [{type:'offerAdvance',piece:r.piece,steps:p.advance,prompt:'高速飞行 · 前进一格？',skip:true}] : []; }
};
