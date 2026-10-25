import { LAST_PUBLIC, FINISH } from '../../../packages/core/constants';
import { MAP, NODES, nodeAt, progressAt } from '../../../packages/core/map';
import type { Action, GameState, Piece } from '../../../packages/core/types';

export type Point = { x: number; y: number };
export const SIZE = MAP.coordinate_system;
/** Mobile framing excludes the desktop illustration's outer margins. */
export const PLAY_AREA = {
  x: Math.min(...MAP.nodes.map(n=>n.tileX))-100,
  y: Math.min(...MAP.nodes.map(n=>n.tileY))-120,
  width: Math.max(...MAP.nodes.map(n=>n.tileX))-Math.min(...MAP.nodes.map(n=>n.tileX))+200,
  height: Math.max(...MAP.nodes.map(n=>n.tileY))-Math.min(...MAP.nodes.map(n=>n.tileY))+210,
};
export function nodePoint(id: string): Point {
  if (id.startsWith('done-')) return NODES[`P${Number(id.slice(5)) + 1}-F6`];
  return NODES[id];
}
export function tilePolygon(id:string, scale=1):string | undefined {
  const node=NODES[id];
  return node?.polygon?.split(' ').map(pair=>{
    const [x,y]=pair.split(',').map(Number);
    return `${node.tileX!+(x-node.tileX!)*scale},${node.tileY!+(y-node.tileY!)*scale}`;
  }).join(' ');
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
  for (const p of s.pieces.filter(p => p.progress >= 0 && p.progress < FINISH)) {
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
  if(before.progress<0&&after.progress===0)return [piecePoint(before),piecePoint(after)];
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
  const events=current.events.filter(e=>e.id>previous.eventId&&e.pieces.includes(piece.id)&&e.from&&e.to&&['move','return','bounce','crossing'].includes(e.type));
  if(!events.length) return travelPoints(before,piece);
  let cursor={...before}; const points:Point[]=[piecePoint(before)];
  for(const e of events) {
    const to=e.to!;
    if(e.type==='crossing'){points.push(nodePoint(to));continue;}
    const progress=to.startsWith('launch-')?0:to.startsWith('done')?FINISH:to.startsWith('airport')?-1:to.startsWith('P')?LAST_PUBLIC+Number(to.split('-F')[1]):progressAt(piece.owner,to);
    const branch='ground' as const;
    const next:Piece={...cursor,progress,branch};
    // Jumps and flight use direct paths; regular dice moves follow the road.
    points.push(...(e.text.includes('间隙')||e.text.includes('同色跳格')||e.text.includes('航线飞行')?[piecePoint(next)]:travelPoints(cursor,next).slice(1)));
    cursor=next;
  }
  return points;
}
