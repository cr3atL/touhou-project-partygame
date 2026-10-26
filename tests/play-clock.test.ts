import { describe, expect, it } from 'vitest';
import { PlayClock, elapsedPlayTime, formatPlayTime } from '../packages/session/playClock';
import { DecisionClock } from '../packages/session/decisionClock';
import { loadGame, saveGame } from '../packages/session';
import { scenario } from './helpers/scenarios';

describe('整局游玩时间', () => {
  it('开局开始累计，换回合与演出不重置、不暂停', () => {
    const game = scenario('reimu'); game.phase = 'opening';
    const clock = new PlayClock(0), decision = new DecisionClock(game.turn, 0);
    expect(clock.update(game, 2000).elapsedMs).toBe(2000);
    game.phase = 'roll'; game.turn++;
    decision.block(game, 5000, 2000);
    expect(clock.update(game, 6000).elapsedMs).toBe(6000);
    expect(decision.update(game, 6000).remainingMs).toBe(60000);
  });
  it('只扣除暂停区间，暂停和恢复边界不漏计或重复', () => {
    const game = scenario('reimu'), clock = new PlayClock(0);
    expect(clock.update(game, 5000, true).elapsedMs).toBe(5000);
    expect(clock.update(game, 60000, true).elapsedMs).toBe(5000);
    expect(clock.update(game, 65000).elapsedMs).toBe(5000);
    expect(clock.update(game, 70000).elapsedMs).toBe(10000);
  });
  it('存档恢复保留累计值，离线和恢复菜单时间不计入', () => {
    const game = scenario('reimu'), clock = new PlayClock(0);
    const text = saveGame(game, undefined, clock.update(game, 12345, true));
    expect(loadGame(text)).toEqual(game);
    const restored = new PlayClock(1000000, JSON.parse(text).playTime, true);
    expect(restored.update(game, 1010000, true).elapsedMs).toBe(12345);
    restored.update(game, 1020000);
    expect(restored.update(game, 1021000).elapsedMs).toBe(13345);
    expect(new PlayClock(1000).update(game, 2000).elapsedMs).toBe(1000);
    expect(new PlayClock(1000, {elapsedMs: NaN, at: 0, paused: false}).value.elapsedMs).toBe(0);
  });
  it('整局结束立即冻结，之后的结算等待不计入', () => {
    const clock = new PlayClock(0), game = scenario('reimu');
    game.phase = 'over';
    expect(clock.update(game, 12345).elapsedMs).toBe(12345);
    expect(clock.update(game, 999999).elapsedMs).toBe(12345);
  });
  it('联机按同步时刻插值，完成与暂停快照保持冻结', () => {
    expect(elapsedPlayTime({elapsedMs: 10000, at: 1000, paused: false}, 3000)).toBe(12000);
    expect(elapsedPlayTime({elapsedMs: 10000, at: 1000, paused: true}, 3000)).toBe(10000);
    expect(elapsedPlayTime({elapsedMs: 10000, at: 3000, paused: false}, 1000)).toBe(10000);
  });
  it.each([[0,'00:00'],[754999,'12:34'],[3599999,'59:59'],[3600000,'1:00:00'],[4354000,'1:12:34'],[360000000,'100:00:00']] as const)('格式化 %i → %s', (ms, text) => {
    expect(formatPlayTime(ms)).toBe(text);
  });
});
