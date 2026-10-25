import { DecisionClock, remainingTime, type DecisionTime } from '../../../packages/session/decisionClock';
import { playSound } from './audio';
import { FINISH } from '../../../packages/core/constants';
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Client, type Room } from '@colyseus/sdk';
const Board = lazy(() => import('./Board'));
import { version } from '../../../package.json';
import { CHARACTERS, CHARACTER_LIST } from '../../../packages/content';
import { createGame, getActions, reduceGame } from '../../../packages/core/engine';
import { COLORS, nodeAt } from '../../../packages/core/map';
import { VERSIONS, type Action, type CharacterId, type Command, type GameState } from '../../../packages/core/types';
import { botAction, loadGame, saveGame, ROOM_KICKED_CODE, type RoomSnapshot } from '../../../packages/session';
import { CharacterCatalog } from './CharacterCatalog';
import { publicAsset } from './assets';
import { defaultRoomEndpoint, validateRoomEndpoint, waitForRoomServer } from './connection';
import { actionsForPiece, destinationActions } from './boardModel';
import { DiceDock } from './DiceDock';
import { GameLog } from './GameLog';
import { useGamePresentation } from './useGamePresentation';
import { PresentationSettingsDialog, usePresentationSettings } from './PresentationSettings';
import { SpellCutIn } from './SpellCutIn';
import { LobbySeats, RoomMembersDialog, type MemberAction } from './RoomMembers';

type Roster = { name: string; character: CharacterId; bot: boolean }[];
const DEFAULTS: Roster = [
  { name: '玩家一', character: 'reimu', bot: false }, { name: '玩家二', character: 'marisa', bot: false },
  { name: '玩家三', character: 'flandre', bot: false }, { name: '玩家四', character: 'yuyuko', bot: false }
];
const tint = (color: string) => ({ '--accent': color } as CSSProperties);
function Glyph({ id, small = false }: { id: CharacterId; small?: boolean }) { const c = CHARACTERS[id]; return <span className={`glyph ${small ? 'small' : ''}`} style={tint(c.color)}><img src={publicAsset(`characters/${id}-chibi.svg`)} alt={c.short}/></span>; }

