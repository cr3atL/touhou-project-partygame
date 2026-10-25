import { CHARACTERS } from '../../../packages/content';
import { nodePoint, piecePoint, type Point } from './boardModel';
import { SPELL_FLIGHT_MS, spellPieceMotion, spellSequence, type PresentationBeat } from './presentationModel';
import { useEffect, useState, type CSSProperties } from 'react';

export function BattleEffects({ beat }: { beat: PresentationBeat }) {
  const { before, after, events, spell } = beat;
  const sequence = spellSequence(beat);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if(!sequence||reduced)return;
    const start=performance.now(); let frame=0;
    const tick=(now:number)=>{setElapsed(now-start);if(now-start<sequence.duration)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(frame);
  },[beat.id]);
  const time = reduced ? Infinity : elapsed;
  const impact = (id:string) => sequence?.targets.find(t=>t.piece===id)?.impact ?? 0;
  const position = (id: string, end = false): Point => piecePoint((end ? after : before).pieces.find(p => p.id === id)!);
  const skill = events.find(e => e.type === 'skill');
  const caster = sequence?.caster;
  const color = spell ? CHARACTERS[spell.character].color : '#dfb957';
  const subjects = skill?.pieces ?? [];
  const targets = subjects.filter(id => id !== caster);
  return <g className={`battle-effects ${sequence?'has-sequence':''}`} pointerEvents="none" aria-hidden="true" key={beat.id} style={{'--fx-color':color} as CSSProperties}>
    {spell && <>
      {!reduced&&sequence?.targets.map((target,index)=>{
        if(time<target.launch||time>target.impact)return null;
        const a=index?sequence.targets[index-1].to:sequence.origin;
        const b=target.piece===caster?target.to:target.from;
        const progress=Math.min(1,(time-target.launch)/SPELL_FLIGHT_MS),t=progress*progress*(3-2*progress);
        const head={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t-30};
        return <g key={`flight-${target.piece}`} data-fx-flight={target.piece}>
          <path className="spell-flight-trail" d={`M${a.x} ${a.y-30}L${head.x} ${head.y}`}/>
          <circle className="spell-flight-head" cx={head.x} cy={head.y} r="18"/>
          {spell.character==='yuyuko'&&<path fill="#f6d7f0" transform={`translate(${head.x} ${head.y})`} d="M0 0C-40-45-40 8-5 10C-20 35-4 35 0 15C4 35 20 35 5 10C40 8 40-45 0 0"/>}
        </g>;
      })}
      {(spell.character === 'marisa' || spell.character === 'youmu' || spell.character === 'flandre') && caster && targets.map(id => {
        const launch=sequence?.targets.find(t=>t.piece===id)?.launch ?? 0;
        if(time<launch)return null;
        const a = position(caster), b = position(id);
        return <g key={`ray-${id}`} className={`spell-ray ${spell.character}`}>
          <line x1={a.x} y1={a.y-30} x2={b.x} y2={b.y-30} strokeWidth={spell.character === 'marisa' ? 65 : 14}/>
          <line x1={a.x} y1={a.y-30} x2={b.x} y2={b.y-30} stroke="#fffbe5" strokeWidth={spell.character === 'marisa' ? 24 : 5}/>
        </g>;
      })}
      {subjects.map(id => {
        if(spell.character!=='yukari'&&time<impact(id))return null;
        const p = position(id), end = position(id, true);
        return <g key={`spell-${id}`} data-fx-impact={id}>
          {spell.character === 'yukari' ? <>{[p,end].map((a,i) => <g key={i} transform={`translate(${a.x} ${a.y-25})`}><ellipse className="gap-portal" rx="25" ry="82"/><path className="gap-eye" d="M-17 0Q0-24 17 0Q0 24-17 0Z"/></g>)}</> :
          spell.character === 'reimu' ? <g transform={`translate(${p.x} ${p.y-28})`}><circle className="barrier-bloom" r="72"/><circle className="barrier-bloom inner" r="50"/>{[0,90,180,270].map(a => <g key={a} transform={`rotate(${a})`}><rect className="ofuda" x="-10" y="-95" width="20" height="43" rx="2"/><path d="M-5-88h10m-10 8h10m-5 0v20" stroke="#b83145" strokeWidth="3"/></g>)}</g> :
          spell.character === 'yuyuko' ? <g transform={`translate(${p.x} ${p.y-40})`}>{[-1,0,1].map((n,i) => <g className="ghost-butterfly" key={n} style={{animationDelay:`${i*70}ms`}} transform={`translate(${n*40} ${-Math.abs(n)*35})`}><path d="M0 0C-60-70-62 8-8 12C-40 54-8 54 0 22C8 54 40 54 8 12C62 8 60-70 0 0"/></g>)}</g> :
          spell.character === 'flandre' || spell.character === 'youmu' ? <g transform={`translate(${p.x} ${p.y-30})`}><path className="sword-flash" d="M-90 70L95-85M-50-80L65 80"/><circle className="hit-ring" r="64"/></g> :
          <g transform={`translate(${p.x} ${p.y-25})`}><circle className="hit-ring" r="65"/></g>}
        </g>;
      })}
    </>}
    {events.flatMap(event => event.pieces.map(id => {
      const motion=spellPieceMotion(beat,id);
      const starts=event.type==='move'?motion.delay+motion.duration:impact(id);
      if(sequence&&time<starts)return null;
      const p = event.from ? nodePoint(event.from) ?? position(id) : position(id);
      const end = event.to ? nodePoint(event.to) ?? position(id, true) : position(id, true);
      if (event.type === 'move') return <g key={`${event.id}-${id}`}>
        {before.choice && ['wind','advance'].includes(before.choice.kind) && <path className="wind-trail" d={`M${p.x} ${p.y}Q${(p.x+end.x)/2+50} ${(p.y+end.y)/2-60} ${end.x} ${end.y}`}/>}
        <g transform={`translate(${end.x} ${end.y})`}><ellipse className={`landing-ring ${event.to?.startsWith('done')?'finish-ring':''}`} rx="55" ry="30"/></g>
      </g>;
      if (event.type === 'return') return <g key={`${event.id}-${id}`} transform={`translate(${p.x} ${p.y-25})`}><circle className="return-burst" r="75"/>{Array.from({length:8},(_,i) => <g key={i} transform={`rotate(${i*45})`}><path className="return-shard" d="M0-25L8-65-8-65Z"/></g>)}</g>;
      if (event.type === 'shield') {
        const blocked = before.pieces.find(p => p.id === id)?.shield !== null && after.pieces.find(p => p.id === id)?.shield === null;
        return <g key={`${event.id}-${id}`} transform={`translate(${end.x} ${end.y-35})`}><path className={blocked?'shield-break':'shield-rise'} d="M-45-45Q0-75 45-45L40 15Q0 65-40 15Z"/>{blocked && <path className="shield-crack" d="M0-55L-10-18 15 0-4 40M-10-18L-40-25M15 0L40-12"/>}</g>;
      }
      if (event.type === 'cleanse' || event.type === 'passive') return <g key={`${event.id}-${id}`} transform={`translate(${end.x} ${end.y-30})`}>{[0,1,2,3,4].map(n => <path key={n} className="cleanse-star" style={{animationDelay:`${n*55}ms`}} transform={`translate(${Math.cos(n*1.3)*65} ${Math.sin(n*1.3)*65})`} d="M0-14L4-4 14 0 4 4 0 14-4 4-14 0-4-4Z"/>)}</g>;
      if (event.type === 'mark') return <g key={`${event.id}-${id}`} transform={`translate(${end.x} ${end.y-30})`}><circle className="dream-ring" r="65"/></g>;
      return null;
    }))}
  </g>;
}
