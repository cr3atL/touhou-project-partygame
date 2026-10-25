import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../packages/content';
import { createGame } from '../packages/core/engine';
import { gameLogTurns } from '../apps/web/src/gameLogModel';

describe('巡游日志', () => {
  it('按回合保持行动顺序，使用名字识别本回合玩家', () => {
    const game=createGame([{name:'甲',character:'reimu',bot:false},{name:'乙',character:'marisa',bot:false},{name:'丙',character:'flandre',bot:false},{name:'丁',character:'yuyuko',bot:false}],CHARACTERS);
    game.events=[{id:1,turn:1,type:'turn',text:'第 1 轮 · 甲',pieces:[]},{id:2,turn:1,type:'dice',text:'甲 掷出 3',pieces:[]},{id:3,turn:1,type:'move',text:'灵梦① 出场',pieces:['p0-0']},{id:4,turn:2,type:'turn',text:'第 1 轮 · 乙',pieces:[]},{id:5,turn:2,type:'dice',text:'乙 掷出 5',pieces:[]}];
    const turns=gameLogTurns(game);
    expect(turns.map(t=>t.owner)).toEqual([0,1]);
    expect(turns[0].entries.map(e=>e.id)).toEqual([2,3]);
    expect(turns[1].entries.map(e=>e.id)).toEqual([5]);
  });
  it('保护和净化写明受影响棋子，同格多个目标不丢失', () => {
    const game=createGame([{name:'甲',character:'reimu',bot:false},{name:'乙',character:'marisa',bot:false},{name:'丙',character:'flandre',bot:false},{name:'丁',character:'yuyuko',bot:false}],CHARACTERS);
    game.events=[{id:1,turn:1,type:'shield',text:'获得一次保护',pieces:['p0-0','p0-1']},{id:2,turn:1,type:'shield',text:'灵梦① 的保护抵挡了攻击',pieces:['p0-0']}];
    const entries=gameLogTurns(game)[0].entries;
    expect(entries[0].text).toBe('灵梦①、灵梦② · 获得一次保护');
    expect(entries[1].text).toBe('灵梦① 的保护抵挡了攻击');
  });
});
