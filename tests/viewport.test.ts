import { describe, expect, it } from 'vitest';
import { cameraScale, zoomAt, type Camera, type Bounds } from '../apps/web/src/boardViewport';
import { SIZE, type Point } from '../apps/web/src/boardModel';

function mapPoint(camera: Camera, bounds: Bounds, point: Point) {
  const scale = cameraScale(camera.zoom, bounds);
  return { x: SIZE.width / 2 + camera.pan.x + (point.x - bounds.width / 2) / scale,
    y: SIZE.height / 2 + camera.pan.y + (point.y - bounds.height / 2) / scale };
}

describe('地图手势视口', () => {
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
