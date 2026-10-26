import type { GameState } from '../core/types';

export interface PlayTime { elapsedMs: number; at: number; paused: boolean }

export function elapsedPlayTime(time: PlayTime, now = Date.now()): number {
  return time.elapsedMs + (time.paused ? 0 : Math.max(0, now - time.at));
}

/** Whole-match time includes animations; only a local pause or match end stops it. */
export class PlayClock {
  value: PlayTime;
  constructor(now = Date.now(), saved?: PlayTime, paused = false) {
    const elapsedMs = saved && Number.isFinite(saved.elapsedMs) && saved.elapsedMs >= 0 ? saved.elapsedMs : 0;
    // Saved timestamps never count offline time toward a restored match.
    this.value = { elapsedMs, at: now, paused };
  }
  update(game: Pick<GameState, 'phase'>, now = Date.now(), paused = false): PlayTime {
    this.value = { elapsedMs: elapsedPlayTime(this.value, now), at: now, paused: paused || game.phase === 'over' };
    return { ...this.value };
  }
}

export function formatPlayTime(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${ss}` : `${String(minutes).padStart(2, '0')}:${ss}`;
}
