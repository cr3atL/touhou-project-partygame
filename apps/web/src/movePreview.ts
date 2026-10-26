import { CHARACTERS } from '../../../packages/content';
import { getActions, reduceGame } from '../../../packages/core/engine';
import { FINISH } from '../../../packages/core/constants';
import type { Action, GameState } from '../../../packages/core/types';
import { eventTravelPoints, nodePoint, piecePoint, type Point } from './boardModel';

export interface MovePreview {
  paths: { piece: string; points: Point[]; end: Point }[];
  impacts: { piece: string; at: Point; kind: string }[];
  summary: string;
  after: GameState;
}
/** Resolve a copy with the authoritative reducer; stop at any player choice. Never draw random values. */
export function previewAction(game: GameState, action: Action | null): MovePreview | null {
  if(!action || !['move','choose','cast'].includes(action.kind))return null;
  if(!getActions(game,CHARACTERS).some(a=>a.id===action.id))return null;
  const after=reduceGame(game,action.command,CHARACTERS,()=>{throw new Error('预览不能掷骰');});
  const events=after.events.filter(e=>e.id>game.eventId);
  const moving=new Set(events.filter(e=>['move','return','bounce'].includes(e.type)).flatMap(e=>e.pieces));
  const paths=[...moving].map(id=>{const p=after.pieces.find(p=>p.id===id)!;return {piece:id,points:eventTravelPoints(game,after,p),end:piecePoint(p)};});
  const positions=new Map(game.pieces.map(p=>[p.id,piecePoint(p)]));
  const impacts:MovePreview['impacts']=[];
  for(const event of events){
    for(const id of event.pieces){
      if(['return','shield','mutual','cleanse','mark'].includes(event.type))impacts.push({piece:id,at:(event.from&&nodePoint(event.from))||positions.get(id)!,kind:event.type});
      if(event.to&&['move','return','bounce','crossing'].includes(event.type))positions.set(id,nodePoint(event.to)||piecePoint(after.pieces.find(p=>p.id===id)!));
    }
  }
  const destroyed=events.filter(e=>e.type==='return').flatMap(e=>e.pieces).filter(id=>game.pieces.find(p=>p.id===id)!.owner!==game.current).length;
  const summary=[destroyed?`撞毁 ${destroyed} 枚`:'',events.some(e=>e.type==='mutual')?'同归于尽':'',events.some(e=>e.type==='shield')?'触发保护':'',events.some(e=>e.type==='bounce')?'终点折返':'',paths.some(p=>after.pieces.find(q=>q.id===p.piece)!.progress===FINISH)?'抵达终点':''].filter(Boolean).join(' · ');
  return {paths,impacts,summary,after};
}