export default function App() {
  const [presentationSettings, setPresentationSettings] = usePresentationSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [presentationSession, setPresentationSession] = useState(0);
  const [roster, setRoster] = useState<Roster>(DEFAULTS);
  const [game, setGame] = useState<GameState | null>(null);
  const [mode, setMode] = useState<'local' | 'online'>('local');
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [seat, setSeat] = useState<number | null>(null);
  const room = useRef<Room | null>(null);
  const [name, setName] = useState('旅人'), [roomCode, setRoomCode] = useState('');
  const [endpoint, setEndpoint] = useState(defaultRoomEndpoint(location, import.meta.env.VITE_ROOM_SERVER_URL));
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'move' | 'cast'>('move');
  const [selected, setSelected] = useState<string | null>(null), [armed, setArmed] = useState<Action | null>(null), [hover, setHover] = useState<Action | null>(null);
  const [targets,setTargets] = useState<string[]>([]);
  const [advanceActivated, setAdvanceActivated] = useState(false);
  const [mapMenu,setMapMenu] = useState<{node:string;actions:Action[]} | null>(null);
  const [viewReset,setViewReset] = useState(0);
  const [zoom, setZoom] = useState(1), [logOpen, setLogOpen] = useState(false);
  const [spellOpen, setSpellOpen] = useState(false), [focusRequest, setFocusRequest] = useState(0);
  const [pendingRevision, setPendingRevision] = useState<number | null>(null);
  const [resumeToken, setResumeToken] = useState(sessionStorage.getItem('party-reconnect') || '');
  const fileInput = useRef<HTMLInputElement>(null);
  const decisionClock=useRef<DecisionClock | null>(null);
  const onlineTime=useRef<DecisionTime | null>(null);
  const [time,setTime]=useState<DecisionTime | null>(null);
  const lastBeep=useRef('');
  const sourceGame = mode === 'online' ? snapshot?.game ?? null : game;
  const presentation = useGamePresentation(sourceGame, presentationSession);
  const currentGame = presentation.game;
  const inputLocked = presentation.busy || pendingRevision !== null || (mode==='online'&&!!time&&Date.now()<time.blockedUntil) || (mode==='local'&&settingsOpen);
  const actions = currentGame ? getActions(currentGame, CHARACTERS) : [];
  const mine = !!currentGame && (mode === 'local' ? !currentGame.players[currentGame.current].bot&&!time?.takeover : seat === currentGame.current&&!time?.takeover);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { setArmed(null); setHover(null); setSelected(null); setTab('move'); setTargets([]); setMapMenu(null); setAdvanceActivated(false); }, [currentGame, mode]);
  useEffect(() => { setPendingRevision(null); }, [sourceGame?.revision, mode, notice]);
  useEffect(() => { setSpellOpen(false); }, [currentGame?.turn]);
  useEffect(() => {
    if (pendingRevision === null) return;
    const timer = setTimeout(() => { setPendingRevision(null); setNotice('服务器尚未确认操作，请检查连接后重试'); }, 8000);
    return () => clearTimeout(timer);
  }, [pendingRevision]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSpellOpen(false); setLogOpen(false); setTab('move'); setSelected(null); setTargets([]); setArmed(null); setMapMenu(null); setAdvanceActivated(false); } };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, []);
  useEffect(() => {
    if(!sourceGame)return;
    let lastSave=0;
    const tick=()=>{
      const now=Date.now();let value:DecisionTime|null=null;
      if(mode==='local'){
        decisionClock.current??=new DecisionClock(sourceGame.turn,now);
        value=decisionClock.current.update(sourceGame,now,settingsOpen||presentation.busy);
        if(now-lastSave>=1000){try{localStorage.setItem('party-save-v050',saveGame(sourceGame,value));lastSave=now;}catch{/* optional autosave */}}
      }else if(onlineTime.current)value={...onlineTime.current,remainingMs:remainingTime(onlineTime.current,now),at:now};
      setTime(value);
      const second=value?Math.ceil(value.remainingMs/1000):60,key=`${value?.turn}-${second}`;
      if(value&&!value.paused&&now>=value.blockedUntil&&!value.takeover&&second>=1&&second<=5&&key!==lastBeep.current){lastBeep.current=key;playSound('timeout',.8);}
    };
    tick();const interval=setInterval(tick,100);return()=>clearInterval(interval);
  },[sourceGame,mode,settingsOpen,presentation.busy]);
  useEffect(() => {
    if (mode !== 'local' || !game || game.phase === 'over' || (!game.players[game.current].bot&&!time?.takeover) || settingsOpen || presentation.busy || currentGame?.revision !== game.revision) return;
    const timer = setTimeout(() => {
      try { setGame(reduceGame(game, botAction(game).command, CHARACTERS)); } catch (error) { setSettingsOpen(true); setNotice(String(error)); }
    }, game.phase === 'roll' ? 850 : 650);
    return () => clearTimeout(timer);
  }, [game, settingsOpen, mode, presentation.busy, currentGame?.revision,time?.takeover]);

  function send(command: Command) {
    if (!currentGame || inputLocked || currentGame.revision !== sourceGame?.revision) return;
    try {
      if (mode === 'online') { if (!room.current) return; setPendingRevision(currentGame.revision); room.current.send('command', { revision: currentGame.revision, command }); }
      else setGame(reduceGame(currentGame, command, CHARACTERS));
      setArmed(null); setHover(null);
    } catch (error) { setPendingRevision(null); setNotice(error instanceof Error ? error.message : String(error)); }
  }
  function startLocal(bots: boolean) {
    const next = roster.map((p, i) => ({ ...p, bot: bots ? i !== 0 : p.bot }));
    if (new Set(next.map(p => p.character)).size !== 4) { setNotice('请选择四名不同的角色'); return; }
    for (let i = 3; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [next[i], next[j]] = [next[j], next[i]]; }
    decisionClock.current=null;setTime(null);setPresentationSession(n=>n+1);
    setMode('local'); setGame(createGame(next, CHARACTERS));
  }
  function bindRoom(joined: Room, address: string) {
    room.current = joined;
    sessionStorage.setItem('party-reconnect', joined.reconnectionToken); sessionStorage.setItem('party-endpoint', address); setResumeToken(joined.reconnectionToken);
    joined.onMessage('welcome', (data: { seat: number }) => setSeat(data.seat));
    const syncTime=(timer:DecisionTime|undefined,serverTime=Date.now())=>{if(timer){const now=Date.now();onlineTime.current={...timer,at:now,blockedUntil:now+Math.max(0,timer.blockedUntil-serverTime)};setTime(onlineTime.current);}};
    joined.onMessage('timer',(data:{timer:DecisionTime;serverTime:number})=>syncTime(data.timer,data.serverTime));
    joined.onMessage('snapshot', (s: RoomSnapshot) => {
      if (s.protocol !== VERSIONS.protocol || s.rules !== VERSIONS.rules) { setNotice('房间版本不兼容'); void joined.leave(); return; }
      syncTime(s.timer,s.serverTime);setSnapshot(s);
      sessionStorage.setItem('party-reconnect', joined.reconnectionToken); setResumeToken(joined.reconnectionToken);
    });
    joined.onMessage('notice', (text: string) => setNotice(text));
    joined.onLeave(code => {
      if(room.current!==joined)return;
      if(code===ROOM_KICKED_CODE){
        joined.reconnection.enabled=false; room.current=null;
        sessionStorage.removeItem('party-reconnect'); setResumeToken('');
        setSnapshot(null);setSeat(null);setGame(null);setMode('local');setMembersOpen(false);
        setNotice('你已被房主移出房间');
      } else setNotice('已离开房间，可尝试重新连接');
    });
    joined.onError((_code: number, message?: string) => setNotice(message || '房间连接异常'));
    joined.send('sync'); setMode('online');
  }
  async function connect(kind: 'create' | 'join' | 'reconnect') {
    setBusy(true);
    try {
      const address=validateRoomEndpoint(kind === 'reconnect' ? sessionStorage.getItem('party-endpoint') || endpoint : endpoint,location.protocol);
      await waitForRoomServer(address);
      const client = new Client(address);
      const joined = kind === 'create' ? await client.create('party', { name, protocol: VERSIONS.protocol }) : kind === 'join' ? await client.joinById(roomCode.trim(), { name, protocol: VERSIONS.protocol }) : await client.reconnect(resumeToken);
      bindRoom(joined, address);
    } catch (error) { setNotice(`连接失败：${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  }
  async function leave() {
    if(mode==='local'&&game){
      try {localStorage.setItem('party-save-v050',saveGame(game,decisionClock.current?.update(game,Date.now(),true)));}catch{/* optional autosave */}
    }
    setSettingsOpen(false);setSpellOpen(false);setLogOpen(false);setPendingRevision(null);
    const active=room.current;room.current=null;
    sessionStorage.removeItem('party-reconnect');setResumeToken('');
    setSnapshot(null); setSeat(null); setGame(null); setMode('local');setMembersOpen(false);
    try {await active?.leave();}catch(error){setNotice(error instanceof Error?error.message:'离开房间失败');}
  }
  function manageMember(action: MemberAction) { room.current?.send('manage',action); }
  function importSave(file: File) {
    void file.text().then(text => { try { const loaded=loadGame(text); setPresentationSession(n=>n+1); decisionClock.current=new DecisionClock(loaded.turn,Date.now(),JSON.parse(text).timer);setGame(loaded); setMode('local'); setSettingsOpen(true); } catch (error) { setNotice(String(error)); } });
  }
  const lobby = mode === 'online' && snapshot && !snapshot.game;
  const ownSeat = snapshot?.seats.find(s => s.id === seat);
  const hostSeat = snapshot?.hostSeat === undefined ? snapshot?.seats.filter(s => s.connected && !s.bot).sort((a, b) => a.id - b.id)[0]?.id : snapshot.hostSeat;
  const acting = currentGame?.players[currentGame.current];
  const char = acting ? CHARACTERS[acting.character] : null;
  const skillActions = actions.filter(a => a.kind === 'cast');
  const advanceChoice = currentGame?.choice?.kind === 'advance';
  const advanceActions = advanceChoice ? actions.filter(a => a.nodes.length) : [];
  const advancePieces = [...new Set(advanceActions.flatMap(a => a.pieces.slice(0, 1)))];
  const mapActions = currentGame?.choice ? actions : actions.filter(a => a.kind === 'move');
  const casterActions = skillActions.filter(a => a.command.type === 'cast' && (a.command.caster === selected || !a.command.caster));
  const exactTargets = (a:Action, ids:string[]) => a.command.type === 'cast' && (a.command.targets??[]).length===ids.length && ids.every(id=>a.command.type==='cast'&&a.command.targets?.includes(id));
  const selectedSkills = casterActions.filter(a=>exactTargets(a,targets));
  const eligible = !mine || inputLocked ? [] : advanceChoice
    ? advanceActivated && advancePieces.length > 1 ? advancePieces : [] : tab==='cast' && !currentGame?.choice
    ? [...new Set([...skillActions.flatMap(a=>a.command.type==='cast'&&a.command.caster?[a.command.caster]:[]), ...casterActions.flatMap(a=>a.command.type==='cast'?a.command.targets??[]:[])])]
    : [...new Set(mapActions.flatMap(a=>a.pieces.slice(0,1)))];
  const destinations = !mine || inputLocked || advanceChoice && !advanceActivated ? [] : tab==='cast' && !currentGame?.choice
    ? casterActions.flatMap(a=>a.command.type==='cast'&&(!a.command.targets?.length)?a.nodes.slice(-1):[])
    : selected ? actionsForPiece(mapActions,selected).flatMap(a=>a.nodes.slice(-1)) : [];
  function choosePiece(id:string) {
    if(!mine || !currentGame || inputLocked) return;
    setMapMenu(null);
    if (advanceChoice) {
      if (!advanceActivated) return;
      const options = actionsForPiece(advanceActions, id);
      if (options.length === 1) send(options[0].command);
      else if (options.length) setSelected(id);
      else {
        const piece = currentGame.pieces.find(p => p.id === id);
        if (piece && destinations.includes(nodeAt(piece))) chooseNode(nodeAt(piece));
      }
      return;
    }
    if(tab==='cast'&&!currentGame.choice) {
      if(casterActions.some(a=>a.command.type==='cast'&&a.command.targets?.includes(id))) {
        const next = targets.includes(id) ? targets.filter(t=>t!==id) : [...targets,id];
        const valid = casterActions.filter(a=>a.command.type==='cast'&&next.every(t=>a.command.type==='cast'&&a.command.targets?.includes(t)));
        const picked = valid.length ? next : [id];
        setTargets(picked); setArmed(casterActions.find(a=>exactTargets(a,picked))??null);
      } else if(skillActions.some(a=>a.command.type==='cast'&&a.command.caster===id)) {setSelected(id);setTargets([]);const own=skillActions.filter(a=>a.command.type==='cast'&&a.command.caster===id&&!a.command.targets?.length);setArmed(own.length===1?own[0]:null);}
      return;
    }
    const options = actionsForPiece(mapActions,id);
    if(options.length===1) send(options[0].command);
    else if(options.length) {setSelected(id);setArmed(null);}
    else {const p=currentGame.pieces.find(p=>p.id===id);if(p&&destinations.includes(nodeAt(p))) chooseNode(nodeAt(p));}
  }
  function chooseNode(node:string) {
    if(!mine || inputLocked || advanceChoice && !advanceActivated) return;
    const options = tab==='cast'&&!currentGame?.choice ? casterActions.filter(a=>a.command.type==='cast'&&exactTargets(a,targets)&&a.nodes.at(-1)===node)
      : destinationActions(selected?actionsForPiece(mapActions,selected):mapActions,node);
    if(options.length===1) {if(tab==='cast'&&!currentGame?.choice) setArmed(options[0]);else send(options[0].command);}
    else if(options.length) setMapMenu({node,actions:options});
  }
  function openSkill() {setSpellOpen(false);setTab('cast');setSelected(null);setTargets([]);setMapMenu(null);setArmed(skillActions.length===1?skillActions[0]:null);}
  function activateAdvance() {
    if (!mine || inputLocked || !advanceActions.length) return;
    if (advanceActions.length === 1) send(advanceActions[0].command);
    else { setAdvanceActivated(true); setSelected(advancePieces.length === 1 ? advancePieces[0] : null); }
  }
  function cancelSelection() { setTab('move'); setSelected(null); setTargets([]); setArmed(null); setHover(null); setMapMenu(null); setAdvanceActivated(false); }
  const spellStatus = !currentGame || !acting ? '' : Math.max(0, acting.activeAt - acting.turns)
    ? `冷却 ${acting.activeAt - acting.turns}` : currentGame.flags.active ? '本回合已使用'
    : currentGame.phase === 'roll' ? '掷骰后可用' : !currentGame.flags.first ? '追加行动不可用'
    : skillActions.length ? '可以施放' : '无合法目标';

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#" onClick={e => { e.preventDefault(); if (!currentGame && !lobby) return; if (confirm('返回大厅？当前本地对局会自动保存。')) void leave(); }}><span className="torii">⛩</span><span>幻想乡巡游<small>东方派对</small></span></a>
      <div className="header-actions">{currentGame ? <span className="mode-pill">{mode === 'online' ? `四人房间 · ${snapshot?.roomId}` : currentGame.players.filter(p=>!p.bot).length===1?'单人对局':'同机对局'}</span> : <span className="version">v{version}</span>}</div>
    </header>
    {notice && <div className="toast" role="alert">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <input type="file" accept=".json" hidden ref={fileInput} onChange={e => { const f = e.target.files?.[0]; if (f) importSave(f); e.target.value = ''; }} />

    {!currentGame && !lobby && <main className="home-layout"><div className="setup-layout">
      <section className="welcome"><div className="welcome-copy"><span className="eyebrow">四位旅人，一场幻想乡巡游</span><h1>下一步，<br/>会是谁的逆转？</h1><p>掷骰前行，施放符卡。<br/>四色棋盘上，和熟悉的她们相遇。</p></div><div className="map-preview"><img src={publicAsset('maps/board.svg')} alt="幻想乡巡游地图" /></div><div className="welcome-bottom"><span>四人对局</span><a href="#characters">七位角色</a><span>同色跳格</span></div></section>
      <section className="setup-card"><div className="section-tabs"><button className={mode === 'local' ? 'selected' : ''} onClick={() => setMode('local')}>同机游玩</button><button className={mode === 'online' ? 'selected' : ''} onClick={() => setMode('online')}>四人房间</button></div>
        {mode === 'local' ? <><div className="roster">{roster.map((p, i) => <div className="roster-row" key={i} style={tint(COLORS[i])}><Glyph id={p.character} /><div className="roster-fields"><input aria-label={`玩家${i + 1}名字`} value={p.name} maxLength={16} onChange={e => setRoster(roster.map((q, j) => i === j ? { ...q, name: e.target.value } : q))}/><select aria-label={`玩家${i + 1}角色`} value={p.character} onChange={e => setRoster(roster.map((q, j) => i === j ? { ...q, character: e.target.value as CharacterId } : q))}>{CHARACTER_LIST.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><label className="bot-toggle"><input type="checkbox" checked={p.bot} onChange={e => setRoster(roster.map((q, j) => i === j ? { ...q, bot: e.target.checked } : q))}/><span>式神</span></label></div>)}</div>
        <button className="primary wide" onClick={() => startLocal(false)}>开始巡游 <span>↗</span></button><button className="secondary wide" onClick={() => startLocal(true)}>单人游玩 · 三名式神同行</button><div className="setup-links"><button onClick={() => { const saved = localStorage.getItem('party-save-v050') || localStorage.getItem('party-save-v031') || localStorage.getItem('party-save-v03') || localStorage.getItem('party-save'); if (!saved) return setNotice('还没有本地存档'); try { const loaded=loadGame(saved);decisionClock.current=new DecisionClock(loaded.turn,Date.now(),JSON.parse(saved).timer);setPresentationSession(n=>n+1);setGame(loaded); setSettingsOpen(true); } catch (e) { setNotice(String(e)); } }}>继续上次</button><button onClick={() => fileInput.current?.click()}>导入存档</button></div></> : <div className="online-form"><label>名字<input value={name} maxLength={16} onChange={e => setName(e.target.value)}/></label><details className="room-settings" open={!import.meta.env.VITE_ROOM_SERVER_URL}><summary>连接设置</summary><label>房间服务<input value={endpoint} disabled={busy} placeholder="wss://你的房间服务" onChange={e => setEndpoint(e.target.value)}/></label></details><button className="primary wide" disabled={busy || !endpoint.trim()} onClick={() => void connect('create')}>{busy ? '正在连接…' : '创建房间'}</button><div className="join-row"><input aria-label="房间号" placeholder="输入房间号" value={roomCode} onChange={e => setRoomCode(e.target.value)}/><button className="secondary" disabled={busy || !roomCode.trim() || !endpoint.trim()} onClick={() => void connect('join')}>加入</button></div>{resumeToken && <button className="quiet wide" disabled={busy} onClick={() => void connect('reconnect')}>重新连接上次房间</button>}<p className="muted" role="status">{busy ? '首次连接可能需要约一分钟，请稍候。' : '创建房间后，把房间号发给朋友。'}</p></div>}
      </section>
    </div><section className="release-notes"><h2>更新日志 <small>v{version}</small></h2><ul><li>十字棋盘、切分转角与独立出场格，同色跳格和专属航线。</li><li>叠棋全体撞击、同归于尽、终点折返与连续三次六点。</li><li>每回合 60 秒，超时由式神完成本回合。</li><li>紫可选择短距传送，灵梦跳格后可发动浮游。</li></ul></section><CharacterCatalog/></main>}

    {lobby && <main className="lobby">
      <div className="lobby-title"><div><span className="eyebrow">四人房间</span><h1>{snapshot.roomId}</h1></div><button className="secondary" onClick={() => { void navigator.clipboard?.writeText(snapshot.roomId); setNotice('房间号已复制'); }}>复制房间号</button></div>
      <LobbySeats snapshot={snapshot} seat={seat} hostSeat={hostSeat} onManage={manageMember} onCharacter={character=>room.current?.send('lobby',{type:'character',character})}/>
      <div className="lobby-buttons"><button className="primary" onClick={() => room.current?.send('lobby', { type: 'ready' })}>{ownSeat?.ready ? '取消准备' : '准备好了'}</button>{seat === hostSeat && <><button className="secondary" onClick={() => room.current?.send('lobby', { type: 'bots' })}>补齐式神</button><button className="primary" disabled={snapshot.seats.length !== 4 || snapshot.seats.some(s => !s.ready)} onClick={() => room.current?.send('lobby', { type: 'start' })}>开始巡游</button></>}<button className="quiet" onClick={() => void leave()}>离开房间</button></div>
    </main>}

    {currentGame && acting && char && <main className="game-layout">
      <div className="player-strip">{currentGame.players.map(p => { const c = CHARACTERS[p.character], pieces = currentGame.pieces.filter(q => q.owner === p.id), completed = pieces.filter(q => q.progress === FINISH).length; return <div className={`player-card ${p.id === currentGame.current ? 'is-current' : ''}`} key={p.id} style={tint(COLORS[p.id])} aria-label={`P${p.id+1} ${p.name}`}><Glyph id={p.character} small/><div className="player-name"><strong>{p.name}{mode === 'online' && seat === p.id ? ' · 你' : ''}</strong><span>{c.name}{p.bot ? ' · 式神' : ''}</span></div><div className="player-progress"><strong>{completed}<small>/4</small></strong><span>{currentGame.rankings.includes(p.id) ? `第${currentGame.rankings.indexOf(p.id)+1}名` : currentGame.phase==='over'?'第4名':Math.max(0, p.activeAt - p.turns) ? `冷却 ${p.activeAt - p.turns}` : '符卡就绪'}</span></div><div className="player-effects">{p.character==='youmu'&&p.passiveAt>p.turns&&<span>净化 {p.passiveAt-p.turns}</span>}{p.character==='yukari'&&p.bufferUsed&&<span>缓冲已用</span>}{pieces.some(q=>q.shield!==null)&&<span>盾 {pieces.filter(q=>q.shield!==null).length}</span>}{pieces.some(q=>q.mark)&&<span>蝶 {pieces.filter(q=>q.mark).length}</span>}</div><div className="progress-dots">{pieces.map(q => <i key={q.id} className={q.progress === FINISH ? 'done' : q.progress >= 0 ? 'flying' : ''} title={`${c.short}${q.index + 1} · ${nodeAt(q)}`}/>)}</div></div>; })}</div>
      <section className={`board-panel ${mine && !inputLocked && (tab === 'cast' || currentGame.choice || selected || actions.some(a=>a.kind==='pass')) ? 'has-decision' : ''}`} aria-label="地图与操作">
        <div className={`map-stage ${presentation.beat?.spell?.character==='remilia'&&!presentation.spell?'is-fate':''}`}>
          <Suspense fallback={<div className="board-canvas loading-board">正在展开幻想乡…</div>}><Board key={currentGame.players.map(p => p.character).join('-')} game={currentGame} preview={hover ?? armed} selected={selected} picked={targets} zoom={zoom} viewReset={viewReset} focusRequest={focusRequest} eligible={eligible} destinations={destinations} menu={mapMenu} beat={presentation.beat} declaring={!!presentation.spell} effects={presentationSettings.effects} closeup={presentationSettings.closeup} onPiece={choosePiece} onNode={chooseNode} onAction={a=>{setMapMenu(null);if(tab==='cast'&&!currentGame.choice)setArmed(a);else send(a.command);}} onZoom={setZoom} onCloseMenu={()=>setMapMenu(null)}/></Suspense>
          <div className="board-topline"><span><i className="live-dot"/>第 {currentGame.round} 轮 <b>·</b> {acting.name}</span></div>
          {currentGame.phase!=='over'&&<div className={`turn-timer ${time&&time.remainingMs<=5000?'is-urgent':''} ${time?.takeover?'is-takeover':''}`} role="timer" aria-label="本回合剩余时间">{time?.takeover?'式神托管':<>{Math.ceil((time?.remainingMs??60000)/1000)}<span>s</span></>}</div>}
          <div className="map-tools"><button aria-label="演出设置" title="演出设置" onClick={()=>setSettingsOpen(true)}>⚙</button><span/><button aria-label="定位当前棋子" title="定位当前棋子" onClick={()=>setFocusRequest(n=>n+1)}>◎</button><span/><button aria-label="缩小地图" onClick={()=>setZoom(Math.max(1,zoom-.25))}>−</button><button aria-label="查看全图" onClick={()=>{setZoom(1);setViewReset(n=>n+1);}}>{Math.round(zoom*100)}%</button><button aria-label="放大地图" onClick={()=>setZoom(Math.min(3,zoom+.25))}>＋</button>{mode==='online'&&seat===hostSeat&&<><span/><button className="room-manage-button" onClick={()=>setMembersOpen(true)}>房间管理</button></>}</div>
          {currentGame.phase!=='over'&&<div className="game-controls">
            <button className={`spell-launcher ${skillActions.length && mine && !inputLocked ? 'available' : ''}`} aria-label="查看符卡" aria-expanded={spellOpen} aria-controls="spell-window" onClick={()=>{setSpellOpen(!spellOpen);}}><Glyph id={acting.character} small/><span><strong>{char.active}</strong><small>{spellStatus}</small></span><span className="spell-expand">{spellOpen?'−':'＋'}</span></button>
            <DiceDock game={currentGame} mine={mine} online={mode==='online'} busy={inputLocked} rolling={presentation.rolling} face={presentation.face} reveal={presentation.reveal} onRoll={()=>send({type:'roll'})}/>
          </div>}
          {mine&&!inputLocked&&currentGame.phase==='action'&&tab==='move'&&!currentGame.choice&&!selected&&<div className="map-prompt" role="status">选择发光的棋子</div>}
          {mine&&!inputLocked&&currentGame.phase!=='over'&&(tab==='cast'||currentGame.choice||selected||actions.some(a=>a.kind==='pass'))&&<div className="map-decision" role="region" aria-label="当前操作">
            <div className="decision-heading"><strong>{advanceChoice && advanceActivated ? selected ? '选择推进落点' : '选择推进棋子' : currentGame.choice?.prompt || (tab==='cast' ? armed ? armed.label : selected ? '选择目标或落点' : acting.character==='reimu' ? '选择结界目标' : '选择施法棋子' : '选择落点')}</strong>{!currentGame.choice&&(tab==='cast'||selected)&&<button aria-label="取消当前选择" onClick={cancelSelection}>×</button>}</div>
            <div className="decision-buttons">
              {tab==='cast'&&!currentGame.choice&&<>
                {selectedSkills.length>1&&<div className="branch-options">{selectedSkills.map(a=><button key={a.id} className={armed?.id===a.id?'selected':''} onClick={()=>setArmed(a)}>{a.detail || a.label}</button>)}</div>}
                <button className="quiet" onClick={cancelSelection}>取消</button><button className="primary" disabled={!armed} onClick={()=>armed&&send(armed.command)}>施放{char.active}</button>
              </>}
              {tab==='move'&&!currentGame.choice&&selected&&actionsForPiece(mapActions,selected).some(a=>a.command.type==='move'&&(a.command.cleanse||a.command.splitPiece))&&<div className="branch-options">{actionsForPiece(mapActions,selected).map(a=><button key={a.id} onMouseEnter={()=>setHover(a)} onMouseLeave={()=>setHover(null)} onClick={()=>send(a.command)}>{a.detail} → {a.nodes.at(-1)}</button>)}</div>}
              {currentGame.choice&&actions.filter(a=>!a.nodes.length).map(a=><button className="secondary" key={a.id} onClick={()=>send(a.command)}>{a.label}</button>)}
              {advanceChoice&&!advanceActivated&&<button className="primary" disabled={!advanceActions.length} onClick={activateAdvance}>{`发动${char.passive}`}</button>}
              {tab==='move'&&!currentGame.choice&&actions.filter(a=>a.kind==='pass').map(a=><button className="secondary" key={a.id} onClick={()=>send(a.command)}>{a.label}</button>)}
            </div>
          </div>}


          {spellOpen&&currentGame.phase!=='over'&&<aside id="spell-window" className="floating-window spell-window" role="dialog" aria-label="符卡详情">
            <div className="window-heading"><h3>符卡</h3><button aria-label="关闭符卡" onClick={()=>setSpellOpen(false)}>×</button></div>
            <div className="character-portrait"><img src={publicAsset(`characters/${acting.character}-portrait.svg`)} alt={char.name}/><div><h2>{char.name}</h2></div></div>
            <div className="spell-content"><h3>{char.active}</h3><p className="spell-description">{char.activeText}</p><button className="primary wide" disabled={!mine||inputLocked||!skillActions.length} onClick={openSkill}>{skillActions.length&&mine?'选择目标':spellStatus}</button>
              <div className="passive-card"><span>被动</span><strong>{char.passive}{char.cleanseCooldown && acting.passiveAt>acting.turns ? ` · 冷却 ${acting.passiveAt-acting.turns}` : currentGame.flags.used.float || currentGame.flags.used.publicMove && char.splitThreshold ? ' · 已用' : ''}</strong><p>{char.passiveText}</p></div>
              {currentGame.rankings.length>0&&<ol className="standings live-standings">{currentGame.rankings.map(id=><li key={id}>{currentGame.players[id].name}</li>)}</ol>}
            </div>
          </aside>}
          <GameLog game={currentGame} expanded={logOpen} onExpanded={setLogOpen}/>
          {presentation.spell&&<SpellCutIn spell={presentation.spell}/>}
          {currentGame.phase==='over'&&<section className="floating-window result-window" role="dialog" aria-label="巡游结束"><div className="winner"><span>✦</span><h2>巡游结束</h2><ol className="standings">{[...currentGame.rankings,...currentGame.players.filter(p=>!currentGame.rankings.includes(p.id)).map(p=>p.id)].map(id=><li key={id}>{currentGame.players[id].name}</li>)}</ol>{mode==='local'||seat===hostSeat?<button className="primary wide" onClick={()=>mode==='online'?room.current?.send('rematch'):setGame(null)}>再来一局</button>:<p>等待房主开启下一局</p>}</div></section>}
        </div>
      </section>

    </main>}
    <footer className="site-footer"><span>幻想乡巡游</span><button className="footer-settings" onClick={()=>setSettingsOpen(true)}>演出设置</button><span>规则 {VERSIONS.rules} · 地图 {VERSIONS.map}</span></footer>
    {settingsOpen&&<PresentationSettingsDialog settings={presentationSettings} onChange={setPresentationSettings} onClose={()=>setSettingsOpen(false)} onReturnToLobby={currentGame||lobby?()=>{void leave();}:undefined}/>}
    {membersOpen&&mode==='online'&&snapshot&&<RoomMembersDialog snapshot={snapshot} seat={seat} hostSeat={hostSeat} onManage={manageMember} onClose={()=>setMembersOpen(false)}/>}
  </div>;
}



