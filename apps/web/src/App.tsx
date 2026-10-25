import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Client, type Room } from '@colyseus/sdk';
const Board = lazy(() => import('./Board'));
import { version } from '../../../package.json';
import { CHARACTERS, CHARACTER_LIST } from '../../../packages/content';
import { createGame, getActions, reduceGame } from '../../../packages/core/engine';
import { COLORS, nodeAt } from '../../../packages/core/map';
import { VERSIONS, type Action, type CharacterId, type Command, type GameState } from '../../../packages/core/types';
import { botAction, loadGame, saveGame, type RoomSnapshot } from '../../../packages/session';
import { CharacterCatalog } from './CharacterCatalog';
import { publicAsset } from './assets';
import { defaultRoomEndpoint, validateRoomEndpoint } from './connection';
import { actionsForPiece, destinationActions } from './boardModel';

type Roster = { name: string; character: CharacterId; bot: boolean }[];
const DEFAULTS: Roster = [
  { name: '玩家一', character: 'reimu', bot: false }, { name: '玩家二', character: 'marisa', bot: false },
  { name: '玩家三', character: 'flandre', bot: false }, { name: '玩家四', character: 'yuyuko', bot: false }
];
const tint = (color: string) => ({ '--accent': color } as CSSProperties);
function Glyph({ id, small = false }: { id: CharacterId; small?: boolean }) { const c = CHARACTERS[id]; return <span className={`glyph ${small ? 'small' : ''}`} style={tint(c.color)}><img src={publicAsset(`characters/${id}-chibi.svg`)} alt={c.short}/></span>; }

