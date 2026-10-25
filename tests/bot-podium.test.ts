import {describe,it,expect} from 'vitest';
import {CHARACTERS} from '../packages/content';
import {createGame,getActions,reduceGame,assertGame} from '../packages/core/engine';
import {botAction,legacyBotAction,loadGame,saveGame,replayGame} from '../packages/session';
import {returnRisk} from '../packages/session/bot';
import {scenario,finishScenario,podiumScenario} from '../packages/session/scenarios';
import {progressAt} from '../packages/core/map';
import type {CharacterId,GameState} from '../packages/core/types';
import recorded from './fixtures/bot-round59.json';
function empty(character:CharacterId='marisa',die=2){const s=scenario(character);for(const p of s.pieces){p.progress=-1;p.branch=null;p.mark=null;p.shield=null;}s.dice={value:die,natural:die,source:'natural',extra:die===6};return s;}
const put=(s:GameState,id:string,p:number)=>{const piece=s.pieces.find(q=>q.id===id)!;piece.progress=p;piece.branch='ground';return piece;};
const at=(s:GameState,id:string,node:string)=>put(s,id,progressAt(Number(id[1]),node));
const step=(s:GameState,id='p0-0')=>reduceGame(s,getActions(s,CHARACTERS).find(a=>a.kind==='move'&&a.pieces[0]===id)!.command,CHARACTERS);
function placed(s:GameState,ids:number[]){for(const id of ids)for(const p of s.pieces.filter(p=>p.owner===id)){p.progress=53;p.mark=null;p.shield=null;}s.rankings=ids;s.winner=ids[0]??null;}

