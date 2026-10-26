import { DecisionClock, remainingTime, type DecisionTime } from '../../../packages/session/decisionClock';
import { PlayClock, elapsedPlayTime, formatPlayTime, type PlayTime } from '../../../packages/session/playClock';
import { playSound } from './audio';
import { setMusic } from './music';
import { FINISH } from '../../../packages/core/constants';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Client, type Room } from '@colyseus/sdk';
const Board = lazy(() => import('./Board'));
import { version } from '../../../package.json';
import { CHARACTERS, CHARACTER_LIST } from '../../../packages/content';
import { createGame, getActions, reduceGame } from '../../../packages/core/engine';
import { COLORS, nodeAt } from '../../../packages/core/map';
import { VERSIONS, type Action, type CharacterId, type Command, type GameState } from '../../../packages/core/types';
import { botAction, loadGame, saveGame, ROOM_KICKED_CODE, type RoomSnapshot } from '../../../packages/session';
import { Dialog, TitleScreen } from './TitleScreen';
import { PlayerDetails, playerIdentity } from './PlayerDetails';
import { previewAction } from './movePreview';
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
  { name: '玩家一', character: 'reimu', bot: false }, { name: '机器人 2', character: 'marisa', bot: true },
  { name: '机器人 3', character: 'flandre', bot: true }, { name: '机器人 4', character: 'yuyuko', bot: true }
];
const tint = (color: string) => ({ '--accent': color } as CSSProperties);
function Glyph({ id, small = false }: { id: CharacterId; small?: boolean }) { const c = CHARACTERS[id]; return <span className={`glyph ${small ? 'small' : ''}`} style={tint(c.color)}><img src={publicAsset(`characters/${id}-chibi.svg`)} alt={c.short}/></span>; }

