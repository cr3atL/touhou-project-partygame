import { describe, expect, it } from 'vitest';
import { cameraArea, cameraScale, zoomAt, type Camera, type Bounds } from '../apps/web/src/boardViewport';
import { SIZE, PLAY_AREA, tilePolygon, type Point } from '../apps/web/src/boardModel';
import { NODES } from '../packages/core/map';

function mapPoint(camera: Camera, bounds: Bounds, point: Point) {
  const scale = cameraScale(camera.zoom, bounds);
  return { x: SIZE.width / 2 + camera.pan.x + (point.x - bounds.width / 2) / scale,
    y: SIZE.height / 2 + camera.pan.y + (point.y - bounds.height / 2) / scale };
}

describe('地图手势视口', () => {
  it('手机直接适配棋盘范围，完整容纳出场格并裁去桌面留白',()=>{
    const bounds={width:390,height:390*PLAY_AREA.height/PLAY_AREA.width},area=cameraArea(bounds);
    expect(area).toBe(PLAY_AREA);
    expect(cameraScale(1,bounds)).toBeGreaterThan(390/SIZE.width*1.25);
    for(const n of Object.values(NODES)){
      expect(n.tileX!-84).toBeGreaterThanOrEqual(area.x);
      expect(n.tileX!+84).toBeLessThanOrEqual(area.x+area.width);
      expect(n.y-104).toBeGreaterThanOrEqual(area.y);
      expect(n.tileY!+70).toBeLessThanOrEqual(area.y+area.height);
    }
    expect(cameraArea({width:1200,height:680})).toBe(PLAY_AREA);
  });
  it('切分地砖的可点击区域随移动端地砖一同放大',()=>{
    for(const id of ['G03','G04']){
      const n=NODES[id],original=tilePolygon(id)!.split(' ').map(p=>p.split(',').map(Number));
      const expanded=tilePolygon(id,1.35)!.split(' ').map(p=>p.split(',').map(Number));
      for(let i=0;i<original.length;i++){
        expect(expanded[i][0]-n.tileX!).toBeCloseTo((original[i][0]-n.tileX!)*1.35);
        expect(expanded[i][1]-n.tileY!).toBeCloseTo((original[i][1]-n.tileY!)*1.35);
      }
    }
  });
  it.each([{width:1200,height:680},{width:390,height:610},{width:844,height:250}])('缩放保留指尖下的地图位置：%o', bounds => {
    const camera = {zoom:1.4,pan:{x:100,y:-80}}, point={x:bounds.width*.65,y:bounds.height*.55};
    const anchor=mapPoint(camera,bounds,point);
    const next=zoomAt(camera,bounds,point,2.2);
    expect(mapPoint(next,bounds,point).x).toBeCloseTo(anchor.x);
    expect(mapPoint(next,bounds,point).y).toBeCloseTo(anchor.y);
  });
  it('从同一中心放大再缩小，不累计镜头偏移', () => {
    const camera={zoom:1.2,pan:{x:80,y:10}}, bounds={width:390,height:600}, point={x:210,y:310};
    const restored=zoomAt(zoomAt(camera,bounds,point,2),bounds,point,1.2);
    expect(restored.pan.x).toBeCloseTo(camera.pan.x);expect(restored.pan.y).toBeCloseTo(camera.pan.y);
  });
  it('限制手势的极端倍率和拖动边界', () => {
    const camera={zoom:1,pan:{x:0,y:0}}, bounds={width:390,height:600};
    expect(zoomAt(camera,bounds,{x:195,y:300},100).zoom).toBe(3);
    expect(zoomAt(camera,bounds,{x:195,y:300},.1).zoom).toBe(1);
    const next=zoomAt(camera,bounds,{x:10000,y:10000},3);
    expect(next.pan.x).toBeLessThanOrEqual(SIZE.width*.45);expect(next.pan.y).toBeLessThanOrEqual(SIZE.height*.45);
  });
});
