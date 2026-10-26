import {describe,it,expect} from 'vitest';
import {CHARACTERS} from '../packages/content';
import {assertGame,createGame,getActions,reduceGame} from '../packages/core/engine';
import {FINISH} from '../packages/core/constants';
import {progressAt} from '../packages/core/map';
import {saveGame,loadGame,replayGame} from '../packages/session';
import {DecisionClock} from '../packages/session/decisionClock';
import {previewAction} from '../apps/web/src/movePreview';
import {piecePoint,nodePoint} from '../apps/web/src/boardModel';
import {scenario} from './helpers/scenarios';

const roster=Object.values(CHARACTERS).slice(0,4).map((c,i)=>({name:`旅人${i+1}`,character:c.id}));
const opening=()=>createGame(roster,CHARACTERS,{opening:true});
const roll=(s:ReturnType<typeof opening>,face:number)=>reduceGame(s,{type:'roll'},CHARACTERS,()=>(face-.5)/6);

describe('v0.1.6 固定席位与行动顺序',()=>{
  it('开局逐席掷骰，按点数排序且不重排席位、名字或棋子',()=>{
    let s=opening();const players=structuredClone(s.players),pieces=structuredClone(s.pieces);
    for(const value of [2,6,4,1])s=roll(s,value);
    expect(s.turnOrder).toEqual([1,2,0,3]);expect(s.current).toBe(1);expect(s.phase).toBe('roll');
    expect(s.pieces).toEqual(pieces);expect(s.players.map(p=>({...p,turns:0}))).toEqual(players);
    expect(s.players.map(p=>p.id)).toEqual([0,1,2,3]);expect(s.players[1].turns).toBe(1);
    expect(s.flags.sixes).toBe(0);expect(s.dice).toBe(null);assertGame(s);
  });
  it('多个平点组依次重掷，重复平点继续重掷且不影响其他组',()=>{
    let s=opening();
    for(const value of [6,6,3,3])s=roll(s,value);
    expect(s.opening!.pending).toEqual([0,1]);
    s=roll(roll(s,2),2);expect(s.opening!.pending).toEqual([0,1]);
    s=roll(roll(s,1),6);expect(s.opening!.pending).toEqual([2,3]);
    s=roll(roll(s,5),2);
    expect(s.turnOrder).toEqual([1,0,2,3]);expect(s.phase).toBe('roll');
    expect(s.opening!.rolls).toHaveLength(10);expect(s.history).toHaveLength(10);
    expect(replayGame(opening(),s.history)).toEqual(s);
  });
  it('轮数按行动顺序回绕，已完成玩家被跳过',()=>{
    let s=scenario('marisa');s.turnOrder=[2,0,3,1];s.current=0;s.flags.active=true;s.dice={value:1,natural:1,source:'natural',extra:false};
    for(const p of s.pieces){p.progress=-1;p.mark=null;p.shield=null;}
    s=reduceGame(s,getActions(s,CHARACTERS).find(a=>a.kind==='move')!.command,CHARACTERS);
    expect(s.current).toBe(3);expect(s.round).toBe(1);
    s.phase='action';s.flags.active=true;s.dice={value:1,natural:1,source:'natural',extra:false};
    s.rankings=[1];s.winner=1;for(const p of s.pieces.filter(p=>p.owner===1))p.progress=FINISH;
    s=reduceGame(s,getActions(s,CHARACTERS).find(a=>a.kind==='move')!.command,CHARACTERS);
    expect(s.current).toBe(2);expect(s.round).toBe(2);assertGame(s);
  });
  it('开局每位玩家获得独立计时，预览与取消不延长普通回合',()=>{
    let s=opening();const clock=new DecisionClock(s.turn,0);
    expect(clock.update(s,20_000).remainingMs).toBe(40_000);
    s=roll(s,3);expect(clock.update(s,21_000).remainingMs).toBe(60_000);
    const action=scenario('marisa'),timer=new DecisionClock(action.turn,0);
    timer.update(action,10_000);previewAction(action,getActions(action,CHARACTERS).find(a=>a.kind==='move')!);
    expect(timer.update(action,20_000).remainingMs).toBe(40_000);
  });
  it('保存开局与非编号顺序，拒绝重复编号与非法顺序',()=>{
    const s=roll(opening(),2);expect(loadGame(saveGame(s))).toEqual(s);
    const bad=structuredClone(s);bad.turnOrder=[0,0,2,3];expect(()=>loadGame(saveGame(bad))).toThrow(/顺序/);
    const wrongSeat=structuredClone(s);wrongSeat.players[0].id=3;expect(()=>loadGame(saveGame(wrongSeat))).toThrow(/席位/);
    const badOpening=structuredClone(s);badOpening.opening!.pending=[1,1];expect(()=>loadGame(saveGame(badOpening))).toThrow(/开局/);
  });
  it('同地图 v0.1.5 存档保留席位并迁移默认行动顺序',()=>{
    const s=scenario('yukari'),data=JSON.parse(saveGame(s));
    data.format=5;data.rules='0.5.0';data.game.versions={rules:'0.5.0',map:'1.1.0',protocol:5,save:5};delete data.game.turnOrder;
    data.game.players[1].name='式神 2';data.game.players[1].bot=true;
    data.game.events.push({id:999,turn:1,type:'dice',text:'式神 2 掷出 3',pieces:[]});
    const loaded=loadGame(JSON.stringify(data));expect(loaded.turnOrder).toEqual([0,1,2,3]);expect(loaded.players[1].name).toBe('机器人 2');expect(loaded.pieces).toEqual(s.pieces);
    expect(loaded.events.at(-1)!.text).toBe('机器人 2 掷出 3');
  });
});

