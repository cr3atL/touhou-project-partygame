import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {CHARACTERS} from '../packages/content';
import {getActions,reduceGame} from '../packages/core/engine';
import {MAP,NODES,nodeAt} from '../packages/core/map';
import original from './fixtures/map-topology.json';
import {scenario,mapScenario,finishScenario} from '../packages/session/scenarios';
import {actionsForPiece,destinationActions,pieceGroups,displayPoint,nodePoint,eventTravelPoints} from '../apps/web/src/boardModel';

describe('精确地图与地图操作',()=>{
  it('地图完整保留连边、赛程与地形，并展示全部节点',()=>{
    expect(MAP.edges).toEqual(original.edges);
    expect(MAP.nodes.map(({id,terrain})=>({id,terrain}))).toEqual(original.nodes.map(({id,terrain})=>({id,terrain})));
    expect(NODES.G00).toMatchObject({x:2050,y:1080});
    const svg=readFileSync('public/maps/board.svg','utf8');
    for(const node of MAP.nodes) expect(svg).toContain(`data-node="${node.id}"`);
    expect(MAP.nodes).toHaveLength(77);expect(MAP.edges).toHaveLength(78);
  });
  it('单结果出场可直接提交；新版减速落点映射到可点击落点',()=>{
    const s=scenario('reimu'), moves=getActions(s,CHARACTERS).filter(a=>a.kind==='move');
    const spawn=actionsForPiece(moves,'p0-2');expect(spawn).toHaveLength(1);
    expect(reduceGame(s,spawn[0].command,CHARACTERS).pieces.find(p=>p.id==='p0-2')!.progress).toBe(0);
    const options=actionsForPiece(moves,'p0-0');expect(options.map(a=>a.nodes[0]).sort()).toEqual(['G11']);
    for(const a of options) expect(destinationActions(options,a.nodes[0])).toEqual([a]);
  });
  it('分支落点、逻辑位置和动画使用相同节点，包含落点迷雾返回',()=>{
    const s=mapScenario('branch'), options=actionsForPiece(getActions(s,CHARACTERS).filter(a=>a.kind==='move'),'p0-0');
    expect(options.map(a=>a.nodes[0])).toEqual(['G31','R31']);
    const a=destinationActions(options,'R31')[0], next=reduceGame(s,a.command,CHARACTERS), piece=next.pieces[0];
    expect(nodeAt(piece)).toBe('R30');
    expect(eventTravelPoints(s,next,piece)).toEqual([NODES.G28,NODES.R29,NODES.R30,NODES.R31,NODES.R30]);
  });
  it('多棋落点暂停撞击，逐枚选择且不连带处理同格棋子',()=>{
    const s=mapScenario('stack'), groups=pieceGroups(s), node=groups.get('G03')!;
    expect(node).toHaveLength(4);const logical=node.map(p=>nodeAt(p));
    node.forEach(p=>displayPoint(p,groups));expect(node.map(p=>nodeAt(p))).toEqual(logical);
    const move=actionsForPiece(getActions(s,CHARACTERS).filter(a=>a.kind==='move'),'p0-0').find(a=>a.kind==='move')!;
    const arrived=reduceGame(s,move.command,CHARACTERS);expect(arrived.choice?.kind).toBe('collision');
    expect(pieceGroups(arrived).get('G03')).toHaveLength(5);
    const target=actionsForPiece(getActions(arrived,CHARACTERS),'p1-1');expect(target).toHaveLength(1);
    const next=reduceGame(arrived,target[0].command,CHARACTERS);
    expect(next.pieces.find(p=>p.id==='p1-1')).toMatchObject({progress:39,shield:null});
    expect(next.pieces.find(p=>p.id==='p1-0')!.progress).toBe(39);
    expect(next.pieces.find(p=>p.id==='p2-0')!.progress).toBe(27);
  });
  it('完成落点显示在本席 F6，单次走棋立即判胜',()=>{
    const s=finishScenario(), a=actionsForPiece(getActions(s,CHARACTERS).filter(a=>a.kind==='move'),'p0-0');
    expect(a).toHaveLength(1);expect(a[0].nodes).toEqual(['done-0']);
    expect(nodePoint(a[0].nodes[0])).toBe(NODES['P1-F6']);
    expect(reduceGame(s,a[0].command,CHARACTERS).winner).toBe(0);
  });
});
