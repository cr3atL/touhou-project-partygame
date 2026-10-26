import { FINISH } from '../../../packages/core/constants';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { publicAsset } from './assets';
import { CHARACTERS } from '../../../packages/content';
import { COLORS, NODES, nodeAt } from '../../../packages/core/map';
import type { Action, GameState, Piece } from '../../../packages/core/types';
import { SIZE, PLAY_AREA, tilePolygon, displayPoint, nodePoint, piecePoint, pieceGroups, eventTravelPoints, type Point } from './boardModel';
import { cameraArea, cameraScale, framePoints, limitPan, zoomAt, type Camera } from './boardViewport';
import { BattleEffects } from './BattleEffects';
import type { MovePreview } from './movePreview';
import { SPELL_FLIGHT_MS, spellPieceMotion, spellSequence, type PresentationBeat } from './presentationModel';

interface Props {
  game: GameState; preview: MovePreview | null; selected: string | null; picked: string[];
  eligible: string[]; destinations: string[]; zoom: number; viewReset: number; focusRequest: number;
  menu: { node: string; actions: Action[] } | null;
  beat: PresentationBeat | null; declaring: boolean; effects: boolean; closeup: boolean;
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
  const [isDragging,setIsDragging] = useState(false);
  const [expanded,setExpanded] = useState<string | null>(null);
  const previous = useRef(game);
  const groups = pieceGroups(game);
  const [animated,setAnimated] = useState<Record<string,Point>>({});
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ camera: Camera; origin: Point; distance: number } | null>(null);
  const camera = useRef<Camera>({zoom:props.zoom,pan});
  const cameraFrame = useRef(0);
  const cameraTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cinematic = useRef<{id:number; restore:Camera; cancelled:boolean} | null>(null);
  const dragged = useRef(false);
  const area=cameraArea(bounds), mobile=area===PLAY_AREA;
  const center={x:area.x+area.width/2,y:area.y+area.height/2};
  const width = area.width / props.zoom, height = area.height / props.zoom;
  const left = center.x-width/2 + pan.x, top = center.y-height/2 + pan.y;
  const scale = Math.min(bounds.width/width,bounds.height/height);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setBounds({width:entry.contentRect.width,height:entry.contentRect.height}));
    if (host.current) observer.observe(host.current); return () => observer.disconnect();
  },[]);
  useEffect(() => { takeCamera(); setPan({x:0,y:0}); camera.current={zoom:latest.current.zoom,pan:{x:0,y:0}}; },[props.viewReset]);
  function commit(next: Camera) { camera.current=next; latest.current.onZoom(next.zoom); setPan(next.pan); }
  function takeCamera() {
    cancelAnimationFrame(cameraFrame.current);
    clearCameraTimers();
    if (cinematic.current) cinematic.current.cancelled = true;
  }
  function clearCameraTimers() { for(const timer of cameraTimers.current)clearTimeout(timer); cameraTimers.current=[]; }
  function tweenCamera(to: Camera, milliseconds = 280) {
    cancelAnimationFrame(cameraFrame.current);
    const from = camera.current, start = performance.now();
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : milliseconds;
    const tick = (now:number) => {
      const progress = duration ? Math.min(1,(now-start)/duration) : 1, t = progress*progress*(3-2*progress);
      commit({zoom:from.zoom+(to.zoom-from.zoom)*t,pan:{x:from.pan.x+(to.pan.x-from.pan.x)*t,y:from.pan.y+(to.pan.y-from.pan.y)*t}});
      if(progress<1) cameraFrame.current=requestAnimationFrame(tick);
    };
    cameraFrame.current=requestAnimationFrame(tick);
  }
  useLayoutEffect(() => {
    if (Math.abs(camera.current.zoom-props.zoom) > .001) { takeCamera(); camera.current={...camera.current,zoom:props.zoom}; }
  },[props.zoom]);
  useEffect(() => {
    clearCameraTimers();
    const active = cinematic.current;
    if (!props.closeup || !props.beat?.spell) {
      if(active) { if(!active.cancelled)tweenCamera(active.restore); cinematic.current=null; }
      return;
    }
    const sequence = spellSequence(props.beat);
    if(!sequence || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if(!active&&!props.declaring)return;
    if(active?.id !== props.beat.id) {
      const target = framePoints([sequence.origin],bounds);
      if(!target)return;
      const restore = active && !active.cancelled ? active.restore : {...camera.current,pan:{...camera.current.pan}};
      cinematic.current={id:props.beat.id,restore,cancelled:false}; tweenCamera(target);
    }
    if(props.declaring || cinematic.current?.cancelled)return;
    for(const subject of sequence.targets) {
      cameraTimers.current.push(setTimeout(() => {
        if(cinematic.current?.cancelled)return;
        const target = framePoints([subject.from,subject.to],bounds);
        if(target)tweenCamera(target,SPELL_FLIGHT_MS);
      },subject.launch));
    }
    return clearCameraTimers;
  },[props.beat?.id,props.declaring,props.closeup]);
  useEffect(() => () => { cancelAnimationFrame(cameraFrame.current); clearCameraTimers(); },[]);
  useEffect(() => {
    const element=svg.current;
    const wheel=(e:WheelEvent)=>{e.preventDefault();takeCamera();const rect=element!.getBoundingClientRect();commit(zoomAt(camera.current,rect,{x:e.clientX-rect.left,y:e.clientY-rect.top},camera.current.zoom+(e.deltaY<0?.15:-.15)));};
    element?.addEventListener('wheel',wheel,{passive:false});return ()=>element?.removeEventListener('wheel',wheel);
  },[]);
  useEffect(() => {
    // A floating control can become enabled before release, so listen outside the SVG too.
    const release = (event: globalThis.PointerEvent) => finishPointer(event.pointerId);
    const cancel = () => {
      if(!pointers.current.size)return;
      for (const id of [...pointers.current.keys()]) finishPointer(id);
      dragged.current = true;
    };
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener('pointerup',release,true);
    window.addEventListener('pointercancel',release,true);
    window.addEventListener('blur',cancel);
    document.addEventListener('visibilitychange',hidden);
    return () => {
      window.removeEventListener('pointerup',release,true);
      window.removeEventListener('pointercancel',release,true);
      window.removeEventListener('blur',cancel);
      document.removeEventListener('visibilitychange',hidden);
    };
  },[]);
  useEffect(() => {
    if(!props.focusRequest)return;
    takeCamera();
    const piece=game.pieces.find(p=>p.id===selected) ?? game.pieces.find(p=>p.owner===game.current&&p.progress>=0&&p.progress<FINISH) ?? game.pieces.find(p=>p.owner===game.current)!;
    const at=piecePoint(piece);
    commit({zoom:Math.max(1.8,props.zoom),pan:limitPan({x:at.x-center.x,y:at.y-center.y})});
  },[props.focusRequest]);
  useEffect(() => {
    const p=game.pieces.find(p=>p.id===selected);if(!p)return;
    // At full-board scale every playable tile is already visible. Recentring an edge
    // selection here would push most of the board outside the phone viewport.
    if(props.zoom<=1.001)return;
    const points=[piecePoint(p),...(props.preview?.paths.flatMap(path=>path.points)??destinations.map(nodePoint))].filter(Boolean);
    const minX=Math.min(...points.map(p=>p.x))-120,maxX=Math.max(...points.map(p=>p.x))+120;
    const minY=Math.min(...points.map(p=>p.y))-120,maxY=Math.max(...points.map(p=>p.y))+120;
    if(minX>=left&&maxX<=left+width&&minY>=top&&maxY<=top+height)return;
    const fitZoom=Math.max(1,Math.min(props.zoom,area.width/(maxX-minX),area.height/(maxY-minY)));
    commit({zoom:fitZoom,pan:{x:(minX+maxX)/2-center.x,y:(minY+maxY)/2-center.y}});
  },[selected,props.preview]);
  useEffect(() => { setExpanded(null); },[game.revision, game.current]);
  useLayoutEffect(() => {
    const old = previous.current; previous.current = game;
    if(old === game) return;
    const oldGroups = pieceGroups(old);
    const paths = game.pieces.flatMap(p => {
      const before = old.pieces.find(q=>q.id===p.id)!;
      if(nodeAt(before)===nodeAt(p)&&!game.events.some(e=>e.id>old.eventId&&e.type==='bounce'&&e.pieces.includes(p.id))) return [];
      const points = eventTravelPoints(old,game,p);
      points[0] = displayPoint(before,oldGroups); points[points.length-1] = displayPoint(p,groups);
      return [{id:p.id,points}];
    });
    if(!paths.length) { setAnimated({}); return; }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setAnimated(Object.fromEntries(paths.map(path => [path.id,path.points[0]])));
    let frame=0, start=performance.now();
    const tick = (now:number) => {
      const positions: Record<string,Point>={};
      let finished = true;
      for(const {id,points} of paths) {
        const motion = spellPieceMotion(props.beat,id);
        const delay = motion.delay, duration = reduced ? 0 : motion.duration;
        const t = duration ? Math.max(0,Math.min(1,(now-start-delay)/duration)) : 1;
        if(t<1) finished=false;
        const at=t*(points.length-1), index=Math.min(points.length-2,Math.floor(at)), f=at-index;
        const a=points[index], b=points[index+1];
        if(a&&b) positions[id]={x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};
      }
      setAnimated(finished?{}:positions);
      if(!finished) frame=requestAnimationFrame(tick);
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
  function beginGesture() {
    const points=[...pointers.current.values()];
    if(!points.length){gesture.current=null;return;}
    const [a,b]=points;
    gesture.current={camera:{...camera.current,pan:{...camera.current.pan}},origin:b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:a,distance:b?Math.hypot(a.x-b.x,a.y-b.y):0};
  }
  function finishPointer(id:number) {
    if(!pointers.current.delete(id))return;
    if(svg.current?.hasPointerCapture(id))svg.current.releasePointerCapture(id);
    beginGesture();
    if(!pointers.current.size)setIsDragging(false);
  }
  function pointerDown(e:PointerEvent<SVGSVGElement>) {
    if(e.button!==0)return;
    takeCamera();
    if(e.pointerType==='mouse')for(const id of [...pointers.current.keys()])finishPointer(id);
    if(!pointers.current.size)dragged.current=false;
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.current.size>1){dragged.current=true;setIsDragging(true); for(const id of pointers.current.keys())e.currentTarget.setPointerCapture(id);}
    beginGesture();
  }
  function pointerMove(e:PointerEvent<SVGSVGElement>) {
    if(e.pointerType==='mouse'&&(e.buttons&1)===0){finishPointer(e.pointerId);return;}
    if(!pointers.current.has(e.pointerId)||!gesture.current)return;
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const [a,b]=[...pointers.current.values()], start=gesture.current;
    const midpoint=b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:a;
    const dx=midpoint.x-start.origin.x,dy=midpoint.y-start.origin.y;
    if(!b&&Math.hypot(dx,dy)<=6&&!dragged.current)return;
    dragged.current=true;setIsDragging(true);e.currentTarget.setPointerCapture(e.pointerId);
    const rect=e.currentTarget.getBoundingClientRect();
    const next=b&&start.distance>0?zoomAt(start.camera,rect,{x:start.origin.x-rect.left,y:start.origin.y-rect.top},start.camera.zoom*Math.hypot(a.x-b.x,a.y-b.y)/start.distance):start.camera;
    const scale=cameraScale(next.zoom,rect);
    commit({...next,pan:limitPan({x:next.pan.x-dx/scale,y:next.pan.y-dy/scale})});
  }
  function pointerEnd(e:PointerEvent<SVGSVGElement>) {
    finishPointer(e.pointerId);
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
    return <g key={p.id} transform={`translate(${at.x} ${at.y}) scale(${(NODES[nodeAt(p)]?.shape&&NODES[nodeAt(p)].shape!=='full'?.78:1)*(mobile?1.25:1)})`} className={`map-token ${can?'can-act':''} ${picked.includes(p.id)||selected===p.id?'picked':''}`} data-piece={p.id}
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
  return <div className="board-canvas vector-board" ref={host} style={{aspectRatio:`${PLAY_AREA.width}/${PLAY_AREA.height}`}}>
    <svg ref={svg} role="group" aria-label="幻想乡巡游棋盘" className={isDragging?'is-dragging':undefined} viewBox={`${left} ${top} ${width} ${height}`}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
      onLostPointerCapture={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))finishPointer(e.pointerId);}}>
      <image href={publicAsset(mobile?'maps/board-mobile.svg':'maps/board.svg')} width={SIZE.width} height={SIZE.height} pointerEvents="none"/>
      <defs><marker id="route-arrow" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0 0L6 3L0 6Z" fill="#255a9a"/></marker></defs>
      {props.preview?.paths.map(route=><g className="preview-route" key={route.piece} pointerEvents="none" aria-label={`${route.piece} 移动路线`}>
        <polyline className="route-underlay" points={route.points.map(p=>`${p.x},${p.y}`).join(' ')}/><polyline className="route-line" points={route.points.map(p=>`${p.x},${p.y}`).join(' ')} markerEnd="url(#route-arrow)"/>
        <circle cx={route.end.x} cy={route.end.y} r="32" className="route-end"/><text x={route.end.x} y={route.end.y+8}>{game.pieces.find(p=>p.id===route.piece)!.index+1}</text>
      </g>)}
      {[...new Set(destinations)].map(id=>{const p=nodePoint(id);return p?<g key={id} role="button" tabIndex={0} aria-label={`落点 ${id}`} className="map-destination" onClick={e=>{e.stopPropagation();if(!dragged.current)props.onNode(id);}} onKeyDown={e=>activate(e,()=>props.onNode(id))}>
        {NODES[id]?.shape&&NODES[id].shape!=='full'?<polygon points={tilePolygon(id,mobile?1.35:1)}/>:<ellipse cx={p.x} cy={p.y} rx={mobile?80:58} ry={mobile?52:38}/>}<path d={`M${p.x-12} ${p.y}h24M${p.x} ${p.y-12}v24`} className="destination-symbol" pointerEvents="none"/><text x={p.x} y={p.y+49} textAnchor="middle">{id.startsWith('done')?'完成':''}</text>
      </g>:null;})}
      {game.pieces.filter(p=>(p.progress<FINISH||animated[p.id])&&(!compact.has(p.id)||animated[p.id])).sort((a,b)=>displayPoint(a,groups).y-displayPoint(b,groups).y).map(p=>token(p,animated[p.id]??displayPoint(p,groups)))}
      {[...groups.entries()].filter(([,g])=>g.length>=3).map(([node,group])=>{const p=nodePoint(node), can=group.some(p=>eligible.includes(p.id)); const reps=[...new Map(group.map(p=>[p.owner,p])).values()].slice(0,3);return <g key={node} role="button" tabIndex={0} aria-label={`${node} 同格 ${group.length} 枚${can?' 可选':''}`} className="token-stack" onClick={e=>{e.stopPropagation();pickGroup(node);}} onKeyDown={e=>activate(e,()=>pickGroup(node))}>
        <ellipse cx={p.x} cy={p.y} rx="57" ry="28" fill={can?'#f4d37d77':'#f8eddb88'} stroke={can?'#c59a32':'#90867d'} strokeWidth="3"/>
        {reps.map((q,i)=>token(q,{x:p.x+(i-(reps.length-1)/2)*24,y:p.y+(i%2)*6},true))}
        <rect x={p.x+21} y={p.y+2} width="39" height="28" rx="12" fill="#29443f"/><text x={p.x+40} y={p.y+23} textAnchor="middle" fill="white" fontSize="23">{group.length}</text>
      </g>;})}
      {props.preview?.impacts.map((impact,i)=><g key={i} className={`preview-impact impact-${impact.kind}`} transform={`translate(${impact.at.x} ${impact.at.y-65})`} pointerEvents="none"><circle r="20"/><text y="7">{impact.kind==='shield'?'盾':impact.kind==='return'?'×':impact.kind==='mutual'?'!':impact.kind==='cleanse'?'净':'蝶'}</text></g>)}
      {props.effects && props.beat && !props.declaring && <BattleEffects key={props.beat.id} beat={props.beat}/>}
    </svg>

    {popupAt&&<div className="map-popover" role="dialog" aria-label={props.menu?'选择落点结果':'同格棋子'} style={popupPosition} onPointerDown={e=>e.stopPropagation()}><div className="popover-heading"><strong>{props.menu?'选择走法':'选择棋子'}</strong><button aria-label="收起地图选择" onClick={()=>{setExpanded(null);props.onCloseMenu();}}>×</button></div>
      {props.menu ? props.menu.actions.map(a=><button className="map-result" key={a.id} onClick={()=>props.onAction(a)}>{a.detail||a.label}</button>) : game.players.filter(player=>(groups.get(expanded!)??[]).some(p=>p.owner===player.id)).map(player=><div className="stack-player" key={player.id} style={{borderColor:COLORS[player.id]}}><strong>P{player.id+1} · {player.name}</strong><div>{(groups.get(expanded!)??[]).filter(p=>p.owner===player.id).map(p=><button key={p.id} disabled={!eligible.includes(p.id)} onClick={()=>{setExpanded(null);props.onPiece(p.id);}}><img src={publicAsset(`characters/${player.character}-chibi.svg`)} alt=""/><span>{CHARACTERS[player.character].short} {p.index+1}<small>{[p.shield!==null?'保护':'',p.mark?'幽灵附着':''].filter(Boolean).join(' · ')||''}</small></span></button>)}</div></div>)}
    </div>}
  </div>;
}
