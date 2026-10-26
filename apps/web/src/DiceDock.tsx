import type { GameState } from '../../../packages/core/types';
import { useMemo } from 'react';

export function DiceDock({ game, mine, online, busy, rolling, face, reveal, onRoll }: {
  game: GameState; mine: boolean; online: boolean; busy: boolean; rolling: boolean;
  face: number; reveal: number; onRoll(): void;
}) {
  const ready = mine && (game.phase === 'roll'||game.phase==='opening') && !busy;
  const result=useMemo(()=>{
    if(game.dice)return game.dice.value;
    const draw=[...game.history].reverse().find(r=>r.command.type==='roll')?.random[0];
    return draw===undefined?5:Math.max(1,Math.min(6,Math.floor(draw*6)+1));
  },[game]);
  const value = rolling ? face : result;
  const label = rolling ? '投掷中…' : (game.phase === 'roll'||game.phase==='opening')
    ? mine ? game.phase==='opening'?'开局掷骰':game.flags.extra ? '再次掷骰' : '点击掷骰' : '等待掷骰'
    : game.dice?.source === 'skill' ? `自然 ${game.dice.natural} · 移动 ${game.dice.value}`
    : `${game.dice?.value ?? ''} 格${game.flags.extra ? ' · 追加行动' : ''}`;
  return <div className={`dice-dock ${ready ? 'is-ready' : ''} ${rolling ? 'is-rolling' : ''}`}>

    <button className="dice-button" aria-label={ready ? '掷骰' : rolling ? '骰子投掷中' : `骰子 ${game.dice?.value ?? '等待'}`} disabled={!ready} onClick={onRoll}>
      <span key={rolling ? 'rolling' : `revealed-${reveal}`} className={`die-face ${rolling ? 'tumbling' : game.dice ? 'revealed' : ''}`} aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => <i key={i} className={pipPositions[value].includes(i) ? 'pip visible' : 'pip'}/>)}
      </span>
    </button>
    <span className="dice-label" role="status">{label}</span>
  </div>;
}

const pipPositions: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]
};
