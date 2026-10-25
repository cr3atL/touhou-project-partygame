import { MAP, NODES, nodeAt, progressAt } from '../../../packages/core/map';
import type { Action, GameState, Piece } from '../../../packages/core/types';

export type Point = { x: number; y: number };
export const SIZE = MAP.coordinate_system;
export function nodePoint(id: string): Point {
  if (id.startsWith('done-')) return NODES[`P${Number(id.slice(5)) + 1}-F6`];
  return NODES[id];
}
export function piecePoint(p: Piece): Point {
  if (p.progress < 0) {
    const [x,y] = MAP.presentation.docks[p.owner].center;
    return { x: x + (p.index % 2 ? 33 : -33), y: y + (p.index > 1 ? 57 : -5) };
  }
  return nodePoint(nodeAt(p));
}
export function pieceGroups(s: GameState): Map<string, Piece[]> {
  const groups = new Map<string, Piece[]>();
  for (const p of s.pieces.filter(p => p.progress >= 0 && p.progress < 53)) {
    const id = nodeAt(p); groups.set(id, [...(groups.get(id) ?? []), p]);
  }
  return groups;
}
export function displayPoint(p: Piece, groups: Map<string, Piece[]>): Point {
  const at = piecePoint(p), group = groups.get(nodeAt(p)) ?? [];
  const i = group.findIndex(q => q.id === p.id);
  return group.length === 2 ? { x: at.x + (i ? 17 : -17), y: at.y + (i ? 9 : -7) } : at;
}
export function actionsForPiece(actions: Action[], id: string): Action[] { return actions.filter(a => a.pieces[0] === id); }
export function destinationActions(actions: Action[], node: string): Action[] { return actions.filter(a => a.nodes.at(-1) === node); }

/** Every intermediate point uses the same data as tiles and hit areas. */
export function travelPoints(before: Piece, after: Piece): Point[] {
  if (before.progress === after.progress && nodeAt(before) === nodeAt(after)) return [piecePoint(after)];
  if (before.progress < 0 && after.progress >= 0) {
    const [x,y] = MAP.presentation.docks[after.owner].exit;
    return [piecePoint(before), {x,y}, NODES[MAP.seats[after.owner].start], piecePoint(after)];
  }
  if (after.progress < 0) return [piecePoint(before), piecePoint(after)];
  if (Math.abs(after.progress - before.progress) > 12) return [piecePoint(before), piecePoint(after)];
  const direction = after.progress > before.progress ? 1 : -1;
  const route = direction > 0 ? after : before;
  const result: Point[] = [piecePoint(before)];
  for (let p = before.progress + direction; direction > 0 ? p <= after.progress : p >= after.progress; p += direction) {
    result.push(nodePoint(nodeAt(route, p)));
  }
  return result;
}

export function eventTravelPoints(previous:GameState, current:GameState, piece:Piece): Point[] {
  const before=previous.pieces.find(p=>p.id===piece.id)!;
  const events=current.events.filter(e=>e.id>previous.eventId&&e.pieces.includes(piece.id)&&e.from&&e.to&&['move','return'].includes(e.type));
  if(!events.length) return travelPoints(before,piece);
  let cursor={...before}; const points:Point[]=[piecePoint(before)];
  for(const e of events) {
    const to=e.to!;
    const progress=to.startsWith('done')?53:to.startsWith('airport')?-1:to.startsWith('P')?47+Number(to.split('-F')[1]):progressAt(piece.owner,to);
    const branch=to.startsWith('R')?'spirit':/^G(29|30|31|32|33)$/.test(to)?'ground':piece.branch??cursor.branch;
    const next:Piece={...cursor,progress,branch};
    // Boundary exchange and returning are magical relocations, rather than extra roads.
    points.push(...(e.text.includes('间隙')?[piecePoint(next)]:travelPoints(cursor,next).slice(1)));
    cursor=next;
  }
  return points;
}
