import { FINISH } from '../../core/constants';
import type { CharacterDefinition } from '../../core/types';
import { groups, skill, targetsLabel } from '../shared';
import { BALANCE } from '../balance';
const p = BALANCE.reimu;
export const reimu: CharacterDefinition = {
  id: 'reimu', name: '博丽灵梦', short: '灵梦', glyph: '巫', color: '#dc6d83', active: '二重结界', passive: '浮游', cooldown: p.cooldown,
  activeText: '选择最多两枚己方在场棋子，清除负面并获得一次保护，持续至自己下回合开始。',
  passiveText: '每回合一次，同色跳格及衔接航线结算后，可额外前进一格；不撞击、不触发加速、不进入终点道。单独飞行不触发。',
  actions(v) { return groups(v.own.filter(p => p.progress >= 0 && p.progress < FINISH), p.targets).map(targets => skill({ skill: 'reimu.barrier', targets: targets.map(p => p.id) }, targetsLabel(v, targets), targets.map(p => p.id), targets.map(v.node), targets.reduce((n,p) => n + (p.mark ? 9 : v.enemies.some(e => v.distance(v.node(e), v.node(p)) <= 6) ? 4 : .2), 0))); },
  cast(_v, c) { return [{ type: 'cleanse', ids: c.targets! }, { type: 'shield', ids: c.targets! }]; },
};
