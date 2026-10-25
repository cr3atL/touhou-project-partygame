import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { COLORS } from '../../../packages/core/map';
import type { GameState } from '../../../packages/core/types';
import { gameLogTurns } from './gameLogModel';

export function GameLog({game,expanded,onExpanded}:{game:GameState;expanded:boolean;onExpanded(value:boolean):void}) {
  const feed=useRef<HTMLDivElement>(null);
  const [following,setFollowing]=useState(true);
  const turns=gameLogTurns(game);
  const recent=turns.flatMap(t=>t.entries.map(e=>({...e,owner:t.owner}))).slice(-3);
  useLayoutEffect(()=>{
    if(feed.current&&following)feed.current.scrollTop=feed.current.scrollHeight;
  },[game.eventId,expanded,following]);
  return <section className={`game-log ${expanded?'expanded':''}`} aria-label="巡游日志">
    <button className="log-toggle" aria-expanded={expanded} aria-controls="game-log-feed" onClick={()=>{onExpanded(!expanded);if(!expanded)setFollowing(true);}}><span>巡游记录</span><span aria-hidden="true">{expanded?'⌄':'⌃'}</span></button>
    {expanded?<>
      <div id="game-log-feed" className="log-feed" ref={feed} role="log" aria-live="off" tabIndex={0} onScroll={e=>{const element=e.currentTarget;setFollowing(element.scrollHeight-element.scrollTop-element.clientHeight<20);}}>
        {turns.map(t=><div className="log-turn" key={t.turn} style={{'--log-color':t.owner===null?'#788c7f':COLORS[t.owner]} as CSSProperties}><h4>{t.title}</h4>{t.entries.map(e=><p key={e.id} className={`log-${e.type}`}>{e.text}</p>)}</div>)}
      </div>
      {!following&&<button className="log-latest" onClick={()=>setFollowing(true)}>回到最新 ↓</button>}
    </>:<div id="game-log-feed" className="log-recent" role="log" aria-live="polite" aria-relevant="additions text">{recent.length?recent.map(e=><p key={e.id} className={`log-${e.type}`} style={{'--log-color':e.owner===null?'#788c7f':COLORS[e.owner]} as CSSProperties}>{e.text}</p>):<p>巡游开始</p>}</div>}
  </section>;
}
