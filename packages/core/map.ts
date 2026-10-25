import mapData from '../../output/design/vector-map-v0.3/幻想乡巡游-矢量路线审查-v0.3.json';
import type { Branch, GameState, Piece } from './types';
export interface MapNode { id: string; x: number; y: number; layer: string; region?: string; name?: string; terrain?: string; route_index?: number }
export const MAP = mapData;
export const NODES = Object.fromEntries(mapData.nodes.map(n => [n.id, n])) as Record<string, MapNode>;
export const STARTS = [0, 12, 24, 36];
export const COLORS = ['#e05c76', '#5ba9de', '#62b397', '#dfb554'];
export const ground = (n: number) => `G${String((n + 48) % 48).padStart(2, '0')}`;
export function nodeAt(piece: Piece, progress = piece.progress, branch = piece.branch): string {
  if (progress < 0) return `airport-${piece.owner}`;
  if (progress >= 53) return `done-${piece.owner}`;
  if (progress >= 48) return `P${piece.owner + 1}-F${progress - 47}`;
  const g = (STARTS[piece.owner] + progress) % 48;
  return branch === 'spirit' && g >= 29 && g <= 33 ? `R${g}` : ground(g);
}
export function progressAt(owner: number, node: string): number {
  if (!/^[GR]\d\d$/.test(node)) return -1;
  return (Number(node.slice(1)) - STARTS[owner] + 48) % 48;
}
export function branchAt(piece: Piece, progress: number, destination?: string): Branch | null {
  const fork = (28 - STARTS[piece.owner] + 48) % 48;
  if (progress <= fork) return null;
  if (destination?.startsWith('R')) return 'spirit';
  if (destination && /^G(29|30|31|32|33)$/.test(destination)) return 'ground';
  return piece.branch ?? 'ground';
}
const adjacency = new Map<string, string[]>();
for (const edge of mapData.edges.filter(e => e.kind !== 'finish')) {
  adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
  adjacency.set(edge.target, [...(adjacency.get(edge.target) ?? []), edge.source]);
}
export function distance(a: string, b: string, owner?: number): number {
  if (a === b) return 0;
  const seen = new Set([a]); const queue: [string, number][] = [[a, 0]];
  for (let i = 0; i < queue.length; i++) {
    const [at, d] = queue[i];
    for (const next of adjacency.get(at) ?? []) {
      if (owner !== undefined && Math.abs(progressAt(owner, at) - progressAt(owner, next)) !== 1) continue;
      if (next === b) return d + 1;
      if (!seen.has(next)) { seen.add(next); queue.push([next, d + 1]); }
    }
  }
  return Infinity;
}
export function forward(node: string, steps: number, branch: Branch): string[] {
  const result: string[] = []; let current = node;
  for (let i = 0; i < steps; i++) {
    current = current === 'G28' && branch === 'spirit' ? 'R29'
      : current === 'R33' ? 'G34' : current.startsWith('R') ? `R${Number(current.slice(1)) + 1}` : ground(Number(current.slice(1)) + 1);
    result.push(current);
  }
  return result;
}
export function branchesFor(piece: Piece, steps: number): Branch[] {
  const fork = (28 - STARTS[piece.owner] + 48) % 48;
  return piece.progress <= fork && piece.progress + steps > fork ? ['ground', 'spirit'] : [piece.branch ?? 'ground'];
}
export function empty(state: GameState, node: string): boolean { return !state.pieces.some(p => p.progress >= 0 && p.progress < 53 && nodeAt(p) === node); }
export function terrain(_state: GameState, node: string): string {
  return NODES[node]?.terrain ?? 'ordinary';
}
