import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import { version } from '../../../package.json';
import { CharacterCatalog } from './CharacterCatalog';
import { publicAsset } from './assets';
import { GAME_MUSIC } from './music';

// Approved rendered artwork; model and Blender sources stay outside public/.
export const TITLE_ART = {
  desktopBackground:'cover/party-sky.webp',
  compactBackground:'cover/party-sky-compact.webp',
  mobileBackground:'cover/party-sky-mobile.webp',
  character:'cover/reimu-unamused.webp',
  wordmark:'cover/wordmark.webp'
};
export function Dialog({title,onClose,children,className='',id}:{title:string;onClose():void;children:ReactNode;className?:string;id?:string}){
  const panel=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key=(e:globalThis.KeyboardEvent)=>{
      if(e.key==='Escape'){e.stopPropagation();close.current();}
      if(e.key!=='Tab')return;
      const controls=[...panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,summary,a[href],[tabindex="0"]')];
      const first=controls[0],last=controls.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);previous?.focus();};
  },[]);
  return <div className="dialog-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div id={id} ref={panel} className={`plain-dialog ${className}`} role="dialog" aria-modal="true" aria-label={title}><div className="window-heading"><h2>{title}</h2><button aria-label={`关闭${title}`} onClick={onClose}>×</button></div>{children}</div></div>;
}
export function TitleScreen({local,online,canContinue,onContinue,onSettings,initialOnline=false}:{local:ReactNode;online:ReactNode;canContinue:boolean;onContinue():void;onSettings():void;initialOnline?:boolean}){
  const [page,setPage]=useState<'main'|'modes'|'local'|'online'|'intro'|'about'>(initialOnline?'online':'main');
  const menu=useRef<HTMLElement>(null);
  useEffect(()=>{menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();},[page]);
  const back=()=>setPage(page==='local'||page==='online'?'modes':'main');
  useEffect(()=>{const key=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('[aria-modal="true"]')){setPage(p=>p==='local'||p==='online'?'modes':'main');}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  function navigate(e:KeyboardEvent<HTMLElement>){
    if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
    e.preventDefault();const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
  }
  return <main className={`title-screen title-${page}`}>
    <div className="title-scene">
    <div className="title-art" aria-hidden="true">
      <picture><source media="(max-aspect-ratio:1/1)" srcSet={publicAsset(TITLE_ART.mobileBackground)}/><source media="(max-aspect-ratio:3/2)" srcSet={publicAsset(TITLE_ART.compactBackground)}/><img className="cover-background" src={publicAsset(TITLE_ART.desktopBackground)} alt="" fetchPriority="high"/></picture>
      <div className="cover-props">{['pawn-red','pawn-blue','pawn-green','pawn-gold','die-upper','die-near'].map(name=><img key={name} className={`cover-prop ${name}`} src={publicAsset(`cover/${name}.webp`)} alt="" draggable={false}/>)}{['spell-left','spell-above','spell-lower'].map(name=><img key={name} className={`cover-prop ${name}`} src={publicAsset('cover/spell-card.svg')} alt="" draggable={false}/>)}</div>
      <img className="cover-model" src={publicAsset(TITLE_ART.character)} alt="" draggable={false}/>
    </div>
    <div className="title-heading"><img src={publicAsset(TITLE_ART.wordmark)} alt="" aria-hidden="true"/><h1 className="title-accessible-name">幻想乡巡游</h1></div>
    <small className="title-version">v{version}</small>
    <section className="title-content">
      {(page==='main'||page==='modes')?<nav className="title-menu" ref={menu} aria-label={page==='main'?'主菜单':'模式选择'} onKeyDown={navigate}>
        {page==='main'?<><button onClick={()=>setPage('modes')}>开始游戏</button><button disabled={!canContinue} onClick={onContinue}>继续游戏</button><button onClick={()=>setPage('intro')}>游戏介绍</button><button onClick={onSettings}>设置</button><button onClick={()=>setPage('about')}>关于游戏</button></>:<><button onClick={()=>setPage('local')}>本机游玩</button><button onClick={()=>setPage('online')}>联机游玩</button><button className="menu-back" onClick={back}>返回</button></>}
      </nav>:<div className={`title-page ${page==='intro'||page==='about'?'reading-page':''}`}><div className="title-page-heading"><h2>{{local:'本机游玩',online:'联机游玩',intro:'游戏介绍',about:'关于游戏'}[page]}</h2><button onClick={back}>← 返回</button></div>
        {page==='local'?local:page==='online'?online:page==='intro'?<><p>四位旅人轮流掷骰，率先让四枚棋子抵达终点。前三名决出后结束对局。</p><p>所有点数均可让棋子出场。同色跳格与专属航线会自动触发，终点需要恰好抵达，超出则折返。</p><p>掷骰后选择棋子，查看路线与结果，再确认移动。每回合 60 秒；超时由机器人完成当前回合。</p><p>点击玩家头像查看技能与棋子状态。主动符卡与骰子相邻，掷骰后可按条件施放。</p><CharacterCatalog/></>:<><p>东方 Project 同人派对游戏 · v{version}</p><h3>v0.1.61 更新日志</h3><ul><li>添加整局游玩计时，扣除本机暂停时间，读档后继续累计。</li><li>补全大厅鼠标、键盘与手机交互音效。</li><li>添加标题与大厅背景音乐，对局六首随机轮播，音乐与音效可分别调节。</li></ul><h3>v0.1.6 更新日志</h3><ul><li>整体重构界面布局，添加主页封面。</li><li>优化游玩界面顶部的玩家排序，固定按 P1、P2、P3、P4 排列；行动顺序由开局掷骰决定。</li></ul><h3>后续计划</h3><ul><li>对局界面的美化。</li><li>可能会添加更精美的角色立绘。</li></ul><p>原作：上海爱丽丝幻乐团 / ZUN</p><p>封面角色模型：<a href="https://3d.nicovideo.jp/works/td1809" target="_blank" rel="noreferrer">schwarz（博麗霊夢）</a>。角色经 3D 摆姿与渲染，背景由 AI 生成。</p><p>背景音乐：<a href="http://ajapabgm.s323.xrea.com/index.html" target="_blank" rel="noreferrer">ajapaのBGM</a>。「少女奇想天外曲」（标题与大厅）；对局随机轮播{GAME_MUSIC.map(song=>`「${song.title}」`).join('、')}。</p><p>程序、SVG 图形及封面合成：项目贡献者。<a href={publicAsset('cover/sources.json')} target="_blank" rel="noreferrer">封面来源</a> · <a href={publicAsset('audio/sources.json')} target="_blank" rel="noreferrer">音频来源</a></p></>}
      </div>}
    </section>
    </div>
  </main>;
}
