import { CHARACTERS } from '../content';
import { getActions, reduceGame } from '../core/engine';
import { branchesFor, nodeAt } from '../core/map';
import type { Action, GameState, Piece } from '../core/types';

/** Frozen v0.3 greedy policy for paired comparisons, never used by live games. */
export function legacyBotAction(s: GameState): Action {
  const options=getActions(s,CHARACTERS);
  if(!options.length)throw new Error('当前局面没有可用操作');
  return options.reduce((best,a)=>a.score>best.score?a:best);
}
const publicPiece=(p:Piece)=>p.progress>=0&&p.progress<=47;
function progressValue(p:Piece):number {
  if(p.progress<0)return -1;
  if(p.progress===53)return 130;
  if(p.progress>=48)return 80+(p.progress-48)*8;
  // Approaching the private lane makes the next few rolls much more valuable.
  return .5*p.progress+.01*p.progress*p.progress+.14*Math.max(0,p.progress-35)**2;
}
/** Each opponent chooses a single die action; multiple pieces matching one die are not independent attacks. */
function landingMasks(s:GameState,owner:number):Map<string,number> {
  const result=new Map<string,number>(),player=s.players[owner],definition=CHARACTERS[player.character];
  const own=s.pieces.filter(p=>p.owner===owner&&publicPiece(p));
  const nextTurn=player.turns+(s.current===owner?0:1),activeReady=nextTurn>=player.activeAt;
  for(const piece of own)for(let die=1;die<=6;die++) {
    const bases=[die];
    if(player.character==='remilia'&&activeReady)bases.push(7-die);
    if(definition.splitThreshold&&die>=definition.splitThreshold&&own.some(p=>p.id!==piece.id&&p.progress<47))bases.push(die-1);
    for(const base of bases) {
      const steps=[Math.max(1,base-(piece.mark?.slow??0))];
      if(piece.mark&&definition.cleanseCooldown&&nextTurn>=player.passiveAt)steps.push(Math.max(1,base-1));
      for(const step of steps)for(const dash of (player.character==='youmu'&&activeReady?[0,2]:[0])) {
        const end=piece.progress+step+dash;if(end>47)continue;
        for(const branch of branchesFor(piece,step+dash)) {
          const node=nodeAt(piece,end,branch);result.set(node,(result.get(node)??0)|(1<<(die-1)));
        }
      }
    }
  }
  return result;
}
const bitCount=(n:number)=>{let count=0;while(n){n&=n-1;count++;}return count;};
type ThreatCache=Map<string,Map<string,number>>;
function threats(s:GameState,owner:number,cache:ThreatCache):Map<string,number> {
  const player=s.players[owner],key=JSON.stringify([owner,player.character,player.turns,player.activeAt,player.passiveAt,s.current===owner,s.pieces.filter(p=>p.owner===owner).map(p=>[p.progress,p.branch,!!p.mark])]);
  let masks=cache.get(key);if(!masks){masks=landingMasks(s,owner);cache.set(key,masks);}return masks;
}
export function returnRisk(s:GameState,p:Piece,cache:ThreatCache=new Map()):number {
  if(!publicPiece(p))return 0;
  // A shield absorbs one encounter, so estimate P(at least two attacks) instead of P(any attack).
  let distribution=[1,0,0,0];
  for(const player of s.players.filter(q=>q.id!==p.owner&&!s.rankings.includes(q.id))) {
    const chance=bitCount(threats(s,player.id,cache).get(nodeAt(p))??0)/6;
    distribution=distribution.map((value,i)=>value*(1-chance)+(i?distribution[i-1]*chance:0));
  }
  return p.shield===null?1-distribution[0]:1-distribution[0]-distribution[1];
}
function boardValue(s:GameState,owner:number,cache:ThreatCache):number {
  const own=s.pieces.filter(p=>p.owner===owner);
  let value=own.reduce((sum,p)=>sum+progressValue(p)-returnRisk(s,p,cache)*(progressValue(p)+5)*1.15-(p.mark?1:0),0);
  value+=Math.max(0,...own.filter(publicPiece).map(p=>p.progress))*.2;
  // Attacks have value, but preserving a mature piece and reaching safety dominate low-progress captures.
  value-=s.pieces.filter(p=>p.owner!==owner).reduce((sum,p)=>sum+progressValue(p)*.12,0);
  if(s.rankings.includes(owner))value+=200-s.rankings.indexOf(owner)*15;
  return value;
}
export function botAction(s:GameState):Action {
  const options=getActions(s,CHARACTERS);
  if(!options.length)throw new Error('当前局面没有可用操作');
  if(options.length===1)return options[0];
  const owner=s.current,cache:ThreatCache=new Map();
  // Search copies contain no historical log: decisions use only the current public position.
  const compact={...s,history:[],events:[]} as GameState;
  const apply=(state:GameState,a:Action)=>reduceGame(state,a.command,CHARACTERS,()=>{throw new Error('式神不能预知随机骰子');});
  function resolvedValue(state:GameState,depth=0):number {
    if(state.choice&&state.current===owner&&depth<8)return Math.max(...getActions(state,CHARACTERS).map(a=>resolvedValue(apply(state,a),depth+1)));
    return boardValue(state,owner,cache);
  }
  function value(a:Action):number {
    if(a.kind==='roll')return 0;
    const next=apply(compact,a);
    let score=resolvedValue(next);
    if(a.command.type==='cast') {
      // A regular active preserves the die action: compare complete outcomes on both sides.
      if(next.phase==='action'&&next.current===owner&&!next.choice) {
        const follow=getActions(next,CHARACTERS).filter(a=>a.kind==='move'||a.kind==='pass');
        if(follow.length)score=Math.max(...follow.map(a=>resolvedValue(apply(next,a))));
      }
      score-=1.5; // Retain cooldown when a cast produces no useful outcome.
    }
    if(a.command.type==='move') {
      const id=a.command.piece,piece=s.pieces.find(p=>p.id===id)!;
      const publicCount=s.pieces.filter(p=>p.owner===owner&&publicPiece(p)).length;
      if(piece.progress<0&&publicCount)score-=2+publicCount*.75;
    }
    return score;
  }
  let best=options[0],bestValue=-Infinity;
  for(const a of options){const score=value(a);if(score>bestValue+1e-9){best=a;bestValue=score;}}
  return best;
}
