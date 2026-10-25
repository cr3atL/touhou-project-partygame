import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { publicAsset } from './assets';
import { CHARACTERS } from '../../../packages/content';
import { COLORS, NODES, nodeAt } from '../../../packages/core/map';
import type { Action, GameState, Piece } from '../../../packages/core/types';
import { SIZE, displayPoint, nodePoint, piecePoint, pieceGroups, eventTravelPoints, type Point } from './boardModel';

interface Props {
  game: GameState; preview: Action | null; selected: string | null; picked: string[];
  eligible: string[]; destinations: string[]; zoom: number; viewReset: number;
  menu: { node: string; actions: Action[] } | null;
  onPiece(id: string): void; onNode(id: string): void; onAction(action: Action): void;
  onZoom(zoom: number): void; onCloseMenu(): void;
}
const activate = (e: KeyboardEvent, action: () => void) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action(); } };
export default function Board(props: Props) {
  const { game, eligible, destinations, selected, picked } = props;
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null), latest = useRef(props); latest.current=props;
  const [bounds,setBounds] = useState({width:1000,height:680});
  const [pan,setPan] = useState({x:0,y:0});
  const [expanded,setExpanded] = useState<string | null>(null);
  const previous = useRef(game);
  const groups = pieceGroups(game);
  const [animated,setAnimated] = useState<Record<string,Point>>({});
  const drag = useRef<{x:number;y:number;pan:Point; moved:boolean} | null>(null);
  const dragged = useRef(false);
  const width = SIZE.width / props.zoom, height = SIZE.height / props.zoom;
  const left = (SIZE.width-width)/2 + pan.x, top = (SIZE.height-height)/2 + pan.y;
  const scale = Math.min(bounds.width/width,bounds.height/height);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setBounds({width:entry.contentRect.width,height:entry.contentRect.height}));
    if (host.current) observer.observe(host.current); return () => observer.disconnect();
  },[]);
  useEffect(() => { if(props.zoom===1) setPan({x:0,y:0}); },[props.zoom]);
  useEffect(() => { setPan({x:0,y:0}); },[props.viewReset]);
  useEffect(() => {
    const element=svg.current;
    const wheel=(e:WheelEvent)=>{e.preventDefault();const p=latest.current;p.onZoom(Math.max(1,Math.min(3,p.zoom+(e.deltaY<0?.15:-.15))));};
    element?.addEventListener('wheel',wheel,{passive:false});return ()=>element?.removeEventListener('wheel',wheel);
  },[]);
  useEffect(() => {
    const p=game.pieces.find(p=>p.id===selected);if(!p)return;
    const points=[piecePoint(p),...destinations.map(nodePoint)].filter(Boolean);
    const minX=Math.min(...points.map(p=>p.x))-120,maxX=Math.max(...points.map(p=>p.x))+120;
    const minY=Math.min(...points.map(p=>p.y))-120,maxY=Math.max(...points.map(p=>p.y))+120;
    if(minX>=left&&maxX<=left+width&&minY>=top&&maxY<=top+height)return;
    const fitZoom=Math.max(1,Math.min(props.zoom,SIZE.width/(maxX-minX),SIZE.height/(maxY-minY)));
    props.onZoom(fitZoom);setPan({x:(minX+maxX)/2-SIZE.width/2,y:(minY+maxY)/2-SIZE.height/2});
  },[selected]);
  useEffect(() => { setExpanded(null); },[game.revision, game.current]);
  useEffect(() => {
    const old = previous.current; previous.current = game;
    if(old === game) return;
    const oldGroups = pieceGroups(old);
    const paths = game.pieces.flatMap(p => {
      const before = old.pieces.find(q=>q.id===p.id)!;
      if(nodeAt(before)===nodeAt(p)) return [];
      const points = eventTravelPoints(old,game,p);
      points[0] = displayPoint(before,oldGroups); points[points.length-1] = displayPoint(p,groups);
      return [{id:p.id,points}];
    });
    if(!paths.length) { setAnimated({}); return; }
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600;
    let frame=0, start=performance.now();
    const tick = (now:number) => {
      const t = duration ? Math.min(1,(now-start)/duration) : 1;
      const positions: Record<string,Point>={};
      for(const {id,points} of paths) {
        const at=t*(points.length-1), index=Math.min(points.length-2,Math.floor(at)), f=at-index;
        const a=points[index], b=points[index+1];
        if(a&&b) positions[id]={x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};
      }
      setAnimated(t===1?{}:positions);
      if(t<1) frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick); return ()=>cancelAnimationFrame(frame);
  },[game]);
  function pickGroup(node:string) {
    if(dragged.current) return;
    const group=groups.get(node) ?? [];
    const valid=group.filter(p=>eligible.includes(p.id));
    if(valid.length===1) props.onPiece(valid[0].id);
    else setExpanded(expanded===node?null:node);
  }
  const popupNode=props.menu?.node ?? expanded;
  const popupAt=popupNode ? nodePoint(popupNode) : null;
  const popupPosition=popupAt ? {
    left: Math.max(8,Math.min(bounds.width-282,(bounds.width-width*scale)/2+(popupAt.x-left)*scale+18)),
    top: Math.max(8,Math.min(bounds.height-328,(bounds.height-height*scale)/2+(popupAt.y-top)*scale-70))
  } : {};
  function token(p:Piece, at:Point, compact=false) {
    const c=CHARACTERS[game.players[p.owner].character], can=eligible.includes(p.id);
    const pick=()=>{const group=groups.get(nodeAt(p))??[];const valid=group.filter(p=>eligible.includes(p.id));props.onPiece(valid.length===1?valid[0].id:p.id);};
    return <g key={p.id} transform={`translate(${at.x} ${at.y})`} className={`map-token ${can?'can-act':''} ${picked.includes(p.id)||selected===p.id?'picked':''}`} data-piece={p.id}
      role={compact?undefined:'button'} tabIndex={compact?undefined:0} aria-label={compact?undefined:`P${p.owner+1} ${c.short}${p.index+1} ${nodeAt(p)}${can?' 可选':''}`}
      onClick={compact?undefined:e=>{e.stopPropagation();if(!dragged.current) pick();}} onKeyDown={compact?undefined:e=>activate(e,pick)}>
      <g pointerEvents="none"><ellipse className="token-halo" cy="-2" rx="34" ry="23"/>
      <ellipse cy="5" rx="25" ry="13" fill="#343348" opacity=".16"/>
      <ellipse cy="0" rx="25" ry="13" fill={COLORS[p.owner]} stroke={selected===p.id?'#fff2a3':'#fff7df'} strokeWidth="3"/>
      <image href={publicAsset(`characters/${game.players[p.owner].character}-chibi.svg`)} x="-39" y="-82" width="78" height="83" pointerEvents="none"/>
      <circle cx="23" cy="-20" r="12" fill={COLORS[p.owner]} stroke="#fff8e7" strokeWidth="2"/><text x="23" y="-15" className="token-index">{p.index+1}</text>
      {p.shield!==null&&<path d="M-32-64Q0-87 32-64L29-20Q0 12-29-20Z" fill="#70c6ed22" stroke="#52afd0" strokeWidth="3" pointerEvents="none"/>}
      {p.mark&&<text x="-25" y="-49" className="token-status">蝶</text>}</g>
      <rect x={(groups.get(nodeAt(p))?.length===2)?-16:-36} y="-83" width={(groups.get(nodeAt(p))?.length===2)?32:72} height="100" fill="transparent"/>
    </g>;
  }
  const compact = new Set([...groups.entries()].filter(([,g])=>g.length>=3).flatMap(([,g])=>g.map(p=>p.id)));
  return <div className="board-canvas vector-board" ref={host}>
    <svg ref={svg} role="group" aria-label="幻想乡巡游棋盘" viewBox={`${left} ${top} ${width} ${height}`}
      onPointerDown={e=>{ if(e.button!==0) return; dragged.current=false; drag.current={x:e.clientX,y:e.clientY,pan,moved:false}; }}
      onPointerMove={e=>{const d=drag.current;if(!d) return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.hypot(dx,dy)>6){dragged.current=true; d.moved=true; e.currentTarget.setPointerCapture(e.pointerId);setPan({x:Math.max(-SIZE.width*.45,Math.min(SIZE.width*.45,d.pan.x-dx/scale)),y:Math.max(-SIZE.height*.45,Math.min(SIZE.height*.45,d.pan.y-dy/scale))});}}}
      onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);drag.current=null;}}
      onPointerCancel={()=>{drag.current=null;}}>
      <image href={publicAsset('maps/board.svg')} width={SIZE.width} height={SIZE.height} pointerEvents="none"/>
      {(props.preview?.nodes??[]).map(id=>{const p=nodePoint(id);return p?<ellipse key={id} cx={p.x} cy={p.y} rx="42" ry="30" fill="#e2ae3a24" stroke="#b48224" strokeWidth="3" pointerEvents="none"/>:null;})}
      {[...new Set(destinations)].map(id=>{const p=nodePoint(id);return p?<g key={id} role="button" tabIndex={0} aria-label={`落点 ${id}`} className="map-destination" onClick={e=>{e.stopPropagation();if(!dragged.current)props.onNode(id);}} onKeyDown={e=>activate(e,()=>props.onNode(id))}>
        <ellipse cx={p.x} cy={p.y} rx="45" ry="33"/><text x={p.x} y={p.y+49} textAnchor="middle">{id.startsWith('done')?'完成':id}</text>
      </g>:null;})}
      {game.pieces.filter(p=>(p.progress<53||animated[p.id])&&(!compact.has(p.id)||animated[p.id])).sort((a,b)=>displayPoint(a,groups).y-displayPoint(b,groups).y).map(p=>token(p,animated[p.id]??displayPoint(p,groups)))}
      {[...groups.entries()].filter(([,g])=>g.length>=3).map(([node,group])=>{const p=nodePoint(node), can=group.some(p=>eligible.includes(p.id)); const reps=[...new Map(group.map(p=>[p.owner,p])).values()].slice(0,3);return <g key={node} role="button" tabIndex={0} aria-label={`${node} 同格 ${group.length} 枚${can?' 可选':''}`} className="token-stack" onClick={e=>{e.stopPropagation();pickGroup(node);}} onKeyDown={e=>activate(e,()=>pickGroup(node))}>
        <ellipse cx={p.x} cy={p.y} rx="47" ry="28" fill={can?'#f4d37d77':'#f8eddb88'} stroke={can?'#c59a32':'#90867d'} strokeWidth="3"/>
        {reps.map((q,i)=>token(q,{x:p.x+(i-(reps.length-1)/2)*24,y:p.y+(i%2)*6},true))}
        <rect x={p.x+21} y={p.y+2} width="39" height="28" rx="12" fill="#29443f"/><text x={p.x+40} y={p.y+23} textAnchor="middle" fill="white" fontSize="23">{group.length}</text>
      </g>;})}
    </svg>
    {popupAt&&<div className="map-popover" role="dialog" aria-label={props.menu?'选择落点结果':'同格棋子'} style={popupPosition} onPointerDown={e=>e.stopPropagation()}><div className="popover-heading"><strong>{popupNode}</strong><button aria-label="收起地图选择" onClick={()=>{setExpanded(null);props.onCloseMenu();}}>×</button></div>
      {props.menu ? props.menu.actions.map(a=><button className="map-result" key={a.id} onClick={()=>props.onAction(a)}>{a.detail||a.label}<span>{a.label}</span></button>) : game.players.filter(player=>(groups.get(expanded!)??[]).some(p=>p.owner===player.id)).map(player=><div className="stack-player" key={player.id} style={{borderColor:COLORS[player.id]}}><strong>P{player.id+1} · {player.name}</strong><div>{(groups.get(expanded!)??[]).filter(p=>p.owner===player.id).map(p=><button key={p.id} disabled={!eligible.includes(p.id)} onClick={()=>{setExpanded(null);props.onPiece(p.id);}}><img src={publicAsset(`characters/${player.character}-chibi.svg`)} alt=""/><span>{CHARACTERS[player.character].short} {p.index+1}<small>{[p.shield!==null?'保护':'',p.mark?'幽灵附着':''].filter(Boolean).join(' · ')||''}</small></span></button>)}</div></div>)}
    </div>}
  </div>;
}