describe('式神目标与风险',()=>{
 it('实战第59轮：推进41格领先棋，替代后排追撞',()=>{const s=recorded as GameState;expect(legacyBotAction(s).pieces[0]).toBe('p0-3');expect(botAction(s).pieces[0]).toBe('p0-1');expect(botAction(s).nodes).toEqual(['G47']);});
 it('已有领先棋时低骰不机械出场',()=>{const s=empty('marisa',1);put(s,'p0-0',37);expect(legacyBotAction(s).label).toContain('出场');expect(botAction(s).pieces[0]).toBe('p0-0');});
 it('没有在场可动棋时仍能正常出场',()=>{const s=empty();expect(botAction(s).kind).toBe('move');expect(botAction(s).label).toContain('出场');});
 it('能精确完成时优先完成',()=>{const s=empty('marisa',1);put(s,'p0-0',52);put(s,'p0-1',0);at(s,'p1-0','G01');expect(botAction(s).nodes).toEqual(['done-0']);});
 it('前进可进入私人安全区时优先进入',()=>{const s=empty('marisa',6);put(s,'p0-0',42);put(s,'p0-1',0);at(s,'p1-0','G06');expect(botAction(s).pieces[0]).toBe('p0-0');});
 it('相同骰面有多枚敌棋可撞击时不重复计算概率；保护吸收一次',()=>{const s=empty();put(s,'p0-0',10);at(s,'p1-0','G09');at(s,'p1-1','G09');expect(returnRisk(s,s.pieces[0])).toBeCloseTo(1/6);at(s,'p1-1','G08');expect(returnRisk(s,s.pieces[0])).toBeCloseTo(2/6);s.pieces[0].shield=2;expect(returnRisk(s,s.pieces[0])).toBeCloseTo(0);});
 it('分支威胁沿道路计算，选择避开地面追兵的冥界路线',()=>{const s=empty('marisa',3);put(s,'p0-0',28);at(s,'p1-0','G29');expect(botAction(s).command).toMatchObject({type:'move',piece:'p0-0',branch:'spirit'});});
 it('蕾米可用改点也计入风险，冷却中不假设可用',()=>{const s=empty();s.players[1].character='remilia';s.players[3].character='reimu';put(s,'p0-0',10);at(s,'p1-0','G09');expect(returnRisk(s,s.pieces[0])).toBeCloseTo(2/6);s.players[1].activeAt=99;expect(returnRisk(s,s.pieces[0])).toBeCloseTo(1/6);});
 it('无实际保护收益时保留主动冷却，评估不修改原局面',()=>{const s=empty('reimu',3);put(s,'p0-0',10);const before=saveGame(s);expect(botAction(s).kind).toBe('move');expect(saveGame(s)).toBe(before);});
});
describe('前三名赛程',()=>{
 it('第一名完成即退出行动，六点追加也不继续；其他人继续',()=>{const s=finishScenario();s.dice!.natural=6;s.dice!.extra=true;const n=step(s);expect(n.rankings).toEqual([0]);expect(n.winner).toBe(0);expect(n.phase).toBe('roll');expect(n.current).toBe(1);expect(n.dice).toBeNull();expect(n.events.some(e=>e.type==='extra')).toBe(false);assertGame(n);});
 it('第二名完成保留第一名，下一回合跳过已经完成的玩家',()=>{const s=finishScenario();placed(s,[1]);const n=step(s);expect(n.rankings).toEqual([1,0]);expect(n.winner).toBe(1);expect(n.current).toBe(2);expect(n.phase).toBe('roll');assertGame(n);});
 it('第三名完成才结束，剩余玩家自动为第四，不伪造其完成',()=>{const s=podiumScenario(),n=step(s);expect(n.rankings).toEqual([1,2,0]);expect(n.phase).toBe('over');expect(n.pieces.filter(p=>p.owner===3).every(p=>p.progress<53)).toBe(true);expect(getActions(n,CHARACTERS)).toEqual([]);expect(n.queue).toEqual([]);assertGame(n);});
 it('跳过名次玩家不刷新其回合或冷却，跨席位回绕时轮数正确',()=>{let s=empty('marisa',2);placed(s,[1]);const turns=s.players[1].turns;s=step(s);expect(s.current).toBe(2);expect(s.round).toBe(1);s=reduceGame(s,{type:'roll'},CHARACTERS,()=>.2);s=step(s,'p2-0');s=reduceGame(s,{type:'roll'},CHARACTERS,()=>.2);s=step(s,'p3-0');expect(s.current).toBe(0);expect(s.round).toBe(2);expect(s.players[1].turns).toBe(turns);});
 it('前三顺序与剩余赛程能存取，伪造名次会被拒绝',()=>{const s=step(finishScenario());expect(loadGame(saveGame(s))).toEqual(s);const bad=structuredClone(s);bad.rankings.push(1);expect(()=>loadGame(saveGame(bad))).toThrow();});
});
describe('旧版未结束存档验证迁移',()=>{
 const initial=()=>createGame(['marisa','yuyuko','reimu','flandre'].map((character,i)=>({name:`P${i}`,character:character as CharacterId,bot:false})),CHARACTERS);
 function legacy(){let s=initial();for(let i=0;i<8;i++)s=reduceGame(s,getActions(s,CHARACTERS).find(a=>a.kind==='roll'||a.kind==='move')!.command,CHARACTERS,()=>.2);const data=JSON.parse(saveGame(s));data.format=2;data.rules='0.4.0';data.game.versions={rules:'0.4.0',map:'0.1.0',protocol:2,save:2};delete data.game.round;delete data.game.rankings;return {data,s};}
 it('按原始操作与骰子重建、核对局面后迁移，不改源文件',()=>{const {data,s}=legacy(),text=JSON.stringify(data);expect(loadGame(text)).toEqual(s);expect(replayGame(initial(),s.history)).toEqual(s);expect(JSON.stringify(data)).toBe(text);});
 it('不能核对的摆盘旧存档或已结束旧对局明确拒绝',()=>{const {data}=legacy();data.game.pieces[0].progress=20;expect(()=>loadGame(JSON.stringify(data))).toThrow(/验证迁移/);data.game.phase='over';expect(()=>loadGame(JSON.stringify(data))).toThrow(/已结束/);});
});