export default function App() {
  const [presentationSettings, setPresentationSettings] = usePresentationSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<number|null>(null);
  const submitting = useRef(false);
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
  const playClock=useRef<PlayClock | null>(null);
  const onlineTime=useRef<DecisionTime | null>(null);
  const onlinePlayTime=useRef<PlayTime | null>(null);
  const [time,setTime]=useState<DecisionTime | null>(null);
  const [elapsedMs,setElapsedMs]=useState(0);
  const lastBeep=useRef('');
  const sourceGame = mode === 'online' ? snapshot?.game ?? null : game;
  const inMatch = !!sourceGame;
  useEffect(() => { setMusic(inMatch ? 'game' : 'title'); }, [inMatch]);
  const presentation = useGamePresentation(sourceGame, presentationSession);
  const currentGame = presentation.game;
  const inputLocked = presentation.busy || pendingRevision !== null || (mode==='online'&&!!time&&Date.now()<time.blockedUntil) || (mode==='local'&&settingsOpen);
  const actions = useMemo(()=>currentGame ? getActions(currentGame, CHARACTERS) : [],[currentGame]);
  const preview = useMemo(()=>currentGame ? previewAction(currentGame, hover??armed) : null,[currentGame,hover,armed]);
  const mine = !!currentGame && (mode === 'local' ? !currentGame.players[currentGame.current].bot&&!time?.takeover : seat === currentGame.current&&!time?.takeover);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { setArmed(null); setHover(null); setSelected(null); setTab('move'); setTargets([]); setMapMenu(null); setAdvanceActivated(false); }, [currentGame, mode]);
  useEffect(() => { setPendingRevision(null); submitting.current=false; }, [sourceGame?.revision, mode]);
  useEffect(() => { setSpellOpen(false); }, [currentGame?.turn]);
  useEffect(() => {
    if (pendingRevision === null) return;
    const timer = setTimeout(() => { submitting.current=false; setPendingRevision(null); setNotice('服务器尚未确认操作，请检查连接后重试'); }, 8000);
    return () => clearTimeout(timer);
  }, [pendingRevision]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSpellOpen(false); setLogOpen(false); setTab('move'); setSelected(null); setTargets([]); setArmed(null); setHover(null); setMapMenu(null); setAdvanceActivated(false); } };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, []);
  useEffect(() => {
    if(!sourceGame)return;
    let lastSave=0;
    const tick=()=>{
      const now=Date.now();let value:DecisionTime|null=null;
      if(mode==='local'){
        decisionClock.current??=new DecisionClock(sourceGame.turn,now);
        playClock.current??=new PlayClock(now);
        value=decisionClock.current.update(sourceGame,now,settingsOpen||presentation.busy);
        const playTime=playClock.current.update(sourceGame,now,settingsOpen);
        setElapsedMs(playTime.elapsedMs);
        if(now-lastSave>=1000){try{localStorage.setItem('party-save-v060',saveGame(sourceGame,value,playTime));lastSave=now;}catch{/* optional autosave */}}
      }else{
        if(onlineTime.current)value={...onlineTime.current,remainingMs:remainingTime(onlineTime.current,now),at:now};
        setElapsedMs(onlinePlayTime.current?elapsedPlayTime(onlinePlayTime.current,now):0);
      }
      setTime(value);
      const second=value?Math.ceil(value.remainingMs/1000):60,key=`${value?.turn}-${second}`;
      if(value&&!value.paused&&now>=value.blockedUntil&&!value.takeover&&second>=1&&second<=5&&key!==lastBeep.current){lastBeep.current=key;playSound('timeout',.8);}
    };
    tick();const interval=setInterval(tick,100);return()=>clearInterval(interval);
  },[sourceGame,mode,settingsOpen,presentation.busy]);
  useEffect(() => {
    if(mode!=='local'||!sourceGame)return;
    const save=()=>{
      const now=Date.now();
      try { localStorage.setItem('party-save-v060',saveGame(sourceGame,decisionClock.current?.update(sourceGame,now,settingsOpen||presentation.busy),playClock.current?.update(sourceGame,now,settingsOpen))); } catch { /* optional autosave */ }
    };
    const hidden=()=>{if(document.hidden)save();};
    window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('pagehide',save);document.removeEventListener('visibilitychange',hidden);};
  },[sourceGame,mode,settingsOpen,presentation.busy]);
  useEffect(() => {
    if (mode !== 'local' || !game || game.phase === 'over' || (!game.players[game.current].bot&&!time?.takeover) || settingsOpen || presentation.busy || currentGame?.revision !== game.revision) return;
    const timer = setTimeout(() => {
      try { setGame(reduceGame(game, botAction(game).command, CHARACTERS)); } catch (error) { setSettingsOpen(true); setNotice(String(error)); }
    }, game.phase === 'roll' ? 850 : 650);
    return () => clearTimeout(timer);
  }, [game, settingsOpen, mode, presentation.busy, currentGame?.revision,time?.takeover]);

  function send(command: Command) {
    if (!currentGame || !mine || inputLocked || submitting.current || currentGame.revision !== sourceGame?.revision) return;
    submitting.current=true;
    try {
      if (mode === 'online') { if (!room.current) {submitting.current=false;return;} setPendingRevision(currentGame.revision); room.current.send('command', { revision: currentGame.revision, command }); }
      else setGame(reduceGame(currentGame, command, CHARACTERS));
      setArmed(null); setHover(null);
    } catch (error) { submitting.current=false; setPendingRevision(null); setNotice(error instanceof Error ? error.message : String(error)); }
  }
  function startLocal() {
    const next = roster.map((p,i)=>({...p,name:p.name.trim()||(p.bot?`机器人 ${i+1}`:`玩家 ${i+1}`)}));
    if(next.every(p=>p.bot)){setNotice('请至少保留一位玩家');return;}
    if (new Set(next.map(p => p.character)).size !== 4) { setNotice('请选择四名不同的角色'); return; }
    decisionClock.current=null;playClock.current=new PlayClock();setElapsedMs(0);setTime(null);setPresentationSession(n=>n+1);
    setMode('local');setGame(createGame(next, CHARACTERS, {opening:true}));
  }
  const savedGame = useMemo(()=>sourceGame?null:localStorage.getItem('party-save-v060') || localStorage.getItem('party-save-v050') || localStorage.getItem('party-save-v031') || localStorage.getItem('party-save-v03') || localStorage.getItem('party-save'),[sourceGame]);
  let canContinue=false;
  if(savedGame){try{canContinue=loadGame(savedGame).phase!=='over';}catch{/* retained incompatible save */}}
  function resumeLocal(){
    if(!savedGame)return;
    try{const loaded=loadGame(savedGame),saved=JSON.parse(savedGame),now=Date.now();decisionClock.current=new DecisionClock(loaded.turn,now,saved.timer);playClock.current=new PlayClock(now,saved.playTime,true);setElapsedMs(playClock.current.value.elapsedMs);setTime(null);setPresentationSession(n=>n+1);setMode('local');setGame(loaded);setSettingsOpen(true);}catch(error){setNotice(String(error));}
  }
  function bindRoom(joined: Room, address: string) {
    room.current = joined;
    sessionStorage.setItem('party-reconnect', joined.reconnectionToken); sessionStorage.setItem('party-endpoint', address); setResumeToken(joined.reconnectionToken);
    joined.onMessage('welcome', (data: { seat: number }) => setSeat(data.seat));
    onlineTime.current=null;onlinePlayTime.current=null;setElapsedMs(0);setTime(null);
    const syncTime=(timer:DecisionTime|undefined,playTime:PlayTime|undefined,serverTime=Date.now())=>{
      const now=Date.now();
      if(timer){onlineTime.current={...timer,at:now,blockedUntil:now+Math.max(0,timer.blockedUntil-serverTime)};setTime(onlineTime.current);}
      if(playTime){onlinePlayTime.current={...playTime,elapsedMs:elapsedPlayTime(playTime,serverTime),at:now};setElapsedMs(onlinePlayTime.current.elapsedMs);}
    };
    joined.onMessage('timer',(data:{timer:DecisionTime;playTime?:PlayTime;serverTime:number})=>syncTime(data.timer,data.playTime,data.serverTime));
    joined.onMessage('snapshot', (s: RoomSnapshot) => {
      if (s.protocol !== VERSIONS.protocol || s.rules !== VERSIONS.rules) { setNotice('房间版本不兼容'); void joined.leave(); return; }
      if(!s.game){onlineTime.current=null;onlinePlayTime.current=null;setElapsedMs(0);setTime(null);}
      syncTime(s.timer,s.playTime,s.serverTime);setSnapshot(s);
      sessionStorage.setItem('party-reconnect', joined.reconnectionToken); setResumeToken(joined.reconnectionToken);
    });
    joined.onMessage('notice', (text: string) => {submitting.current=false;setPendingRevision(null);setNotice(text);});
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
      const now=Date.now();
      try {localStorage.setItem('party-save-v060',saveGame(game,decisionClock.current?.update(game,now,true),playClock.current?.update(game,now,true)));}catch{/* optional autosave */}
    }
    setSettingsOpen(false);setSpellOpen(false);setLogOpen(false);setDetailPlayer(null);setPendingRevision(null);submitting.current=false;
    const active=room.current;room.current=null;
    sessionStorage.removeItem('party-reconnect');setResumeToken('');
    setSnapshot(null); setSeat(null); setGame(null); setMode('local');setMembersOpen(false);
    try {await active?.leave();}catch(error){setNotice(error instanceof Error?error.message:'离开房间失败');}
  }
  function manageMember(action: MemberAction) { room.current?.send('manage',action); }
  function importSave(file: File) {
    void file.text().then(text => { try { const loaded=loadGame(text),saved=JSON.parse(text),now=Date.now(); setPresentationSession(n=>n+1); decisionClock.current=new DecisionClock(loaded.turn,now,saved.timer);playClock.current=new PlayClock(now,saved.playTime,true);setElapsedMs(playClock.current.value.elapsedMs);setTime(null);setGame(loaded); setMode('local'); setSettingsOpen(true); } catch (error) { setNotice(String(error)); } });
  }
  const lobby = mode === 'online' && snapshot && !snapshot.game;
  const ownSeat = snapshot?.seats.find(s => s.id === seat);
  const hostSeat = snapshot?.hostSeat === undefined ? snapshot?.seats.filter(s => s.connected && !s.bot).sort((a, b) => a.id - b.id)[0]?.id : snapshot.hostSeat;
  const acting = currentGame?.players[currentGame.current];
  const char = acting ? CHARACTERS[acting.character] : null;
  const operator=currentGame ? currentGame.players[mode==='online'&&seat!==null?seat:currentGame.current] : null;
  const operatorChar=operator?CHARACTERS[operator.character]:null;
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
      if (options.length) {setSelected(id);setArmed(options[0]);}
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
    if(options.length) {setSelected(id);setArmed(options[0]);setHover(null);}
    else {const p=currentGame.pieces.find(p=>p.id===id);if(p&&destinations.includes(nodeAt(p))) chooseNode(nodeAt(p));}
  }
  function chooseNode(node:string) {
    if(!mine || inputLocked || advanceChoice && !advanceActivated) return;
    const options = tab==='cast'&&!currentGame?.choice ? casterActions.filter(a=>a.command.type==='cast'&&exactTargets(a,targets)&&a.nodes.at(-1)===node)
      : destinationActions(selected?actionsForPiece(mapActions,selected):mapActions,node);
    if(options.length===1) {setArmed(options[0]);setSelected(options[0].pieces[0]??selected);}
    else if(options.length) setMapMenu({node,actions:options});
  }
  function openSkill() {setSpellOpen(false);setTab('cast');setSelected(null);setTargets([]);setMapMenu(null);setArmed(skillActions.length===1?skillActions[0]:null);}
  function activateAdvance() {
    if (!mine || inputLocked || !advanceActions.length) return;
    if (advanceActions.length === 1) {setAdvanceActivated(true);setSelected(advanceActions[0].pieces[0]);setArmed(advanceActions[0]);}
    else { setAdvanceActivated(true); setSelected(advancePieces.length === 1 ? advancePieces[0] : null); }
  }
  function cancelSelection() { setTab('move'); setSelected(null); setTargets([]); setArmed(null); setHover(null); setMapMenu(null); setAdvanceActivated(false); }
  const spellStatus = !currentGame || !operator ? '' : Math.max(0, operator.activeAt - operator.turns)
    ? `冷却 ${operator.activeAt - operator.turns} 回合` : time?.takeover&&operator.id===currentGame.current ? '本回合机器人托管' : !mine ? '等待你的回合'
    : currentGame.phase==='opening' ? '开局掷骰中' : currentGame.flags.active ? '本回合已使用'
    : currentGame.phase === 'roll' ? '掷骰后可用' : !currentGame.flags.first ? '追加行动不可用'
    : skillActions.length ? '可以施放' : '无可选目标';

  return <div className="app-shell">
    {lobby&&<header className="topbar"><a className="brand" href="#" onClick={e => { e.preventDefault(); if (!currentGame && !lobby) return; if (confirm('返回大厅？当前本地对局会自动保存。')) void leave(); }}><span className="torii">⛩</span><span>幻想乡巡游<small>东方派对</small></span></a>
      <div className="header-actions">{currentGame ? <span className="mode-pill">{mode === 'online' ? `四人房间 · ${snapshot?.roomId}` : currentGame.players.filter(p=>!p.bot).length===1?'单人对局':'同机对局'}</span> : <span className="version">v{version}</span>}</div>
    </header>}
    {notice && <div className="toast" role="alert">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <input type="file" accept=".json" hidden ref={fileInput} onChange={e => { const f = e.target.files?.[0]; if (f) importSave(f); e.target.value = ''; }} />

    {!currentGame && !lobby && <TitleScreen canContinue={canContinue} onContinue={resumeLocal} onSettings={()=>setSettingsOpen(true)} local={<><div className="roster">{roster.map((p,i)=><div className="roster-row" key={i} style={tint(COLORS[i])}><span className="seat-number">{i+1}</span><Glyph id={p.character}/><div className="roster-fields"><input aria-label={`玩家${i+1}名字`} value={p.name} maxLength={16} onChange={e=>setRoster(roster.map((q,j)=>i===j?{...q,name:e.target.value}:q))}/><select aria-label={`玩家${i+1}角色`} value={p.character} onChange={e=>setRoster(roster.map((q,j)=>i===j?{...q,character:e.target.value as CharacterId}:q))}>{CHARACTER_LIST.map(c=><option key={c.id} value={c.id} disabled={roster.some((q,j)=>j!==i&&q.character===c.id)}>{c.name}</option>)}</select></div><select className="seat-control" aria-label={`席位${i+1}控制方式`} value={p.bot?'bot':'player'} onChange={e=>setRoster(roster.map((q,j)=>i===j?{...q,bot:e.target.value==='bot',name:/^(玩家[一二三四]|玩家 \d|机器人 \d)$/.test(q.name)?`${e.target.value==='bot'?'机器人':'玩家'} ${i+1}`:q.name}:q))}><option value="player">玩家</option><option value="bot">机器人</option></select></div>)}</div><button className="primary wide" onClick={startLocal}>开始巡游</button><div className="setup-links"><button onClick={()=>fileInput.current?.click()}>导入存档</button></div></>} online={<div className="online-form"><label>名字<input value={name} maxLength={16} onChange={e => setName(e.target.value)}/></label><details className="room-settings" open={!import.meta.env.VITE_ROOM_SERVER_URL}><summary>连接设置</summary><label>房间服务<input value={endpoint} disabled={busy} placeholder="wss://你的房间服务" onChange={e => setEndpoint(e.target.value)}/></label></details><button className="primary wide" disabled={busy || !endpoint.trim()} onClick={() => void connect('create')}>{busy ? '正在连接…' : '创建房间'}</button><div className="join-row"><input aria-label="房间号" placeholder="输入房间号" value={roomCode} onChange={e => setRoomCode(e.target.value)}/><button className="secondary" disabled={busy || !roomCode.trim() || !endpoint.trim()} onClick={() => void connect('join')}>加入</button></div>{resumeToken && <button className="quiet wide" disabled={busy} onClick={() => void connect('reconnect')}>重新连接上次房间</button>}<p className="muted" role="status">{busy ? '首次连接可能需要约一分钟，请稍候。' : '创建房间后，把房间号发给朋友。'}</p></div>}/>}

    {lobby && <main className="lobby">
      <div className="lobby-title"><div><span className="eyebrow">四人房间</span><h1>{snapshot.roomId}</h1></div><button className="secondary" onClick={() => { void navigator.clipboard?.writeText(snapshot.roomId); setNotice('房间号已复制'); }}>复制房间号</button></div>
      <LobbySeats snapshot={snapshot} seat={seat} hostSeat={hostSeat} onManage={manageMember} onCharacter={character=>room.current?.send('lobby',{type:'character',character})}/>
      <div className="lobby-buttons"><button className="primary" onClick={() => room.current?.send('lobby', { type: 'ready' })}>{ownSeat?.ready ? '取消准备' : '准备好了'}</button>{seat === hostSeat && <><button className="secondary" onClick={() => room.current?.send('lobby', { type: 'bots' })}>补齐机器人</button><button className="primary" disabled={snapshot.seats.length !== 4 || snapshot.seats.some(s => !s.ready)} onClick={() => room.current?.send('lobby', { type: 'start' })}>开始巡游</button></>}<button className="quiet" onClick={() => void leave()}>离开房间</button></div>
    </main>}

    {currentGame && acting && char && <main className="game-layout">
      <div className="player-strip">{currentGame.players.map(p=>{const completed=currentGame.pieces.filter(q=>q.owner===p.id&&q.progress===FINISH).length;return <button className={`player-card ${p.id===currentGame.current?'is-current':''}`} key={p.id} style={tint(COLORS[p.id])} onClick={()=>setDetailPlayer(p.id)} aria-label={`P${p.id+1} ${playerIdentity(currentGame,p.id)} 详情`}><Glyph id={p.character} small/><span className="player-name"><strong title={playerIdentity(currentGame,p.id)}><span className="seat-display-name">{p.name}</span><span className="seat-character-name">({CHARACTERS[p.character].name})</span></strong><span>P{p.id+1}{mode==='online'&&seat===p.id?' · 你':''}{p.bot?' · 机器人':''}</span></span><span className="player-progress"><strong>完成 {completed}/4</strong>{currentGame.rankings.includes(p.id)&&<span>第{currentGame.rankings.indexOf(p.id)+1}名</span>}</span></button>;})}</div>
      <section className={`board-panel ${mine && !inputLocked && (tab === 'cast' || currentGame.choice || selected || actions.some(a=>a.kind==='pass')) ? 'has-decision' : ''}`} aria-label="地图与操作">
        <div className={`map-stage ${presentation.beat?.spell?.character==='remilia'&&!presentation.spell?'is-fate':''}`}>
          {currentGame.phase==='opening'?<section className="opening-order" aria-label="开局掷骰"><h2>掷骰决定行动顺序</h2><p>{currentGame.opening!.round>1?'平点玩家继续掷骰':'点数从大到小行动'}</p><ol>{currentGame.players.map(p=><li key={p.id} className={p.id===currentGame.current?'is-current':''}><span>P{p.id+1} {playerIdentity(currentGame,p.id)}</span><strong>{currentGame.opening!.rolls.filter(r=>r.seat===p.id).map(r=>r.value).join(' → ')||'—'}</strong></li>)}</ol></section>:<Suspense fallback={<div className="board-canvas loading-board">正在展开幻想乡…</div>}><Board key={currentGame.players.map(p => p.character).join('-')} game={currentGame} preview={preview} selected={selected} picked={targets} zoom={zoom} viewReset={viewReset} focusRequest={focusRequest} eligible={eligible} destinations={destinations} menu={mapMenu} beat={presentation.beat} declaring={!!presentation.spell} effects={presentationSettings.effects} closeup={presentationSettings.closeup} onPiece={choosePiece} onNode={chooseNode} onAction={a=>{setMapMenu(null);setArmed(a);if(tab!=='cast')setSelected(a.pieces[0]??null);}} onZoom={setZoom} onCloseMenu={()=>setMapMenu(null)}/></Suspense>}
          <div className="board-topline"><span className="round-status"><span className="round-time">{currentGame.phase==='opening'?'开局':`第 ${currentGame.round} 轮`}<time className="play-timer" role="timer" aria-label="对局游玩时间" title="对局游玩时间">{formatPlayTime(elapsedMs)}</time></span><strong>{playerIdentity(currentGame,currentGame.current)}</strong></span>{currentGame.phase!=='over'&&<div className={`turn-timer ${time&&time.remainingMs<=5000?'is-urgent':''} ${time?.takeover?'is-takeover':''}`} role="timer" aria-label="本回合剩余时间">{time?.takeover?'机器人托管':<>{Math.ceil((time?.remainingMs??60000)/1000)}<span>s</span></>}</div>}{currentGame.phase!=='opening'&&<details className="order-details"><summary>行动顺序</summary><ol>{currentGame.turnOrder.map(id=><li key={id}>P{id+1} {playerIdentity(currentGame,id)}</li>)}</ol></details>}</div>
          <div className="map-tools"><button aria-label="对局菜单" title="对局菜单" onClick={()=>setSettingsOpen(true)}>⚙</button><span/><button aria-label="定位当前棋子" title="定位当前棋子" onClick={()=>setFocusRequest(n=>n+1)}>◎</button><span/><button aria-label="缩小地图" onClick={()=>setZoom(Math.max(1,zoom-.25))}>−</button><button aria-label="查看全图" onClick={()=>{setZoom(1);setViewReset(n=>n+1);}}>{Math.round(zoom*100)}%</button><button aria-label="放大地图" onClick={()=>setZoom(Math.min(3,zoom+.25))}>＋</button>{mode==='online'&&seat===hostSeat&&<><span/><button className="room-manage-button" onClick={()=>setMembersOpen(true)}>房间管理</button></>}</div>
          {currentGame.phase!=='over'&&<div className="game-controls">
            <button className={`spell-launcher ${skillActions.length && mine && !inputLocked ? 'available' : ''}`} aria-label="查看符卡" aria-expanded={spellOpen} aria-controls="spell-window" onClick={()=>{setSpellOpen(!spellOpen);}}><Glyph id={operator!.character} small/><span><strong>{operatorChar!.active}</strong><small>{spellStatus}</small></span><span className="spell-expand">{spellOpen?'−':'＋'}</span></button>
            <DiceDock game={currentGame} mine={mine} online={mode==='online'} busy={inputLocked} rolling={presentation.rolling} face={presentation.face} reveal={presentation.reveal} onRoll={()=>send({type:'roll'})}/>
          </div>}
          {mine&&!inputLocked&&currentGame.phase==='action'&&tab==='move'&&!currentGame.choice&&!selected&&<div className="map-prompt" role="status">选择棋子，预览后确认</div>}
          {mine&&!inputLocked&&currentGame.phase!=='over'&&(tab==='cast'||currentGame.choice||selected||actions.some(a=>a.kind==='pass'))&&<div className="map-decision" role="region" aria-label="当前操作">
            <div className="decision-heading"><strong>{advanceChoice && advanceActivated ? selected ? '选择推进落点' : '选择推进棋子' : currentGame.choice?.prompt || (tab==='cast' ? armed ? armed.label : selected ? '选择目标或落点' : acting.character==='reimu' ? '选择结界目标' : '选择施法棋子' : selected ? `${char.short} ${currentGame.pieces.find(p=>p.id===selected)!.index+1}` : '选择落点')}</strong>{!currentGame.choice&&(tab==='cast'||selected)&&<button aria-label="取消当前选择" onClick={cancelSelection}>×</button>}</div>
            <div className="decision-buttons">
              {tab==='cast'&&!currentGame.choice&&<>
                {selectedSkills.length>1&&<div className="branch-options">{selectedSkills.map(a=><button key={a.id} className={armed?.id===a.id?'selected':''} onClick={()=>setArmed(a)}>{a.detail || a.label}</button>)}</div>}
                <button className="quiet" onClick={cancelSelection}>取消</button><button className="primary" disabled={!armed||submitting.current} onClick={()=>armed&&send(armed.command)}>施放{char.active}</button>
              </>}
              {tab==='move'&&selected&&(!advanceChoice||advanceActivated)&&<>
                {actionsForPiece(mapActions,selected).length>1&&<div className="branch-options">{actionsForPiece(mapActions,selected).map(a=><button key={a.id} className={armed?.id===a.id?'selected':''} aria-pressed={armed?.id===a.id} onMouseEnter={()=>setHover(a)} onMouseLeave={()=>setHover(null)} onClick={()=>{setArmed(a);setHover(null);}}>{a.detail||a.label}</button>)}</div>}
                {preview?.summary&&<span className="preview-summary" role="status">{preview.summary}</span>}
                <button className="quiet" onClick={cancelSelection}>取消</button><button className="primary" disabled={!armed||submitting.current} onClick={()=>armed&&send(armed.command)}>{currentGame.choice?'确认选择':'确认移动'}</button>
              </>}
              {currentGame.choice&&actions.filter(a=>!a.nodes.length).map(a=><button className="secondary" key={a.id} onClick={()=>send(a.command)}>{a.label}</button>)}
              {advanceChoice&&!advanceActivated&&<button className="primary" disabled={!advanceActions.length} onClick={activateAdvance}>{`发动${char.passive}`}</button>}
              {tab==='move'&&!currentGame.choice&&actions.filter(a=>a.kind==='pass').map(a=><button className="secondary" key={a.id} onClick={()=>send(a.command)}>{a.label}</button>)}
            </div>
          </div>}


          {spellOpen&&currentGame.phase!=='over'&&<Dialog id="spell-window" title="符卡详情" onClose={()=>setSpellOpen(false)} className="spell-inspection">
            <div className="character-portrait"><img src={publicAsset(`characters/${operator!.character}-portrait.svg`)} alt={operatorChar!.name}/><div><h2>{operatorChar!.name}</h2></div></div>
            <div className="spell-content"><h3>{operatorChar!.active}</h3><p className="spell-description">{operatorChar!.activeText}</p><button className="primary wide" disabled={!mine||inputLocked||!skillActions.length} onClick={openSkill}>{skillActions.length&&mine?'选择目标':spellStatus}</button>
              <button className="quiet wide" onClick={()=>{setSpellOpen(false);setDetailPlayer(operator!.id);}}>查看角色与被动</button>
            </div>
          </Dialog>}
          <GameLog game={currentGame} expanded={logOpen} onExpanded={setLogOpen}/>
          {presentation.spell&&<SpellCutIn spell={presentation.spell}/>}
          {currentGame.phase==='over'&&<section className="floating-window result-window" role="dialog" aria-label="巡游结束"><div className="winner"><span>✦</span><h2>巡游结束</h2><ol className="standings">{[...currentGame.rankings,...currentGame.players.filter(p=>!currentGame.rankings.includes(p.id)).map(p=>p.id)].map(id=><li key={id}>{playerIdentity(currentGame,id)}</li>)}</ol>{mode==='local'||seat===hostSeat?<button className="primary wide" onClick={()=>mode==='online'?room.current?.send('rematch'):setGame(null)}>再来一局</button>:<p>等待房主开启下一局</p>}</div></section>}
        </div>
      </section>

    </main>}
    {!currentGame&&lobby&&<footer className="site-footer"><span>幻想乡巡游</span><button className="footer-settings" onClick={()=>setSettingsOpen(true)}>设置</button><span>规则 {VERSIONS.rules} · 地图 {VERSIONS.map}</span></footer>}
    {settingsOpen&&<PresentationSettingsDialog settings={presentationSettings} onChange={setPresentationSettings} onClose={()=>setSettingsOpen(false)} inGame={!!currentGame} online={mode==='online'} onReturnToLobby={currentGame||lobby?()=>{void leave();}:undefined}/>}
    {detailPlayer!==null&&currentGame&&<PlayerDetails game={currentGame} id={detailPlayer} onClose={()=>setDetailPlayer(null)}/>}
    {membersOpen&&mode==='online'&&snapshot&&<RoomMembersDialog snapshot={snapshot} seat={seat} hostSeat={hostSeat} onManage={manageMember} onClose={()=>setMembersOpen(false)}/>}
  </div>;
}



