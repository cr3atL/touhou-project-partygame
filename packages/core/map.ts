import mapData from './data/board.json';
import type { Branch, GameState, Piece } from './types';
import { TRACK_LENGTH, LAST_PUBLIC, ROAD_START, HOME_START, FINISH } from './constants';
export { TRACK_LENGTH, LAST_PUBLIC, ROAD_START, HOME_START, FINISH } from './constants';
export interface MapNode { id: string; x: number; y: number; layer: string; color?: number; shape?:string; diagonal?:string; tileX?:number; tileY?:number; polygon?:string; name?: string; terrain?: string; route_index?: number }
export const MAP = mapData;
export const NODES = Object.fromEntries(mapData.nodes.map(n => [n.id, n])) as Record<string, MapNode>;
export const STARTS = [0, 13, 26, 39];
export const COLORS = ['#df6073', '#e1b447', '#5b9ed4', '#63ad86'];
export const ground = (n: number) => `G${String((n + TRACK_LENGTH) % TRACK_LENGTH).padStart(2, '0')}`;
export function nodeAt(piece: Piece, progress = piece.progress, _branch = piece.branch): string {
  if (progress < 0) return `airport-${piece.owner}`;
  if (progress === 0) return `launch-${piece.owner}`;
  if (progress >= FINISH) return `done-${piece.owner}`;
  if (progress >= HOME_START) return `P${piece.owner + 1}-F${progress - LAST_PUBLIC}`;
  return ground(STARTS[piece.owner] + progress-ROAD_START);
}
export function progressAt(owner: number, node: string): number {
  return /^G\d\d$/.test(node) ? (Number(node.slice(1)) - STARTS[owner] + TRACK_LENGTH) % TRACK_LENGTH+ROAD_START : -1;
}
export function branchAt(_piece: Piece, _progress: number): Branch | null { return 'ground'; }
/** Skill range follows the public road, never a shortcut or a private lane. */
export function distance(a: string, b: string, owner?: number): number {
  if(a === b) return 0;
  if(!/^G\d\d$/.test(a) || !/^G\d\d$/.test(b)) return Infinity;
  if(owner !== undefined) return Math.abs(progressAt(owner,a)-progressAt(owner,b));
  const d=Math.abs(Number(a.slice(1))-Number(b.slice(1)));
  return Math.min(d,TRACK_LENGTH-d);
}
export function forward(node: string, steps: number, _branch: Branch): string[] {
  return Array.from({length:steps},(_,i)=>ground(Number(node.slice(1))+i+1));
}
export function branchesFor(_piece: Piece, _steps: number): Branch[] { return ['ground']; }
export function empty(state: GameState, node: string): boolean { return !state.pieces.some(p => p.progress >= 0 && p.progress < FINISH && nodeAt(p) === node); }

export function diceEnd(progress:number, steps:number):number {
  const end=progress+steps;
  return end>FINISH ? FINISH-(end-FINISH) : end;
}
export interface Acceleration { from:number; to:number; kind:'jump'|'flight'; cross?:string }
/** A finite sequence: jump, connecting flight, final jump; a lone flight may also jump once. */
export function accelerations(piece:Piece):Acceleration[] {
  let at=piece.progress;
  if(at<ROAD_START || at>LAST_PUBLIC) return [];
  const result:Acceleration[]=[];
  const jump=()=>{
    if(NODES[nodeAt(piece,at)]?.color!==piece.owner || at+4>LAST_PUBLIC)return;
    result.push({from:at,to:at+4,kind:'jump'});at+=4;
  };
  const flight=MAP.seats[piece.owner].flight,entrance=progressAt(piece.owner,flight.from),end=progressAt(piece.owner,flight.to);
  if(at!==entrance)jump();
  if(at===entrance){result.push({from:at,to:end,kind:'flight',cross:flight.cross});at=end;jump();}
  return result;
}