describe('v0.1.6 实际移动预览',()=>{
  it('七角色全部合法行动的预览与执行相同且不改原局面',()=>{
    for(const c of Object.values(CHARACTERS)){
      const s=scenario(c.id),before=saveGame(s);
      for(const a of getActions(s,CHARACTERS).filter(a=>a.kind==='move'||a.kind==='cast')){
        const preview=previewAction(s,a)!;expect(preview.after).toEqual(reduceGame(s,a.command,CHARACTERS));
        for(const route of preview.paths)expect(route.end).toEqual(piecePoint(preview.after.pieces.find(p=>p.id===route.piece)!));
      }
      expect(saveGame(s)).toBe(before);
    }
  });
  it('同色跳格和航线纳入完整路线，包括途经交叉撞击',()=>{
    const s=scenario('marisa');s.flags.active=true;s.dice={value:1,natural:1,source:'natural',extra:false};
    // Locate a flight using the engine rather than duplicating map constants.
    for(let progress=1;progress<50;progress++){
      s.pieces[0].progress=progress;
      const a=getActions(s,CHARACTERS).find(a=>a.kind==='move'&&a.pieces[0]==='p0-0')!;
      const p=previewAction(s,a)!;
      const flight=p.after.events.find(e=>e.id>s.eventId&&e.type==='move'&&e.text.includes('航线飞行'));
      if(!flight)continue;
      expect(p.paths[0].points).toContainEqual(nodePoint(flight.to!));
      expect(p.paths[0].points.length).toBeGreaterThan(2);return;
    }
    throw new Error('missing flight fixture');
  });
  it('终点折返路线经过终点并回到实际落点',()=>{
    const s=scenario('marisa');s.flags.active=true;s.pieces[0].progress=FINISH-1;
    s.dice={value:3,natural:3,source:'natural',extra:false};
    const a=getActions(s,CHARACTERS).find(a=>a.kind==='move'&&a.pieces[0]==='p0-0')!,p=previewAction(s,a)!;
    expect(p.summary).toContain('终点折返');expect(p.paths[0].points).toContainEqual(nodePoint('P1-F6'));
    expect(p.after.pieces[0].progress).toBe(FINISH-2);expect(p.paths[0].points.at(-1)).toEqual(p.paths[0].end);
  });
  it('撞毁、保护、同归于尽标记实际受影响棋子和最终返航',()=>{
    const s=scenario('marisa');s.flags.active=true;s.pieces[0].progress=9;
    s.dice={value:1,natural:1,source:'natural',extra:false};
    let a=getActions(s,CHARACTERS).find(a=>a.kind==='move'&&a.pieces[0]==='p0-0')!;
    const landing=a.nodes.at(-1)!;
    for(const id of ['p1-0','p1-1','p2-0']){const p=s.pieces.find(p=>p.id===id)!;p.progress=progressAt(p.owner,landing);p.branch='ground';}
    s.pieces.find(p=>p.id==='p2-0')!.shield=99;
    a=getActions(s,CHARACTERS).find(a=>a.kind==='move'&&a.pieces[0]==='p0-0')!;
    const p=previewAction(s,a)!;
    expect(p.summary).toContain('撞毁 2 枚');expect(p.summary).toContain('同归于尽');expect(p.summary).toContain('触发保护');
    expect(p.impacts.filter(i=>i.kind==='return').map(i=>i.piece).sort()).toEqual(['p0-0','p1-0','p1-1']);
    expect(p.after.pieces[0].progress).toBe(-1);expect(p.paths.find(p=>p.piece==='p0-0')!.end).toEqual(piecePoint(p.after.pieces[0]));
  });
  it('预览停在被动技能选择处，未选择前不假定技能发生',()=>{
    const s=scenario('reimu');s.flags.active=true;s.pieces[0].progress=1;s.pieces[0].mark=null;
    s.dice={value:1,natural:1,source:'natural',extra:false};
    let found=false;
    for(let progress=1;progress<50;progress++){
      s.pieces[0].progress=progress;
      const a=getActions(s,CHARACTERS).find(a=>a.kind==='move'&&a.pieces[0]==='p0-0')!,p=previewAction(s,a)!;
      if(!p.after.choice)continue;
      expect(p.after.phase).toBe('resolving');expect(getActions(p.after,CHARACTERS).every(a=>a.kind==='choose')).toBe(true);found=true;break;
    }
    expect(found).toBe(true);
    expect(s.history).toHaveLength(0);
  });
  it('失效选项安全清除，不将旧选择用于新局面',()=>{
    const s=scenario('marisa'),a=getActions(s,CHARACTERS).find(a=>a.kind==='move')!;
    const next=reduceGame(s,a.command,CHARACTERS);expect(previewAction(next,a)).toBe(null);
  });
});
