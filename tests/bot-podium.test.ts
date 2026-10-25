import { FINISH,LAST_PUBLIC,HOME_START } from '../packages/core/constants';
import {describe,it,expect} from 'vitest';
import {CHARACTERS} from '../packages/content';
import {createGame,getActions,reduceGame,assertGame} from '../packages/core/engine';
import {botAction,loadGame,saveGame,replayGame} from '../packages/session';
import {returnRisk} from '../packages/session/bot';
import {scenario,finishScenario,podiumScenario} from './helpers/scenarios';
import {progressAt} from '../packages/core/map';
import type {CharacterId,GameState} from '../packages/core/types';
import recorded from './fixtures/bot-round59.json';
function empty(character:CharacterId='marisa',die=2){const s=scenario(character);for(const p of s.pieces){p.progress=-1;p.branch=null;p.mark=null;p.shield=null;}s.dice={value:die,natural:die,source:'natural',extra:die===6};return s;}
const put=(s:GameState,id:string,p:number)=>{const piece=s.pieces.find(q=>q.id===id)!;piece.progress=p;piece.branch='ground';return piece;};
const at=(s:GameState,id:string,node:string)=>put(s,id,progressAt(Number(id[1]),node));
const step=(s:GameState,id='p0-0')=>reduceGame(s,getActions(s,CHARACTERS).find(a=>a.kind==='move'&&a.pieces[0]===id)!.command,CHARACTERS);
function placed(s:GameState,ids:number[]){for(const id of ids)for(const p of s.pieces.filter(p=>p.owner===id)){p.progress=FINISH;p.mark=null;p.shield=null;}s.rankings=ids;s.winner=ids[0]??null;}

