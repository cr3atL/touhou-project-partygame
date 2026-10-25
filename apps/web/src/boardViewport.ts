import { SIZE, type Point } from './boardModel';

export interface Camera { zoom: number; pan: Point }
export interface Bounds { width: number; height: number }
export function cameraScale(zoom: number, bounds: Bounds) {
  return Math.min(bounds.width / SIZE.width, bounds.height / SIZE.height) * zoom;
}
export function limitPan(pan: Point): Point {
  return { x: Math.max(-SIZE.width * .45, Math.min(SIZE.width * .45, pan.x)), y: Math.max(-SIZE.height * .45, Math.min(SIZE.height * .45, pan.y)) };
}
/** Fit spell subjects in the actual visible area, with space for tokens and floating controls. */
export function framePoints(points: Point[], bounds: Bounds): Camera | null {
  if (!points.length || bounds.width <= 0 || bounds.height <= 0) return null;
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const base = cameraScale(1, bounds);
  const zoom = Math.max(1, Math.min(3, bounds.width * .76 / ((maxX-minX+220)*base), bounds.height * .68 / ((maxY-minY+240)*base)));
  return { zoom, pan: limitPan({ x:(minX+maxX)/2-SIZE.width/2, y:(minY+maxY)/2-SIZE.height/2-30 }) };
}
/** Keep the same map point under the cursor or pinch midpoint, including letterboxing. */
export function zoomAt(camera: Camera, bounds: Bounds, point: Point, zoom: number): Camera {
  const next = Math.max(1, Math.min(3, zoom));
  const before = cameraScale(camera.zoom, bounds), after = cameraScale(next, bounds);
  return { zoom: next, pan: limitPan({
    x: camera.pan.x + (point.x - bounds.width / 2) * (1 / before - 1 / after),
    y: camera.pan.y + (point.y - bounds.height / 2) * (1 / before - 1 / after)
  }) };
}
