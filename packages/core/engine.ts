import { action, VERSIONS, type Action, type Branch, type CharacterId, type ChoiceOption, type Command, type DiceResult, type Effect, type GameState, type MoveCommand, type Piece, type Random, type Registry, type RuleView } from './types';
import { branchAt, branchesFor, distance, nodeAt, terrain } from './map';

export const freshFlags = (): GameState['flags'] => ({ first:true, active:false, extra:false, used:{}, moved:[], targeted:[], locked:[], rewritten:false });
const isPublic = (p: Piece) => p.progress >= 0 && p.progress <= 47;
export function pieceLabel(s: GameState, id: string, registry: Registry): string {
  const p=s.pieces.find(p=>p.id===id)!;
  return `${registry[s.players[p.owner].character].short}${'①②③④'[p.index]}`;
}
export function createGame(roster: { name: string; character: CharacterId; bot?: boolean }[], registry: Registry): GameState {
  if(roster.length!==4 || roster.some(p=>!registry[p.character]) || new Set(roster.map(p=>p.character)).size!==4) throw new Error('需要四名不同角色');
  const s:GameState={versions:{...VERSIONS},revision:0,players:roster.map((p,id)=>({id,name:p.name||`玩家 ${id+1}`,character:p.character,bot:!!p.bot,turns:0,activeAt:0,passiveAt:0,bufferUsed:false})),
    pieces:roster.flatMap((_,owner)=>Array.from({length:4},(_,index)=>({id:`p${owner}-${index}`,owner,index,progress:-1,branch:null,shield:null,mark:null}))),
    current:0,turn:1,round:1,phase:'resolving',dice:null,queue:[{type:'begin'}],choice:null,winner:null,rankings:[],flags:freshFlags(),events:[],eventId:0,returns:[0,0,0,0],history:[]};
  settle(s,registry);return s;
}
function emit(s:GameState,type:string,text:string,pieces:string[]=[],from?:string,to?:string) {
  s.events.push({id:++s.eventId,turn:s.turn,type,text,pieces,from,to});
  if(s.events.length>160)s.events.splice(0,s.events.length-160);
}
function prepend(s:GameState,effects:Effect[]) {s.queue.unshift(...effects);}
function choose(s:GameState,kind:string,prompt:string,options:ChoiceOption[],skip=false) {
  if(!options.length)return;
  if(skip)options.push({id:'skip',label:'不发动',effects:[],score:-1});
  s.phase='resolving';s.choice={id:s.eventId+s.revision+1,kind,prompt,options};
}
function forwardOptions(s:GameState,p:Piece,steps:number,registry:Registry):ChoiceOption[] {
  if(!isPublic(p))return [];
  const n=Math.min(steps,47-p.progress);if(n<=0)return [];
  return branchesFor(p,n).map(branch=>({id:`${p.id}-${branch}`,label:`${pieceLabel(s,p.id,registry)} → ${nodeAt(p,p.progress+n,branch)}`,pieces:[p.id],nodes:[nodeAt(p,p.progress+n,branch)],effects:[{type:'displace',piece:p.id,steps:n,branch}],score:n}));
}
export function advanceOptions(s:GameState,registry:Registry,exclude?:string,steps=1):ChoiceOption[] {
  return s.pieces.filter(p=>p.owner===s.current&&p.id!==exclude).flatMap(p=>forwardOptions(s,p,steps,registry));
}
function moveScore(s:GameState,p:Piece,end:number,branch:Branch,steps:number) {
  const node=nodeAt(p,end,branch);
  const enemies=s.pieces.filter(e=>e.owner!==s.current&&isPublic(e)&&nodeAt(e)===node&&!s.flags.targeted.includes(e.id));
  const hit=Math.max(0,...enemies.map(e=>e.shield!==null?1:e.progress*.35+4));
  const t=terrain(s,node), groundValue=t==='wind'?2:t==='mist'?-1:t==='obstacle'?-2:0;
  return steps+groundValue+hit+(end===53?80:p.progress*.025);
}
export function movementOptions(s:GameState,steps:number,registry:Registry,publicOnly=false):ChoiceOption[] {
  return s.pieces.filter(p=>p.owner===s.current&&p.progress>=0&&p.progress<53&&!s.flags.locked.includes(p.id)).flatMap(p=>{
    const actual=Math.max(1,steps-(p.mark?.slow??0));
    if(p.progress+actual>(publicOnly?47:53))return [];
    return branchesFor(p,actual).map(branch=>({id:`${p.id}-${branch}`,label:`${pieceLabel(s,p.id,registry)} → ${nodeAt(p,p.progress+actual,branch)}`,effects:[{type:'diceMove',piece:p.id,steps:actual,branch}],pieces:[p.id],nodes:[nodeAt(p,p.progress+actual,branch)],score:moveScore(s,p,p.progress+actual,branch,actual)}));
  });
}
export function view(s:GameState,registry:Registry,owner=s.current):RuleView {
  return {state:s,player:s.players[owner],own:s.pieces.filter(p=>p.owner===owner),enemies:s.pieces.filter(p=>p.owner!==owner&&isPublic(p)),node:nodeAt,distance,at:id=>s.pieces.find(p=>p.id===id)!,label:id=>pieceLabel(s,id,registry),
    path:(p,steps,branch)=>Array.from({length:Math.max(0,Math.min(steps,47-p.progress))},(_,i)=>nodeAt(p,p.progress+i+1,branch)),
    moves:(steps,publicOnly)=>movementOptions(s,steps,registry,publicOnly),optionsAdvance:(exclude,steps)=>advanceOptions(s,registry,exclude,steps)};
}
function effectiveSteps(s:GameState,p:Piece,command:MoveCommand):number {
  let steps=s.dice!.value-(command.splitPiece?1:0);
  if(command.cleanse)steps=Math.max(1,steps-1);
  else if(p.mark)steps=Math.max(1,steps-p.mark.slow);
  return steps;
}
export function getActions(s:GameState,registry:Registry):Action[] {
  if(s.phase==='over')return [];
  if(s.choice)return s.choice.options.map(o=>action({type:'choose',option:o.id},o.label,o.pieces,o.nodes,o.score??0));
  if(s.phase==='roll')return [action({type:'roll'},'掷骰',[],[],1)];
  if(s.phase!=='action'||!s.dice)return [];
  const v=view(s,registry),character=registry[v.player.character],results:Action[]=[];
  for(const p of v.own.filter(p=>p.progress<53&&!s.flags.locked.includes(p.id))) {
    if(p.progress<0) {
      if(!s.flags.rewritten)results.push(action({type:'move',piece:p.id},`${v.label(p.id)} 出场`,[p.id],[nodeAt(p,0)],3.5+(v.own.every(q=>q.progress<0||q.progress===53)?10:0)));
      continue;
    }
    const splits:Pick<MoveCommand,'splitPiece'|'splitBranch'>[]=[{}];
    if(isPublic(p)&&character.splitThreshold&&s.dice.value>=character.splitThreshold&&!s.flags.used.publicMove) {
      for(const q of v.own.filter(q=>q.id!==p.id&&isPublic(q)&&q.progress<47))for(const splitBranch of branchesFor(q,1))splits.push({splitPiece:q.id,splitBranch});
    }
    for(const split of splits)for(const cleanse of (p.mark&&character.cleanseCooldown&&v.player.turns>=v.player.passiveAt?[false,true]:[false])) {
      const base:MoveCommand={type:'move',piece:p.id,...split,...(cleanse?{cleanse:true}:{})},steps=effectiveSteps(s,p,base),end=p.progress+steps;
      if(end>53||(s.flags.rewritten&&(!isPublic(p)||end>47)))continue;
      for(const branch of branchesFor(p,steps)) {
        const label=`${v.label(p.id)} → ${nodeAt(p,end,branch)}`;
        const detail=[`${steps} 格`,cleanse?'白楼剑净化':'',split.splitPiece?`${v.label(split.splitPiece)} ＋1`:'',branch==='spirit'?'冥界':''].filter(Boolean).join(' · ');
        results.push(action({...base,branch},label,[p.id,...(split.splitPiece?[split.splitPiece]:[])],[nodeAt(p,end,branch)],moveScore(s,p,end,branch,steps)+(split.splitPiece?1.1:0)+(cleanse?1.2:0),detail));
      }
    }
  }
  if(s.flags.first&&!s.flags.active&&v.player.turns>=v.player.activeAt) {
    const baseline=Math.max(0,...results.filter(a=>a.kind==='move').map(a=>a.score));
    results.push(...character.actions(v).map(a=>({...a,score:a.score+baseline})));
  }
  if(!results.some(a=>a.kind==='move'))results.push(action({type:'pass'},'无合法移动，结束行动',[],[],-10));
  return results;
}
export function reduceGame(previous:GameState,command:Command,registry:Registry,random:Random=Math.random):GameState {
  const legal=getActions(previous,registry).find(a=>JSON.stringify(a.command)===JSON.stringify(command));
  if(!legal)throw new Error('操作已过期或不符合当前规则');
  const {history,...snapshot}=previous,s:GameState={...structuredClone(snapshot),history};s.revision++;
  const draws:number[]=[],p=s.players[s.current];
  if(command.type==='choose') {
    const option=s.choice!.options.find(o=>o.id===command.option)!;emit(s,'choice',option.label,option.pieces);s.choice=null;prepend(s,option.effects);
  } else if(command.type==='roll') {
    const n=random();draws.push(n);const value=Math.max(1,Math.min(6,Math.floor(n*6)+1));
    s.dice={value,natural:value,source:'natural',extra:s.flags.first&&value===6};s.phase='action';emit(s,'dice',`${p.name} 掷出 ${value}`);
  } else if(command.type==='cast') {
    const c=registry[p.character];s.flags.active=true;p.activeAt=p.turns+c.cooldown;
    for(const id of command.targets??[])if(s.pieces.find(q=>q.id===id)!.owner!==s.current&&!s.flags.targeted.includes(id))s.flags.targeted.push(id);
    emit(s,'skill',`${p.name} · ${c.active}`,legal.pieces);prepend(s,c.cast(view(s,registry),command));
  } else if(command.type==='move') {
    const piece=s.pieces.find(q=>q.id===command.piece)!,steps=effectiveSteps(s,piece,command),fromPublic=isPublic(piece),spawn=piece.progress<0;
    const result:DiceResult={piece:piece.id,fromPublic,toPublic:!spawn&&piece.progress+steps<=47,first:s.flags.first,natural:s.dice!.natural,steps,spawn};
    if(command.cleanse) {piece.mark=null;p.passiveAt=p.turns+registry[p.character].cleanseCooldown!;emit(s,'cleanse',`${pieceLabel(s,piece.id,registry)} 白楼剑 · 净化，本次少走一格（最低一格）`,[piece.id]);}
    else if(piece.mark)emit(s,'slow',`${pieceLabel(s,piece.id,registry)} 无寿之梦 · 本次 ${steps} 格`,[piece.id]);
    if(fromPublic)s.flags.used.publicMove=true;
    if(command.splitPiece)emit(s,'passive',`四重存在 · 分出一点给 ${pieceLabel(s,command.splitPiece,registry)}`,[piece.id,command.splitPiece]);
    prepend(s,[{type:'diceMove',piece:piece.id,steps,branch:command.branch},{type:'afterDice',result},...(command.splitPiece?[{type:'displace',piece:command.splitPiece,steps:1,branch:command.splitBranch}]:[]),{type:'afterAction'}]);
  } else prepend(s,[{type:'afterAction'}]);
  settle(s,registry);s.history=[...history,{command:structuredClone(command),random:draws}];assertGame(s);return s;
}
function moved(s:GameState,p:Piece,progress:number,branch:Branch|null,registry:Registry,reason:string) {
  const from=nodeAt(p);p.progress=progress;p.branch=branch;const to=nodeAt(p);
  if(!isPublic(p))p.mark=null;
  emit(s,'move',`${pieceLabel(s,p.id,registry)} ${reason} → ${to}`,[p.id],from,to);
  if(progress===53&&!s.rankings.includes(p.owner)&&s.pieces.filter(q=>q.owner===p.owner).every(q=>q.progress===53)) {
    s.rankings.push(p.owner);s.winner=s.rankings[0];s.choice=null;
    emit(s,'place',`${s.players[p.owner].name} 获得第${s.rankings.length}名`);
    if(s.rankings.length===3) {s.phase='over';s.queue=[];emit(s,'over','前三名已决出，巡游结束');}
    else {s.phase='resolving';s.queue=[{type:'next'}];}
  }
}
function block(s:GameState,p:Piece,registry:Registry):boolean {
  if(p.shield===null)return false;
  p.shield=null;emit(s,'shield',`${pieceLabel(s,p.id,registry)} 的保护抵挡了攻击`,[p.id]);return true;
}
function returnPiece(s:GameState,p:Piece,registry:Registry) {
  const from=nodeAt(p);p.progress=-1;p.branch=null;p.mark=null;p.shield=null;s.returns[p.owner]++;
  emit(s,'return',`${pieceLabel(s,p.id,registry)} 返回机场`,[p.id],from,nodeAt(p));
}
function settle(s:GameState,registry:Registry) {
  let count=0;
  while(s.queue.length&&!s.choice&&s.phase!=='over') {
    if(++count>500)throw new Error('效果队列未能收敛');
    const e=s.queue.shift()! as Record<string,any>,player=s.players[s.current],character=registry[player.character];
    const piece=e.piece?s.pieces.find(p=>p.id===e.piece)!:undefined;
    switch(e.type) {
      case 'begin':
        player.turns++;player.bufferUsed=false;s.flags=freshFlags();s.dice=null;
        for(const p of s.pieces.filter(p=>p.owner===s.current))if(p.shield!==null&&p.shield<=player.turns)p.shield=null;
        emit(s,'turn',`第 ${s.round} 轮 · ${player.name}`);s.phase='roll';break;
      case 'flag':s.flags.used[e.key]=true;break;
      case 'lockDice':s.flags.locked.push(e.piece);emit(s,'lock',`${pieceLabel(s,e.piece,registry)} 本回合不能用骰子行动`,[e.piece]);break;
      case 'choice':choose(s,e.kind,e.prompt,e.options,!!e.skip);break;
      case 'shield': {
        const ids=(e.ids as string[]).filter(id=>{const p=s.pieces.find(q=>q.id===id)!;return p.progress>=0&&p.progress<53;});
        for(const id of ids) {const p=s.pieces.find(q=>q.id===id)!;p.shield=s.players[p.owner].turns+1;}
        if(ids.length)emit(s,'shield','获得一次保护',ids);break;
      }
      case 'cleanse':
        for(const id of e.ids as string[])s.pieces.find(p=>p.id===id)!.mark=null;
        emit(s,'cleanse','清除负面状态',e.ids);break;
      case 'mark':
        for(const id of e.ids as string[]) {
          const p=s.pieces.find(q=>q.id===id)!;
          if(isPublic(p)&&!p.mark&&!block(s,p,registry)) {p.mark={caster:s.current,expires:s.players[p.owner].turns+1,slow:e.slow,retreat:e.retreat};emit(s,'mark',`${pieceLabel(s,id,registry)} 附着无寿之梦`,[id]);}
        }break;
      case 'rewriteDice':
        s.dice!.value=e.value;s.dice!.source='skill';s.flags.rewritten=true;
        emit(s,'fate',`命运改写 · 自然 ${s.dice!.natural}，移动 ${e.value} 格${s.dice!.extra?'，保留六点追加':''}`);break;
      case 'displace': {
        if(!piece||!isPublic(piece))break;
        let steps=e.steps as number;
        if(e.hostile) {
          if(!e.skipProtection&&block(s,piece,registry))break;
          const defender=registry[s.players[piece.owner].character],reduced=defender.knockback?.(view(s,registry,piece.owner),piece,steps)??steps;
          if(reduced!==steps)emit(s,'passive',`${pieceLabel(s,piece.id,registry)} 境界缓冲 · 少退一格`,[piece.id]);steps=reduced;
        }
        const end=Math.max(0,Math.min(47,piece.progress+steps));
        if(end!==piece.progress)moved(s,piece,end,steps>0?(e.branch??piece.branch??'ground'):branchAt(piece,end),registry,steps>0?'前进':'后退');
        break;
      }
      case 'switchRoute':if(piece)moved(s,piece,piece.progress,e.branch,registry,'经间隙换路');break;
      case 'offerAdvance': {
        const options=piece?forwardOptions(s,piece,e.steps,registry):advanceOptions(s,registry,e.exclude,e.steps);
        choose(s,'advance',e.prompt??'额外前进',options,!!e.skip);break;
      }
      case 'diceMove': {
        if(!piece)break;
        s.flags.moved.push(piece.id);
        if(piece.progress<0) {moved(s,piece,0,null,registry,'出场');break;}
        moved(s,piece,piece.progress+e.steps,e.branch??piece.branch??'ground',registry,`${e.steps} 格`);
        if(!s.rankings.includes(piece.owner)&&isPublic(piece))prepend(s,[{type:'collision',piece:piece.id},{type:'terrain',piece:piece.id}]);
        break;
      }
      case 'collision': {
        const enemies=s.pieces.filter(p=>p.owner!==s.current&&isPublic(p)&&nodeAt(p)===nodeAt(piece!)&&!s.flags.targeted.includes(p.id));
        if(enemies.length===1)prepend(s,[{type:'collisionHit',piece:enemies[0].id}]);
        else if(enemies.length>1)choose(s,'collision','选择一枚同格敌棋撞击',enemies.map(p=>({id:p.id,label:`撞击 ${pieceLabel(s,p.id,registry)}`,effects:[{type:'collisionHit',piece:p.id}],pieces:[p.id],score:p.shield!==null?1:p.progress+1})));
        break;
      }
      case 'collisionHit':if(piece&&isPublic(piece)&&!s.flags.targeted.includes(piece.id)&&!block(s,piece,registry))returnPiece(s,piece,registry);break;
      case 'terrain': {
        if(!piece||!isPublic(piece))break;
        const type=terrain(s,nodeAt(piece));
        if(type==='wind')choose(s,'wind','顺风 · 前进两格？',forwardOptions(s,piece,2,registry),true);
        else if(type==='mist'||type==='obstacle') {
          const steps=type==='mist'?-1:-2;
          prepend(s,character.terrainRetreat?.(view(s,registry),piece,steps)??[{type:'displace',piece:piece.id,steps}]);
        }break;
      }
      case 'afterDice': {
        const r=e.result as DiceResult,p=s.pieces.find(p=>p.id===r.piece)!;
        p.mark=null;
        prepend(s,character.afterDice?.(view(s,registry),r)??[]);break;
      }
      case 'afterAction':
        if(s.dice?.extra&&!s.flags.extra) {s.flags.extra=true;s.flags.first=false;s.flags.rewritten=false;s.dice=null;s.phase='roll';emit(s,'extra','自然六点 · 追加一次行动');}
        else prepend(s,[{type:'finishTurn'}]);break;
      case 'finishTurn': {
        const effects:Effect[]=[];
        for(const p of s.pieces.filter(p=>p.owner===s.current&&p.mark&&p.mark.expires<=player.turns)) {
          const mark=p.mark!;p.mark=null;
          if(isPublic(p))effects.push({type:'dreamRetreat',piece:p.id,steps:-mark.retreat});
        }
        prepend(s,[...effects,{type:'next'}]);break;
      }
      case 'dreamRetreat':
        // Protection was checked once when the attachment was applied. This is its delayed consequence.
        emit(s,'mark',`${pieceLabel(s,piece!.id,registry)} 未用骰子移动 · 无寿之梦回退`,[piece!.id]);
        prepend(s,[{type:'displace',piece:piece!.id,steps:e.steps,hostile:true,skipProtection:true}]);break;
      case 'next': {
        const previous=s.current;do{s.current=(s.current+1)%4;}while(s.rankings.includes(s.current));
        s.turn++;if(s.current<=previous)s.round++;prepend(s,[{type:'begin'}]);break;
      }
      default:throw new Error(`未知效果 ${e.type}`);
    }
  }
  if(!s.choice&&!s.queue.length&&s.phase==='resolving')s.phase='action';
}
export function assertGame(s:GameState) {
  if(!s||s.players?.length!==4||s.pieces?.length!==16)throw new Error('棋子或席位数量错误');
  if(![0,1,2,3].includes(s.current)||!['roll','action','resolving','over'].includes(s.phase)||!Array.isArray(s.history)||!Array.isArray(s.queue)||!s.flags?.targeted||!s.flags?.locked)throw new Error('对局状态格式错误');
  if(!Array.isArray(s.rankings)||s.rankings.length>3||new Set(s.rankings).size!==s.rankings.length||s.rankings.some(id=>!s.players[id]||!s.pieces.filter(p=>p.owner===id).every(p=>p.progress===53))||s.winner!==(s.rankings[0]??null)||!Number.isInteger(s.round)||s.round<1)throw new Error('名次状态格式错误');
  if((s.phase==='over')!==(s.rankings.length===3)||(s.phase!=='over'&&s.rankings.includes(s.current)))throw new Error('赛程结束状态错误');
  if(new Set(s.players.map(p=>p.character)).size!==4||new Set(s.pieces.map(p=>p.id)).size!==16)throw new Error('角色或棋子重复');
  for(const p of s.players)if(!Number.isInteger(p.turns)||p.turns<0||!Number.isInteger(p.activeAt)||!Number.isInteger(p.passiveAt))throw new Error('冷却格式错误');
  for(const p of s.pieces) {
    if(!Number.isInteger(p.progress)||p.progress< -1||p.progress>53||!s.players[p.owner]||p.id!==`p${p.owner}-${p.index}`)throw new Error('赛程或棋子格式错误');
    if(p.mark&&(!isPublic(p)||!Number.isInteger(p.mark.expires)||p.mark.slow<1||p.mark.retreat<1))throw new Error('附着状态格式错误');
  }
  if(s.dice&&(!Number.isInteger(s.dice.natural)||s.dice.natural<1||s.dice.natural>6||!Number.isInteger(s.dice.value)||s.dice.value<1||s.dice.value>6))throw new Error('骰子格式错误');
  if(s.choice&&!s.choice.options.length)throw new Error('等待空选择');
}
export function seededRandom(seed:number):Random {
  let value=seed>>>0||1;return ()=>{value^=value<<13;value^=value>>>17;value^=value<<5;return (value>>>0)/4294967296;};
}
