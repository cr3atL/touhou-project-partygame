import { useEffect, useRef } from 'react';
import { CHARACTERS, CHARACTER_LIST } from '../../../packages/content';
import { COLORS } from '../../../packages/core/map';
import type { CharacterId } from '../../../packages/core/types';
import type { RoomSnapshot, Seat } from '../../../packages/session';
import { publicAsset } from './assets';

export interface MemberAction { type: 'removeBot' | 'kick'; seat: number; revision: number }
interface Props { snapshot: RoomSnapshot; seat: number | null; hostSeat: number | null | undefined; onManage(action: MemberAction): void }
function RemoveMember({ member, snapshot, onManage }: { member: Seat; snapshot: RoomSnapshot; onManage(action: MemberAction): void }) {
  if(member.bot && snapshot.game)return null;
  return <button className="member-remove" aria-label={member.bot?`移除${member.name}`:`踢出${member.name}`} onClick={()=>onManage({type:member.bot?'removeBot':'kick',seat:member.id,revision:snapshot.revision})}>{member.bot?'移除机器人':'踢出玩家'}</button>;
}
export function LobbySeats({ snapshot, seat, hostSeat, onManage, onCharacter }: Props & { onCharacter(character: CharacterId): void }) {
  return <div className="lobby-seats">{[0,1,2,3].map(id=>{
    const member=snapshot.seats.find(s=>s.id===id);
    return <div key={id} className={`lobby-seat ${member?.ready?'ready':''}`} style={{borderColor:member?.ready?COLORS[id]:undefined}}>{member?<>
      <img className="lobby-member-art" src={publicAsset(`characters/${member.character}-chibi.svg`)} alt=""/>
      <h2>{member.name}{id===seat?' · 你':''}{id===hostSeat&&<span className="host-badge">房主</span>}</h2>
      {id===seat?<select aria-label="我的角色" value={member.character} onChange={e=>onCharacter(e.target.value as CharacterId)}>{CHARACTER_LIST.map(c=><option value={c.id} key={c.id} disabled={snapshot.seats.some(s=>s.id!==id&&s.character===c.id)}>{c.name}</option>)}</select>:<p>{CHARACTERS[member.character].name}</p>}
      <span className="seat-status">{member.ready?'已准备':member.connected?'选角中':'重连中'}</span>
      {seat===hostSeat&&id!==seat&&<RemoveMember member={member} snapshot={snapshot} onManage={onManage}/>}
    </>:<span className="empty-seat">等待旅人入席</span>}</div>;
  })}</div>;
}
export function RoomMembersDialog({ snapshot, seat, hostSeat, onManage, onClose }: Props & { onClose(): void }) {
  const panel=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    panel.current?.querySelector('button')?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.stopPropagation();close.current();}
      if(event.key!=='Tab')return;
      const buttons=[...panel.current!.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',key,true);
    return ()=>{document.removeEventListener('keydown',key,true);previous?.focus();};
  },[]);
  return <div className="presentation-settings-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="presentation-settings room-members" role="dialog" aria-modal="true" aria-label="房间管理" ref={panel}>
    <div className="window-heading"><h3>房间管理</h3><button aria-label="关闭房间管理" onClick={onClose}>×</button></div>
    {snapshot.seats.map(member=><div className="room-member" key={member.id}>
      <img src={publicAsset(`characters/${member.character}-chibi.svg`)} alt=""/>
      <div><strong>{member.name}{member.id===seat?' · 你':''}</strong><span>{member.id===hostSeat?'房主':member.bot?'机器人':member.connected?'在线':'重连中'}</span></div>
      {seat===hostSeat&&member.id!==seat&&<RemoveMember member={member} snapshot={snapshot} onManage={onManage}/>}
    </div>)}
    {snapshot.game&&<p>踢出玩家后，该席位由机器人接管。</p>}
  </div></div>;
}
