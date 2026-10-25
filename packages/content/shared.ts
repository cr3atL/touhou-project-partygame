import { ROAD_START, LAST_PUBLIC } from '../core/constants';
import { action, type Action, type CastCommand, type Piece, type RuleView } from '../core/types';
export const publicOwn = (v: RuleView) => v.own.filter(p => p.progress >= ROAD_START && p.progress <= LAST_PUBLIC);
export function groups<T>(items: T[], max = 2): T[][] {
  const out: T[][] = [];
  function visit(start: number, chosen: T[]) {
    if (chosen.length) out.push(chosen);
    if (chosen.length >= max) return;
    for (let i = start; i < items.length; i++) visit(i + 1, [...chosen, items[i]]);
  }
  visit(0, []); return out;
}
export function skill(command: Omit<CastCommand, 'type'>, label: string, pieces: string[], nodes: string[], score: number, detail?: string): Action {
  return action({ type: 'cast', ...command }, label, pieces, nodes, score, detail);
}
export const targetsLabel = (v: RuleView, targets: Piece[]) => targets.map(p => v.label(p.id)).join(' ＋ ');
