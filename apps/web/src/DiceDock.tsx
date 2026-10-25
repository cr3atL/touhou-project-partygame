import type { GameState } from '../../../packages/core/types';

export function DiceDock({ game, mine, online, busy, rolling, face, reveal, onRoll }: {
  game: GameState; mine: boolean; online: boolean; busy: boolean; rolling: boolean;
  face: number; reveal: number; onRoll(): void;
}) {
  const ready = mine && game.phase === 'roll' && !busy;
  const value = rolling ? face : game.dice?.value ?? 5;
  const label = rolling ? '投掷中…' : game.phase === 'roll'
    ? mine ? game.flags.extra ? '追加投掷' : '点击掷骰' : '等待掷骰'
    : game.dice?.source === 'skill' ? `自然 ${game.dice.natural} · 移动 ${game.dice.value}`
    : `${game.dice?.value ?? ''} 格${game.flags.extra ? ' · 追加行动' : ''}`;
  return <div className={`dice-dock ${ready ? 'is-ready' : ''} ${rolling ? 'is-rolling' : ''}`}>
    {ready && <div className="turn-callout" key={`${game.turn}-${game.flags.extra}`} role="status">{online ? '轮到你了' : `轮到${game.players[game.current].name}`}</div>}
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
