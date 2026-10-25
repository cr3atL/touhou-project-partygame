import type { CharacterDefinition } from '../../core/types';
import { groups, skill, targetsLabel } from '../shared';
import { BALANCE } from '../balance';
const p = BALANCE.reimu;
export const reimu: CharacterDefinition = {
  id: 'reimu', name: '博丽灵梦', short: '灵梦', glyph: '巫', color: '#dc6d83', active: '二重结界', passive: '浮游', cooldown: p.cooldown,
  activeText: '选择最多两枚己方在场棋子，清除负面并获得一次保护，持续至自己下回合开始。',
  passiveText: '每个自己的自然回合一次，可忽略骰子落点的一次地形后退。',
  actions(v) { return groups(v.own.filter(p => p.progress >= 0 && p.progress < 53), p.targets).map(targets => skill({ skill: 'reimu.barrier', targets: targets.map(p => p.id) }, targetsLabel(v, targets), targets.map(p => p.id), targets.map(v.node), targets.reduce((n,p) => n + (p.mark ? 9 : v.enemies.some(e => v.distance(v.node(e), v.node(p)) <= 6) ? 4 : .2), 0))); },
  cast(_v, c) { return [{ type: 'cleanse', ids: c.targets! }, { type: 'shield', ids: c.targets! }]; },
  terrainRetreat(v, piece, steps) {
    if (v.state.flags.used.float) return null;
    return [{ type: 'choice', kind: 'float', prompt: '浮游 · 忽略这次地形后退？', options: [
      { id: 'float', label: '浮游', pieces: [piece.id], effects: [{ type: 'flag', key: 'float' }], score: -steps },
      { id: 'retreat', label: `后退 ${-steps} 格`, pieces: [piece.id], effects: [{ type: 'displace', piece: piece.id, steps }], score: steps }
    ] }];
  }
};