export default function App() {
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
  const [mapMenu,setMapMenu] = useState<{node:string;actions:Action[]} | null>(null);
  const [viewReset,setViewReset] = useState(0);
  const [zoom, setZoom] = useState(1), [logOpen, setLogOpen] = useState(false), [paused, setPaused] = useState(false);
  const [resumeToken, setResumeToken] = useState(sessionStorage.getItem('party-reconnect') || '');
  const fileInput = useRef<HTMLInputElement>(null);
  const currentGame = mode === 'online' ? snapshot?.game ?? null : game;
  const actions = currentGame ? getActions(currentGame, CHARACTERS) : [];
  const mine = !!currentGame && (mode === 'local' ? !currentGame.players[currentGame.current].bot : seat === currentGame.current);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { setArmed(null); setHover(null); setSelected(null); setTab('move'); setTargets([]);  setMapMenu(null); }, [currentGame, mode]);
  useEffect(() => { if (game && mode === 'local' ) { try { localStorage.setItem('party-save-v031', saveGame(game)); } catch { /* optional autosave */ } } }, [game, mode]);
  useEffect(() => {
    if (mode !== 'local' || !game || game.phase === 'over' || !game.players[game.current].bot || paused) return;
    const timer = setTimeout(() => {
      try { setGame(reduceGame(game, botAction(game).command, CHARACTERS)); } catch (error) { setPaused(true); setNotice(String(error)); }
    }, game.phase === 'roll' ? 850 : 650);
    return () => clearTimeout(timer);
  }, [game, paused, mode]);

  function send(command: Command) {
    if (!currentGame) return;
    try {
      if (mode === 'online') room.current?.send('command', { revision: currentGame.revision, command });
      else setGame(reduceGame(currentGame, command, CHARACTERS));
      setArmed(null); setHover(null);
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  }
  function startLocal(bots: boolean) {
    const next = roster.map((p, i) => ({ ...p, bot: bots ? i !== 0 : p.bot }));
    if (new Set(next.map(p => p.character)).size !== 4) { setNotice('请选择四名不同的角色'); return; }
    for (let i = 3; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [next[i], next[j]] = [next[j], next[i]]; }
    setMode('local'); setPaused(false); setGame(createGame(next, CHARACTERS));
  }
  function bindRoom(joined: Room) {
    room.current = joined;
    sessionStorage.setItem('party-reconnect', joined.reconnectionToken); sessionStorage.setItem('party-endpoint', endpoint); setResumeToken(joined.reconnectionToken);
    joined.onMessage('welcome', (data: { seat: number }) => setSeat(data.seat));
    joined.onMessage('snapshot', (s: RoomSnapshot) => {
      if (s.protocol !== VERSIONS.protocol || s.rules !== VERSIONS.rules) { setNotice('房间版本不兼容'); void joined.leave(); return; }
      setSnapshot(s);
      sessionStorage.setItem('party-reconnect', joined.reconnectionToken); setResumeToken(joined.reconnectionToken);
    });
    joined.onMessage('notice', (text: string) => setNotice(text));
    joined.onLeave(() => { setNotice('已离开房间，可尝试重新连接'); });
    joined.onError((_code: number, message?: string) => setNotice(message || '房间连接异常'));
    joined.send('sync'); setMode('online');
  }
  async function connect(kind: 'create' | 'join' | 'reconnect') {
    setBusy(true);
    try {
      const address=validateRoomEndpoint(kind === 'reconnect' ? sessionStorage.getItem('party-endpoint') || endpoint : endpoint,location.protocol);
      const client = new Client(address);
      const joined = kind === 'create' ? await client.create('party', { name, protocol: VERSIONS.protocol }) : kind === 'join' ? await client.joinById(roomCode.trim(), { name, protocol: VERSIONS.protocol }) : await client.reconnect(resumeToken);
      bindRoom(joined);
    } catch (error) { setNotice(`连接失败：${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  }
  async function leave() {
    if (room.current) { await room.current.leave(); room.current = null; sessionStorage.removeItem('party-reconnect'); setResumeToken(''); }
    setSnapshot(null); setSeat(null); setGame(null); setMode('local'); 
  }
  function importSave(file: File) {
    void file.text().then(text => { try { setGame(loadGame(text)); if(JSON.parse(text).format===2)setNotice('未结束旧对局已验证迁移，决出前三名后结束'); setMode('local'); setPaused(true); } catch (error) { setNotice(String(error)); } });
  }
  function downloadSave() {
    if (!game) return;
    const url = URL.createObjectURL(new Blob([saveGame(game)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = '幻想乡巡游-存档.json'; a.click(); URL.revokeObjectURL(url);
  }
  const lobby = mode === 'online' && snapshot && !snapshot.game;
  const ownSeat = snapshot?.seats.find(s => s.id === seat);
  const hostSeat = snapshot?.seats.filter(s => s.connected && !s.bot).sort((a, b) => a.id - b.id)[0]?.id;
  const acting = currentGame?.players[currentGame.current];
  const char = acting ? CHARACTERS[acting.character] : null;
  const skillActions = actions.filter(a => a.kind === 'cast');
  const mapActions = currentGame?.choice ? actions : actions.filter(a => a.kind === 'move');
  const casterActions = skillActions.filter(a => a.command.type === 'cast' && (a.command.caster === selected || !a.command.caster));
  const exactTargets = (a:Action, ids:string[]) => a.command.type === 'cast' && (a.command.targets??[]).length===ids.length && ids.every(id=>a.command.type==='cast'&&a.command.targets?.includes(id));
  const selectedSkills = casterActions.filter(a=>exactTargets(a,targets));
  const eligible = !mine ? [] : tab==='cast' && !currentGame?.choice
    ? [...new Set([...skillActions.flatMap(a=>a.command.type==='cast'&&a.command.caster?[a.command.caster]:[]), ...casterActions.flatMap(a=>a.command.type==='cast'?a.command.targets??[]:[])])]
    : [...new Set(mapActions.flatMap(a=>a.pieces.slice(0,1)))];
  const destinations = !mine ? [] : tab==='cast' && !currentGame?.choice
    ? casterActions.flatMap(a=>a.command.type==='cast'&&(!a.command.targets?.length)?a.nodes.slice(-1):[])
    : selected ? actionsForPiece(mapActions,selected).flatMap(a=>a.nodes.slice(-1)) : [];
  function choosePiece(id:string) {
    if(!mine || !currentGame) return;
    setMapMenu(null);
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
    if(!mine) return;
    const options = tab==='cast'&&!currentGame?.choice ? casterActions.filter(a=>a.command.type==='cast'&&exactTargets(a,targets)&&a.nodes.at(-1)===node)
      : destinationActions(selected?actionsForPiece(mapActions,selected):mapActions,node);
    if(options.length===1) {if(tab==='cast'&&!currentGame?.choice) setArmed(options[0]);else send(options[0].command);}
    else if(options.length) setMapMenu({node,actions:options});
  }
  function openSkill() {setTab('cast');setSelected(null);setTargets([]);setMapMenu(null);setArmed(skillActions.length===1?skillActions[0]:null);}

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#" onClick={e => { e.preventDefault(); if (!currentGame && !lobby) return; if (confirm('返回大厅？当前本地对局会自动保存。')) void leave(); }}><span className="torii">⛩</span><span>幻想乡巡游<small>东方派对</small></span></a>
      <div className="header-actions"><span className="version">试玩 v{version}</span>{currentGame && <><span className="mode-pill">{mode === 'online' ? `房间 ${snapshot?.roomId}` : '同机对局'}</span><button className="quiet" onClick={() => setLogOpen(!logOpen)}>记录</button>{mode === 'local' && <button className="quiet" onClick={downloadSave}>导出存档</button>}</>}</div>
    </header>
    {notice && <div className="toast" role="alert">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <input type="file" accept=".json" hidden ref={fileInput} onChange={e => { const f = e.target.files?.[0]; if (f) importSave(f); e.target.value = ''; }} />

    {!currentGame && !lobby && <main className="home-layout"><div className="setup-layout">
      <section className="welcome"><div className="welcome-copy"><span className="eyebrow">四位旅人，一场幻想乡巡游</span><h1>下一步，<br/>会是谁的逆转？</h1><p>掷骰前行，施放符卡。<br/>从神社出发，在幻想乡的岔路上相遇。</p></div><div className="map-preview"><img src={publicAsset('maps/board.svg')} alt="幻想乡巡游地图" /></div><div className="welcome-bottom"><span>四人对局</span><a href="#characters">七位角色</a><span>双线巡游</span></div></section>
      <section className="setup-card"><div className="section-tabs"><button className={mode === 'local' ? 'selected' : ''} onClick={() => setMode('local')}>同机游玩</button><button className={mode === 'online' ? 'selected' : ''} onClick={() => setMode('online')}>四人房间</button></div>
        {mode === 'local' ? <><div className="roster">{roster.map((p, i) => <div className="roster-row" key={i} style={tint(COLORS[i])}><Glyph id={p.character} /><div className="roster-fields"><input aria-label={`玩家${i + 1}名字`} value={p.name} maxLength={16} onChange={e => setRoster(roster.map((q, j) => i === j ? { ...q, name: e.target.value } : q))}/><select aria-label={`玩家${i + 1}角色`} value={p.character} onChange={e => setRoster(roster.map((q, j) => i === j ? { ...q, character: e.target.value as CharacterId } : q))}>{CHARACTER_LIST.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><label className="bot-toggle"><input type="checkbox" checked={p.bot} onChange={e => setRoster(roster.map((q, j) => i === j ? { ...q, bot: e.target.checked } : q))}/><span>式神</span></label></div>)}</div>
        <button className="primary wide" onClick={() => startLocal(false)}>开始巡游 <span>↗</span></button><button className="secondary wide" onClick={() => startLocal(true)}>一人试玩 · 三名式神同行</button><div className="setup-links"><button onClick={() => { const saved = localStorage.getItem('party-save-v031') || localStorage.getItem('party-save-v03') || localStorage.getItem('party-save'); if (!saved) return setNotice('还没有本地存档'); try { setGame(loadGame(saved)); if(JSON.parse(saved).format===2)setNotice('未结束旧对局已验证迁移，决出前三名后结束'); setPaused(true); } catch (e) { setNotice(String(e)); } }}>继续上次</button><button onClick={() => fileInput.current?.click()}>导入存档</button></div></> : <div className="online-form"><label>名字<input value={name} maxLength={16} onChange={e => setName(e.target.value)}/></label><label>房间服务<input value={endpoint} placeholder="wss://你的房间服务" onChange={e => setEndpoint(e.target.value)}/></label><button className="primary wide" disabled={busy || !endpoint.trim()} onClick={() => void connect('create')}>创建房间</button><div className="join-row"><input aria-label="房间号" placeholder="输入房间号" value={roomCode} onChange={e => setRoomCode(e.target.value)}/><button className="secondary" disabled={busy || !roomCode.trim() || !endpoint.trim()} onClick={() => void connect('join')}>加入</button></div>{resumeToken && <button className="quiet wide" disabled={busy} onClick={() => void connect('reconnect')}>重新连接上次房间</button>}<p className="muted">{location.protocol==='https:'?'联机需独立的安全房间服务（wss）。':'同一局域网的朋友可通过本机地址加入。'}</p></div>}
      </section>
    </div><CharacterCatalog/></main>}

    {lobby && <main className="lobby"><div className="lobby-title"><div><span className="eyebrow">四人房间</span><h1>{snapshot.roomId}</h1></div><button className="secondary" onClick={() => { void navigator.clipboard?.writeText(snapshot.roomId); setNotice('房间号已复制'); }}>复制房间号</button></div><div className="lobby-seats">{[0, 1, 2, 3].map(i => { const s = snapshot.seats.find(q => q.id === i); return <div key={i} className={`lobby-seat ${s?.ready ? 'ready' : ''}`} style={tint(COLORS[i])}>{s ? <><Glyph id={s.character}/><h2>{s.name}{i === seat ? ' · 你' : ''}</h2>{i === seat ? <select value={s.character} onChange={e => room.current?.send('lobby', { type: 'character', character: e.target.value })}>{CHARACTER_LIST.map(c => <option value={c.id} key={c.id} disabled={snapshot.seats.some(q => q.id !== seat && q.character === c.id)}>{c.name}</option>)}</select> : <p>{CHARACTERS[s.character].name}</p>}<span className="seat-status">{s.ready ? '已准备' : s.connected ? '选角中' : '重连中'}</span></> : <span className="empty-seat">等待旅人入席</span>}</div>; })}</div><div className="lobby-buttons"><button className="primary" onClick={() => room.current?.send('lobby', { type: 'ready' })}>{ownSeat?.ready ? '取消准备' : '准备好了'}</button>{seat === hostSeat && <><button className="secondary" onClick={() => room.current?.send('lobby', { type: 'bots' })}>补齐式神</button><button className="primary" disabled={snapshot.seats.length !== 4 || snapshot.seats.some(s => !s.ready)} onClick={() => room.current?.send('lobby', { type: 'start' })}>开始巡游</button></>}<button className="quiet" onClick={() => void leave()}>离开房间</button></div></main>}

    {currentGame && acting && char && <main className="game-layout">
      <div className="player-strip">{currentGame.players.map(p => { const c = CHARACTERS[p.character], pieces = currentGame.pieces.filter(q => q.owner === p.id), completed = pieces.filter(q => q.progress === 53).length; return <div className={`player-card ${p.id === currentGame.current ? 'is-current' : ''}`} key={p.id} style={tint(COLORS[p.id])} aria-label={`P${p.id+1} ${p.name}`}><Glyph id={p.character} small/><div className="player-name"><strong>{p.name}{mode === 'online' && seat === p.id ? ' · 你' : ''}</strong><span>{c.name}{p.bot ? ' · 式神' : ''}</span></div><div className="player-progress"><strong>{completed}<small>/4</small></strong><span>{currentGame.rankings.includes(p.id) ? `第${currentGame.rankings.indexOf(p.id)+1}名` : currentGame.phase==='over'?'第4名':Math.max(0, p.activeAt - p.turns) ? `冷却 ${p.activeAt - p.turns}` : '符卡就绪'}</span></div><div className="player-effects">{p.character==='youmu'&&p.passiveAt>p.turns&&<span>净化 {p.passiveAt-p.turns}</span>}{p.character==='yukari'&&p.bufferUsed&&<span>缓冲已用</span>}{pieces.some(q=>q.shield!==null)&&<span>盾 {pieces.filter(q=>q.shield!==null).length}</span>}{pieces.some(q=>q.mark)&&<span>蝶 {pieces.filter(q=>q.mark).length}</span>}</div><div className="progress-dots">{pieces.map(q => <i key={q.id} className={q.progress === 53 ? 'done' : q.progress >= 0 ? 'flying' : ''} title={`${c.short}${q.index + 1} · ${nodeAt(q)}`}/>)}</div></div>; })}</div>
      <section className="board-panel">
        <div className="board-topline"><span><i className="live-dot"/>第 {currentGame.round} 轮 <b>·</b> {acting.name}</span><div className="zoom-controls"><button aria-label="缩小地图" onClick={() => setZoom(Math.max(1, zoom - .25))}>−</button><button aria-label="复位地图" onClick={() => {setZoom(1);setViewReset(n=>n+1);}}>{Math.round(zoom * 100)}%</button><button aria-label="放大地图" onClick={() => setZoom(Math.min(3, zoom + .25))}>＋</button></div></div>
        <div className="map-stage"><Suspense fallback={<div className="board-canvas loading-board">正在展开幻想乡…</div>}><Board key={currentGame.players.map(p => p.character).join('-')} game={currentGame} preview={hover ?? armed} selected={selected} picked={targets} zoom={zoom} viewReset={viewReset} eligible={eligible} destinations={destinations} menu={mapMenu} onPiece={choosePiece} onNode={chooseNode} onAction={a=>{setMapMenu(null);if(tab==='cast'&&!currentGame.choice)setArmed(a);else send(a.command);}} onZoom={setZoom} onCloseMenu={()=>setMapMenu(null)}/></Suspense>
          {currentGame.phase!=='over'&&<div className="map-dice"><button className={`dice ${currentGame.dice?'rolled':''}`} aria-label={currentGame.phase==='roll'?'掷骰':`骰子 ${currentGame.dice?.value??'等待'}`} disabled={!mine||currentGame.phase!=='roll'} onClick={()=>send({type:'roll'})}>{currentGame.dice ? '⚀⚁⚂⚃⚄⚅'[currentGame.dice.value-1] : '⚄'}</button><span>{currentGame.phase==='roll'?'掷骰':currentGame.flags.extra?'追加行动':currentGame.dice?.source==='skill'?`自然 ${currentGame.dice.natural} · 移动 ${currentGame.dice.value}`:`${currentGame.dice?.value??''} 格`}</span></div>}
          {mine&&currentGame.phase!=='over'&&<div className="map-prompt" role="status">{currentGame.choice?.prompt || (currentGame.phase==='roll'?'':tab==='cast'?selected ? targets.length ? '确认符卡目标' : '选择目标或落点' : armed ? '确认施放' : acting.character==='reimu'?'选择结界目标':'选择施法棋子':selected?'选择落点':'选择发光的棋子')}{selected&&<button aria-label="取消当前选择" onClick={()=>{setSelected(null);setArmed(null);setTargets([]);setMapMenu(null);}}>×</button>}</div>}
        </div>
        <div className="map-caption"><span><i className="legend-dot wind"/>顺风 +2</span><span><i className="legend-dot mist"/>迷雾 −1</span><span><i className="legend-dot obstacle"/>障碍 −2</span><span>滚轮缩放 · 拖动地图</span></div>
      </section>
      <aside className={`action-panel spell-panel ${currentGame.phase==='over'?'is-over':''}`}>
        <div className="character-portrait"><img src={publicAsset(`characters/${acting.character}-portrait.svg`)} alt={`${char.name}临时立绘`}/><div><span>{acting.name}</span><h2>{char.name}</h2></div></div>
        <div className="spell-content">
        {currentGame.phase==='over' ? <div className="winner"><span>✦</span><h2>巡游结束</h2><ol className="standings">{[...currentGame.rankings,...currentGame.players.filter(p=>!currentGame.rankings.includes(p.id)).map(p=>p.id)].map(id=><li key={id}>{currentGame.players[id].name}</li>)}</ol>{mode==='local'||seat===hostSeat?<button className="primary wide" onClick={()=>mode==='online'?room.current?.send('rematch'):setGame(null)}>再来一局</button>:<p>等待房主开启下一局</p>}</div>:<>
          {currentGame.rankings.length>0&&<ol className="standings live-standings">{currentGame.rankings.map(id=><li key={id}>{currentGame.players[id].name}</li>)}</ol>}
          <button className={`spell-card ${tab==='cast'?'selected':''}`} disabled={!mine||!skillActions.length} onClick={openSkill}><span>符卡</span><strong>{char.active}</strong><small>{Math.max(0,acting.activeAt-acting.turns)?`冷却 ${acting.activeAt-acting.turns}`:skillActions.length?'施放':'等待施放窗口'}</small></button>
          <p className="spell-description">{char.activeText}</p>
          {mine&&tab==='cast'&&!currentGame.choice&&<div className="spell-selection">
            {selectedSkills.length>1&&<div className="branch-options">{selectedSkills.map(a=><button key={a.id} className={armed?.id===a.id?'selected':''} onClick={()=>setArmed(a)}>{a.detail || a.label}</button>)}</div>}
            {armed&&<p className="cast-summary">{armed.label}</p>}
            <button className="primary wide" disabled={!armed} onClick={()=>armed&&send(armed.command)}>施放{char.active}</button><button className="quiet wide" onClick={()=>{setTab('move');setSelected(null);setTargets([]);setArmed(null);setMapMenu(null);}}>取消</button>
          </div>}
          {mine&&tab==='move'&&!currentGame.choice&&selected&&actionsForPiece(mapActions,selected).some(a=>a.command.type==='move'&&(a.command.cleanse||a.command.splitPiece))&&<div className="branch-options">{actionsForPiece(mapActions,selected).map(a=><button key={a.id} onMouseEnter={()=>setHover(a)} onMouseLeave={()=>setHover(null)} onClick={()=>send(a.command)}>{a.detail} → {a.nodes.at(-1)}</button>)}</div>}
          {mine&&currentGame.choice&&<div className="choice-controls">{actions.filter(a=>!a.nodes.length).map(a=><button className="secondary wide" key={a.id} onClick={()=>send(a.command)}>{a.label}</button>)}</div>}
          {mine&&actions.filter(a=>a.kind==='pass').map(a=><button className="secondary wide" key={a.id} onClick={()=>send(a.command)}>{a.label}</button>)}
          {!mine&&<div className="waiting"><p>{acting.bot?'式神正在思考':'等待旅人落子'}</p>{mode==='local'&&<button className="quiet" onClick={()=>setPaused(!paused)}>{paused?'继续式神':'暂停式神'}</button>}</div>}
          <div className="passive-card"><span>被动</span><strong>{char.passive}{char.cleanseCooldown && acting.passiveAt>acting.turns ? ` · 冷却 ${acting.passiveAt-acting.turns}` : currentGame.flags.used.float || currentGame.flags.used.publicMove && char.splitThreshold ? ' · 已用' : ''}</strong><p>{char.passiveText}</p></div>
        </>}
        <details className="character-help"><summary>规则与素材</summary><p>主动仅在自己的首次掷骰后、移动前可用。自然六点每回合最多追加一次。</p><p>七名角色为临时原创矢量素材；立绘与 Q 版可独立替换。</p></details>
        </div>
      </aside>

      {logOpen && <section className="event-log"><div className="drawer-heading"><h3>巡游记录</h3><button className="quiet" onClick={() => setLogOpen(false)}>收起</button></div>{[...currentGame.events].reverse().slice(0, 45).map(e => <p className={`event-${e.type}`} key={e.id}><span>{e.turn}</span>{e.text}</p>)}</section>}

    </main>}
    <footer className="site-footer"><span>幻想乡巡游</span><span>规则 {VERSIONS.rules} · 地图 {VERSIONS.map}</span></footer>
  </div>;
}