describe('式神目标与风险',()=>{
 it('旧地图的机器人记录不能作为新对局载入',()=>{expect(()=>loadGame(JSON.stringify({format:3,rules:'0.4.1',game:recorded}))).toThrow(/不兼容/);});
 it('已有领先棋时低骰不机械出场',()=>{const s=empty('marisa',1);put(s,'p0-0',37);expect(botAction(s).pieces[0]).toBe('p0-0');});
 it('没有在场可动棋时仍能正常出场',()=>{const s=empty();expect(botAction(s).kind).toBe('move');expect(botAction(s).label).toContain('出场');});
 it('能精确完成时优先完成',()=>{const s=empty('marisa',1);put(s,'p0-0',FINISH-1);put(s,'p0-1',0);at(s,'p1-0','G01');expect(botAction(s).nodes).toEqual(['done-0']);});
 it('前进可进入私人安全区时优先进入',()=>{const s=empty('marisa',6);put(s,'p0-0',LAST_PUBLIC-3);put(s,'p0-1',0);at(s,'p1-0','G06');expect(botAction(s).pieces[0]).toBe('p0-0');});
 it('相同骰面有多枚敌棋可撞击时不重复计算概率；保护吸收一次',()=>{const s=empty();put(s,'p0-0',21);at(s,'p1-0','G19');at(s,'p1-1','G19');expect(returnRisk(s,s.pieces[0])).toBeCloseTo(1/6);at(s,'p1-1','G18');expect(returnRisk(s,s.pieces[0])).toBeCloseTo(2/6);s.pieces[0].shield=2;expect(returnRisk(s,s.pieces[0])).toBeCloseTo(0);});
 it('式神考虑自动跳格后的最终落点',()=>{const s=empty('yukari',1);s.flags.active=true;put(s,'p0-0',5);at(s,'p1-0','G09');expect(botAction(s).pieces[0]).toBe('p0-0');expect(botAction(s).nodes).toEqual(['G09']);});
 it('蕾米可用改点也计入风险，冷却中不假设可用',()=>{const s=empty();s.players[1].character='remilia';s.players[3].character='reimu';put(s,'p0-0',21);at(s,'p1-0','G19');expect(returnRisk(s,s.pieces[0])).toBeCloseTo(2/6);s.players[1].activeAt=99;expect(returnRisk(s,s.pieces[0])).toBeCloseTo(1/6);});
 it('式神避免无保护时撞毁叠棋导致成熟棋返航',()=>{const s=empty('yukari',1);s.flags.active=true;put(s,'p0-0',40);put(s,'p0-1',10);at(s,'p1-0','G40');at(s,'p1-1','G40');expect(botAction(s).pieces[0]).toBe('p0-1');});
 it('式神风险评估包含航线对私人终点道的撞击',()=>{const s=empty('marisa',1);s.pieces.find(p=>p.id==='p0-0')!.progress=HOME_START+2;put(s,'p2-0',17);expect(returnRisk(s,s.pieces[0])).toBeGreaterThan(0);});
 it('式神考虑从独立出场格进入主路的撞击威胁',()=>{const s=empty();put(s,'p0-0',14);put(s,'p1-0',0);expect(returnRisk(s,s.pieces[0])).toBeCloseTo(1/6);});
 it('无实际保护收益时保留主动冷却，评估不修改原局面',()=>{const s=empty('reimu',3);put(s,'p0-0',10);const before=saveGame(s);expect(botAction(s).kind).toBe('move');expect(saveGame(s)).toBe(before);});
});
describe('前三名赛程',()=>{
 it('第一名完成即退出行动，六点追加也不继续；其他人继续',()=>{const s=finishScenario();s.dice!.natural=6;s.dice!.extra=true;const n=step(s);expect(n.rankings).toEqual([0]);expect(n.winner).toBe(0);expect(n.phase).toBe('roll');expect(n.current).toBe(1);expect(n.dice).toBeNull();expect(n.events.some(e=>e.type==='extra')).toBe(false);assertGame(n);});
 it('第二名完成保留第一名，下一回合跳过已经完成的玩家',()=>{const s=finishScenario();placed(s,[1]);const n=step(s);expect(n.rankings).toEqual([1,0]);expect(n.winner).toBe(1);expect(n.current).toBe(2);expect(n.phase).toBe('roll');assertGame(n);});
 it('第三名完成才结束，剩余玩家自动为第四，不伪造其完成',()=>{const s=podiumScenario(),n=step(s);expect(n.rankings).toEqual([1,2,0]);expect(n.phase).toBe('over');expect(n.pieces.filter(p=>p.owner===3).every(p=>p.progress<FINISH)).toBe(true);expect(getActions(n,CHARACTERS)).toEqual([]);expect(n.queue).toEqual([]);assertGame(n);});
 it('跳过名次玩家不刷新其回合或冷却，跨席位回绕时轮数正确',()=>{let s=empty('marisa',2);placed(s,[1]);const turns=s.players[1].turns;s=step(s);expect(s.current).toBe(2);expect(s.round).toBe(1);s=reduceGame(s,{type:'roll'},CHARACTERS,()=>.2);s=step(s,'p2-0');s=reduceGame(s,{type:'roll'},CHARACTERS,()=>.2);s=step(s,'p3-0');expect(s.current).toBe(0);expect(s.round).toBe(2);expect(s.players[1].turns).toBe(turns);});
 it('前三顺序与剩余赛程能存取，伪造名次会被拒绝',()=>{const s=step(finishScenario());expect(loadGame(saveGame(s))).toEqual(s);const bad=structuredClone(s);bad.rankings.push(1);expect(()=>loadGame(saveGame(bad))).toThrow();});
});
describe('旧存档隔离',()=>{
 it('规则和地图升级时拒绝旧版本且保留原文本',()=>{const s=finishScenario(),data=JSON.parse(saveGame(s));data.format=3;data.rules='0.4.1';data.game.versions={rules:'0.4.1',map:'0.1.0',protocol:3,save:3};const text=JSON.stringify(data);expect(()=>loadGame(text)).toThrow(/不兼容/);expect(JSON.stringify(data)).toBe(text);});
});
