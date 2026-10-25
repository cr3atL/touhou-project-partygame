import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../packages/content';
import { getActions, reduceGame } from '../packages/core/engine';
import { scenario } from '../packages/session/scenarios';
import { presentationBeat, SPELL_FLIGHT_MS, spellPieceMotion, spellSequence } from '../apps/web/src/presentationModel';
import { framePoints, cameraScale } from '../apps/web/src/boardViewport';
import { piecePoint, SIZE } from '../apps/web/src/boardModel';

describe('符卡演出取景', () => {
  it.each(['reimu','marisa','yukari','remilia','flandre','yuyuko','youmu'] as const)('%s 只展示本次施放事件，不修改规则状态', id => {
    const before = scenario(id), original = structuredClone(before);
    const cast = getActions(before, CHARACTERS).find(a => a.kind === 'cast')!;
    const after = reduceGame(before, cast.command, CHARACTERS);
    const beat = presentationBeat(before, after);
    expect(beat.spell?.character).toBe(id);
    expect(beat.events.every(e => e.id > before.eventId)).toBe(true);
    expect(before).toEqual(original);
    expect(spellSequence(beat) === null).toBe(id === 'remilia');
    expect(presentationBeat(after, after).spell).toBeNull();
  });
  it('先取景施放者，再依结算顺序跟随两个目标，给击退和落点特效留下时间', () => {
    const before = scenario('marisa');
    const cast = getActions(before, CHARACTERS).find(a => a.kind === 'cast' && a.pieces.length === 3)!;
    const after = reduceGame(before, cast.command, CHARACTERS);
    const beat = presentationBeat(before, after);
    expect(beat.spell!.pieces).toEqual(expect.arrayContaining(cast.pieces));
    const sequence=spellSequence(beat)!;
    expect(sequence.origin).toEqual(piecePoint(before.pieces.find(p=>p.id===sequence.caster)!));
    expect(sequence.targets.map(t=>t.piece)).toEqual(cast.command.type==='cast'?cast.command.targets:[]);
    expect(sequence.targets).toHaveLength(2);
    for(const target of sequence.targets) {
      expect(target.impact-target.launch).toBe(SPELL_FLIGHT_MS);
      expect(spellPieceMotion(beat,target.piece).delay).toBe(target.impact);
      expect(sequence.duration).toBeGreaterThanOrEqual(target.impact+480+400);
    }
    expect(sequence.targets[1].launch).toBeGreaterThan(sequence.targets[0].impact);
  });
  it('莱瓦汀先支付自身后退；回机场快照不会把特写带到机场', () => {
    const before=scenario('flandre');
    const cast=getActions(before,CHARACTERS).find(a=>a.kind==='cast'&&a.pieces.includes('p1-0'))!;
    const after=reduceGame(before,cast.command,CHARACTERS);
    // Exercise the presentation's return-to-airport framing independently of knockback rules.
    after.pieces.find(p=>p.id==='p1-0')!.progress=-1;
    const beat=presentationBeat(before,after);
    const sequence=spellSequence(beat)!,target=sequence.targets[0];
    const cost=spellPieceMotion(beat,sequence.caster);
    expect(cost.delay+cost.duration).toBeLessThanOrEqual(target.launch);
    expect(beat.after.pieces.find(p=>p.id===target.piece)!.progress).toBe(-1);
    expect(target.to).toEqual(target.from);
    expect(target.to).not.toEqual(piecePoint(beat.after.pieces.find(p=>p.id===target.piece)!));
  });
  it('没有独立施法棋子的二重结界仍保留所有己方目标', () => {
    const before=scenario('reimu');
    const cast=getActions(before,CHARACTERS).find(a=>a.kind==='cast'&&a.pieces.length===2)!;
    const beat=presentationBeat(before,reduceGame(before,cast.command,CHARACTERS));
    expect(spellSequence(beat)!.targets.map(t=>t.piece)).toEqual(cast.pieces);
  });
  it.each([{width:1200,height:680},{width:390,height:610},{width:844,height:250}])('在实际屏幕比例内完整取景：%o', bounds => {
    const points = [{x:1020,y:800},{x:1410,y:980}];
    const camera = framePoints(points, bounds)!;
    const scale = cameraScale(camera.zoom,bounds);
    for (const p of points) {
      const x = bounds.width/2+(p.x-SIZE.width/2-camera.pan.x)*scale;
      const y = bounds.height/2+(p.y-SIZE.height/2-camera.pan.y)*scale;
      expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(bounds.width);
      expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(bounds.height);
    }
  });
  it('无地图目标不移动镜头；分散目标保持完整取景', () => {
    expect(framePoints([],{width:390,height:600})).toBeNull();
    const camera=framePoints([{x:200,y:200},{x:2300,y:1500}],{width:390,height:600})!;
    expect(camera.zoom).toBe(1);
  });
});
