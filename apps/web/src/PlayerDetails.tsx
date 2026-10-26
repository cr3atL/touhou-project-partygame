import { CHARACTERS } from '../../../packages/content';
import { FINISH } from '../../../packages/core/constants';
import { nodeAt } from '../../../packages/core/map';
import type { GameState } from '../../../packages/core/types';
import { Dialog } from './TitleScreen';
import { publicAsset } from './assets';

export function playerIdentity(game:GameState,id:number){const p=game.players[id];return `${p.name}(${CHARACTERS[p.character].name})`;}
export function PlayerDetails({game,id,onClose}:{game:GameState;id:number;onClose():void}){
  const p=game.players[id],c=CHARACTERS[p.character],cooldown=Math.max(0,p.activeAt-p.turns);
  return <Dialog title={playerIdentity(game,id)} onClose={onClose} className="player-details">
    <div className="detail-player"><img src={publicAsset(`characters/${p.character}-chibi.svg`)} alt=""/><span>P{p.id+1}{p.bot?' · 机器人':''}</span></div>
    <h3>{c.active} <small>{cooldown?`冷却 ${cooldown} 回合`:'冷却就绪'}</small></h3><p>{c.activeText}</p>
    <h3>{c.passive} <small>{p.passiveAt>p.turns?`冷却 ${p.passiveAt-p.turns} 回合`:p.bufferUsed?'本回合已用':''}</small></h3><p>{c.passiveText}</p>
    <details><summary>棋子状态</summary><ul className="piece-details">{game.pieces.filter(q=>q.owner===id).map(q=><li key={q.id}><strong>{c.short} {q.index+1}</strong><span>{q.progress<0?'机场':q.progress===FINISH?'已完成':nodeAt(q)}{q.shield!==null?' · 保护':''}{q.mark?' · 无寿之梦':''}</span></li>)}</ul></details>
  </Dialog>;
}
