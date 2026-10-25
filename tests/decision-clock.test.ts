import { describe,it,expect } from 'vitest';
import { DecisionClock,remainingTime,presentationDuration } from '../packages/session/decisionClock';
import { scenario } from './helpers/scenarios';
import { CHARACTERS } from '../packages/content';
import { getActions,reduceGame } from '../packages/core/engine';
import { saveGame,loadGame } from '../packages/session';

describe('回合决策时钟',()=>{
  it('所有模式共用60秒，追加与技能不重置',()=>{
    const s=scenario('yukari'),clock=new DecisionClock(s.turn,0);
    expect(clock.update(s,12_000).remainingMs).toBe(48_000);
    s.phase='roll';s.flags.first=false;
    expect(clock.update(s,20_000).remainingMs).toBe(40_000);
    s.turn++;expect(clock.update(s,21_000).remainingMs).toBe(60_000);
  });
  it('不可操作演出有服务器确定的上限，同步不能延长',()=>{
    const s=scenario('yukari'),clock=new DecisionClock(s.turn,0);
    clock.update(s,10_000);clock.block(s,5000,10_000);
    expect(clock.update(s,12_000).remainingMs).toBe(50_000);
    expect(clock.update(s,15_000).remainingMs).toBe(50_000);
    expect(clock.update(s,16_000).remainingMs).toBe(49_000);
    expect(clock.update(s,20_000).remainingMs).toBe(45_000);
    clock.block(s,100_000,20_000);expect(clock.value.blockedUntil).toBe(28_000);
  });
  it('本地打开设置暂停，关闭后接着扣时',()=>{
    const s=scenario('reimu'),clock=new DecisionClock(s.turn,0);
    clock.update(s,5000,true);clock.update(s,60_000,true);
    expect(clock.update(s,65_000,false).remainingMs).toBe(55_000);
    expect(clock.update(s,70_000).remainingMs).toBe(50_000);
  });
  it('超时本回合托管，不改变玩家bot状态，下回合恢复',()=>{
    const s=scenario('reimu'),clock=new DecisionClock(s.turn,0);
    expect(clock.update(s,60_001).takeover).toBe(true);
    expect(s.players[0].bot).toBe(false);
    s.phase='roll';expect(clock.update(s,61_000).takeover).toBe(true);
    s.turn++;expect(clock.update(s,62_000).takeover).toBe(false);
  });
  it('存档保留剩余时间和单回合托管，载入不增加预算',()=>{
    const s=scenario('reimu'),clock=new DecisionClock(s.turn,0);
    const timer=clock.update(s,45_000),save=saveGame(s,timer);
    expect(loadGame(save)).toEqual(s);
    const restored=new DecisionClock(s.turn,100_000,JSON.parse(save).timer);
    expect(restored.update(s,102_000).remainingMs).toBe(13_000);
  });
  it('客户端插值在演出后才消耗时间',()=>{
    expect(remainingTime({turn:1,remainingMs:5000,at:1000,paused:false,blockedUntil:4000,takeover:false},4500)).toBe(4500);
  });
  it('演出预算来自真实事件，符卡多目标演出有界',()=>{
    for(const id of ['reimu','marisa','yukari','remilia','flandre','yuyuko','youmu'] as const){
      const s=scenario(id),a=getActions(s,CHARACTERS).find(a=>a.kind==='cast')!,next=reduceGame(s,a.command,CHARACTERS);
      expect(presentationDuration(s,next)).toBeGreaterThanOrEqual(2700);
      expect(presentationDuration(s,next)).toBeLessThan(8000);
    }
  });
});
