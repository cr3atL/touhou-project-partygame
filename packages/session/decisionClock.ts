import type { GameState } from '../core/types';

export const TURN_MS = 60_000;
export interface DecisionTime { turn:number; remainingMs:number; at:number; paused:boolean; blockedUntil:number; takeover:boolean }
export function remainingTime(time:DecisionTime, now:number):number {
  return Math.max(0,time.remainingMs-(time.paused?0:Math.max(0,now-Math.max(time.at,time.blockedUntil))));
}
/** The room owns this clock. No client pause/animation acknowledgement can extend it. */
export class DecisionClock {
  value:DecisionTime;
  constructor(turn:number,now=Date.now(),saved?:DecisionTime){
    this.value=saved&&saved.turn===turn&&Number.isFinite(saved.remainingMs)&&saved.remainingMs>=0&&saved.remainingMs<=TURN_MS
      ? {...saved,at:now,blockedUntil:now,paused:false}
      : {turn,remainingMs:TURN_MS,at:now,paused:false,blockedUntil:now,takeover:false};
  }
  update(game:GameState,now=Date.now(),paused=false):DecisionTime {
    if(this.value.turn!==game.turn)this.value={turn:game.turn,remainingMs:TURN_MS,at:now,paused:false,blockedUntil:now,takeover:false};
    else this.value={...this.value,remainingMs:remainingTime(this.value,now),at:now};
    this.value.paused=paused||game.phase==='over';
    if(!this.value.paused&&this.value.remainingMs===0)this.value.takeover=true;
    return {...this.value};
  }
  block(game:GameState,milliseconds:number,now=Date.now()){
    this.update(game,now);
    this.value.blockedUntil=now+Math.max(0,Math.min(8_000,milliseconds));
  }
}

/** Mirrors the maximum normal playback; reduced motion may finish sooner. */
export function presentationDuration(before:GameState,after:GameState):number {
  const events=after.events.filter(e=>e.id>before.eventId),skill=events.find(e=>e.type==='skill');
  if(skill){
    const command=after.history.at(-1)?.command;
    const caster=command?.type==='cast'?command.caster:undefined;
    const ids=new Set([...(command?.type==='cast'?command.targets??[]:[]),...skill.pieces.filter(id=>id!==caster),...events.filter(e=>['move','return','shield','mark','cleanse'].includes(e.type)).flatMap(e=>e.pieces).filter(id=>id!==caster)]);
    const count=[...ids].filter(id=>{const p=before.pieces.find(p=>p.id===id);return p&&p.progress>=0;}).length||1;
    return 1500+Math.max(920,580+(count-1)*600+900)+280;
  }
  const moving=events.some(e=>['move','return','bounce'].includes(e.type));
  const die=events.some(e=>e.type==='dice');
  return (die?775:0)+(moving?920:die?260:180);
}
